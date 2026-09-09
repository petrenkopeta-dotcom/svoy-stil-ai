import { AUTH_STATES } from "./auth/AuthPort.js";
export const PUBLIC_SCREENS = new Set(["test", "first-result", "wardrobe"]);
export function screenForAuth(screen, authState) { return authState?.status === AUTH_STATES.AUTHENTICATED || PUBLIC_SCREENS.has(screen) ? screen : "wardrobe"; }
export function catalogForAuth(personal, demo, authState) { return authState?.status === AUTH_STATES.AUTHENTICATED ? personal : demo; }
