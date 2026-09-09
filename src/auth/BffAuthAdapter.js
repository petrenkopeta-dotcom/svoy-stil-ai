import { AUTH_ERROR_CODES, AuthPortError } from "./AuthPort.js";

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const validSession = (value) => isObject(value) && typeof value.userId === "string" && typeof value.email === "string" && Number.isFinite(Number(value.expiresAt));

export function createBffAuthAdapter({ baseUrl = "", fetchFn = globalThis.fetch } = {}) {
  const request = async (path, body, { allowSignedOut = false, validate = isObject } = {}) => {
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, { method: body ? "POST" : "GET", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Intent": "ai-stylist" }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new AuthPortError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE);
    }
    if (response.status === 401 && allowSignedOut) return null;
    let payload;
    try { payload = await response.json(); } catch { throw new AuthPortError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE); }
    if (response.status === 401) throw Object.assign(new AuthPortError(AUTH_ERROR_CODES.EXPIRED), { code: "session_expired" });
    if (!response.ok) {
      const code = payload?.code === AUTH_ERROR_CODES.RATE_LIMITED ? AUTH_ERROR_CODES.RATE_LIMITED : payload?.code === AUTH_ERROR_CODES.OFFLINE ? AUTH_ERROR_CODES.OFFLINE : AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE;
      throw new AuthPortError(code);
    }
    if (!validate(payload)) throw new AuthPortError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE);
    return payload;
  };
  return {
    async probe() { await request("/api/auth/session", undefined, { allowSignedOut: true, validate: validSession }); return { status: "available" }; },
    sendCode: ({ email }) => request("/api/auth/otp", { email }, { validate: (payload) => payload?.status === "code_sent" }),
    verifyCode: ({ email, code }) => request("/api/auth/verify", { email, code }, { validate: validSession }),
    getSession: () => request("/api/auth/session", undefined, { validate: validSession }),
    logout: () => request("/api/auth/logout", {}, { validate: (payload) => payload?.status === "signed_out" }),
    authenticatedRequest: ({ method, path, body, headers, rawBody, returnResponse }) => {
      if (rawBody || returnResponse) throw new AuthPortError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE);
      return request(`/api/provider${path}`, { method, body, headers });
    },
  };
}
