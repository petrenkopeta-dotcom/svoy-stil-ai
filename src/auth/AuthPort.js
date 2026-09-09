export const AUTH_STATES = Object.freeze({
  RESTORE_PENDING: "restore_pending",
  SIGNED_OUT: "signed_out",
  CODE_SENDING: "code_sending",
  CODE_SENT: "code_sent",
  VERIFYING: "verifying",
  AUTHENTICATED: "authenticated",
  EXPIRED: "expired",
  RATE_LIMITED: "rate_limited",
  OFFLINE: "offline",
  ERROR: "error",
  SESSION_EXPIRED: "session_expired",
});

export const AUTH_ERROR_CODES = Object.freeze({
  INVALID_EMAIL: "invalid_email",
  INVALID_CODE: "invalid_code",
  EXPIRED: "expired",
  RATE_LIMITED: "rate_limited",
  OFFLINE: "offline",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown",
});

export class AuthPortError extends Error {
  constructor(code, message = code, details = {}) {
    super(message);
    this.name = "AuthPortError";
    this.code = code;
    this.details = details;
  }
}

export function assertAuthPort(port) {
  for (const method of ["sendCode", "verifyCode", "getSession", "logout"]) {
    if (typeof port?.[method] !== "function") throw new TypeError(`AuthPort.${method} is required`);
  }
  return port;
}

export function unavailableAuthPort() {
  const unavailable = async () => { throw new AuthPortError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE); };
  return { sendCode: unavailable, verifyCode: unavailable, getSession: async () => null, logout: async () => {} };
}
