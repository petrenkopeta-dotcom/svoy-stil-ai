import { AUTH_STATES } from "./auth/AuthPort.js";
export const PERSONAL_ACTIONS = Object.freeze(["wardrobe", "photo", "save_outfit", "history", "feedback", "learning", "privacy", "profile", "shopping"]);
export function createAuthGate({ getAuthState, requestAuthentication }) {
  return function guard(action, callback) {
    if (!PERSONAL_ACTIONS.includes(action)) return callback();
    if (getAuthState()?.status === AUTH_STATES.AUTHENTICATED) return callback();
    requestAuthentication({ action, callback });
    return { status: "authentication_required", action };
  };
}
