import { AUTH_ERROR_CODES, AUTH_STATES, AuthPortError, assertAuthPort } from "./AuthPort.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const publicState = (state) => structuredClone(state);
const publicSession = (session) => session ? { userId: session.userId, email: session.email, expiresAt: session.expiresAt ?? null } : null;

function stateForError(error, now) {
  const knownCodes = new Set(Object.values(AUTH_ERROR_CODES));
  const code = error instanceof AuthPortError || knownCodes.has(error?.code) ? error.code : AUTH_ERROR_CODES.UNKNOWN;
  if (code === AUTH_ERROR_CODES.EXPIRED) return { status: AUTH_STATES.EXPIRED, error: code };
  if (code === AUTH_ERROR_CODES.RATE_LIMITED) return { status: AUTH_STATES.RATE_LIMITED, error: code, retryAt: error.details?.retryAt || now() };
  if (code === AUTH_ERROR_CODES.OFFLINE) return { status: AUTH_STATES.OFFLINE, error: code };
  if (code === AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE) return { status: AUTH_STATES.ERROR, error: code };
  return { status: AUTH_STATES.ERROR, error: code };
}

export function createAuthRepository({ port, now = () => Date.now(), codeTtlMs = 10 * 60_000, resendMs = 60_000, onChange = () => {} } = {}) {
  assertAuthPort(port);
  let state = { status: AUTH_STATES.SIGNED_OUT, email: null, session: null, expiresAt: null, resendAt: null, error: null };
  let operation = null;
  let operationId = 0;
  const publish = (patch) => { state = { ...state, ...patch }; onChange(publicState(state)); return publicState(state); };
  const runOnce = (kind, work) => {
    if (operation?.kind === kind) return operation.promise;
    if (operation) operation.cancelled = true;
    const active = { kind, id: ++operationId, cancelled: false };
    active.promise = Promise.resolve().then(() => work(active)).finally(() => { if (operation === active) operation = null; });
    operation = active;
    return active.promise;
  };

  return {
    getState: () => publicState(state),
    async restore() {
      publish({status:AUTH_STATES.RESTORE_PENDING,error:null});
      try { const session = await port.getSession();
      return session ? publish({ status: AUTH_STATES.AUTHENTICATED, session: publicSession(session), email: session.email, error: null }) : publish({ status: AUTH_STATES.SIGNED_OUT, session: null }); }
      catch(error){const next=stateForError(error,now);return publish({status:error?.code==="session_expired"?AUTH_STATES.SESSION_EXPIRED:next.status,session:null,error:error?.code==="session_expired"?"session_expired":next.error});}
    },
    sendCode(input) {
      const email = normalizeEmail(input);
      if (!EMAIL.test(email)) return Promise.resolve(publish({ status: AUTH_STATES.ERROR, email, error: AUTH_ERROR_CODES.INVALID_EMAIL }));
      if (state.resendAt && now() < state.resendAt && state.email === email) {
        return Promise.resolve(publish({ status: AUTH_STATES.RATE_LIMITED, error: AUTH_ERROR_CODES.RATE_LIMITED, retryAt: state.resendAt }));
      }
      return runOnce(`send:${email}`, async (active) => {
        publish({ status: AUTH_STATES.CODE_SENDING, email, session: null, error: null });
        try {
          await port.sendCode({ email, idempotencyKey: `otp-send:${email}:${operationId}` });
          if (active.cancelled) throw new AuthPortError(AUTH_ERROR_CODES.CANCELLED);
          return publish({ status: AUTH_STATES.CODE_SENT, expiresAt: now() + codeTtlMs, resendAt: now() + resendMs, error: null });
        } catch (error) { return publish({ ...stateForError(error, now), session: null }); }
      });
    },
    verifyCode(codeInput) {
      const code = String(codeInput || "").replace(/\D/g, "");
      if (state.expiresAt && now() >= state.expiresAt) return Promise.resolve(publish({ status: AUTH_STATES.EXPIRED, error: AUTH_ERROR_CODES.EXPIRED }));
      if (!state.email || !/^\d{6}$/.test(code)) return Promise.resolve(publish({ status: AUTH_STATES.ERROR, error: AUTH_ERROR_CODES.INVALID_CODE }));
      return runOnce(`verify:${state.email}:${code}`, async (active) => {
        publish({ status: AUTH_STATES.VERIFYING, error: null });
        try {
          const providerSession = await port.verifyCode({ email: state.email, code, idempotencyKey: `otp-verify:${state.email}:${operationId}` });
          if (active.cancelled) throw new AuthPortError(AUTH_ERROR_CODES.CANCELLED);
          const session = publicSession(providerSession);
          return publish({ status: AUTH_STATES.AUTHENTICATED, email: session.email || state.email, session, expiresAt: null, resendAt: null, error: null });
        } catch (error) { return publish({ ...stateForError(error, now), session: null }); }
      });
    },
    cancel() { if (operation) operation.cancelled = true; operationId += 1; },
    async logout() {
      if (operation) operation.cancelled = true;
      await port.logout();
      return publish({ status: AUTH_STATES.SIGNED_OUT, email: null, session: null, expiresAt: null, resendAt: null, retryAt: null, error: null });
    },
  };
}
