export const PROFILE_AVATAR_KEY = "atelier.profile.avatar.v1";

export function normalizeProfileAvatar(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 1 && index <= 9 ? index : 1;
}

export function loadProfileAvatar(storage = globalThis.localStorage) {
  try { return normalizeProfileAvatar(storage?.getItem(PROFILE_AVATAR_KEY)); }
  catch { return 1; }
}

export function saveProfileAvatar(value, storage = globalThis.localStorage) {
  const index = normalizeProfileAvatar(value);
  const previous = loadProfileAvatar(storage);
  try {
    storage?.setItem(PROFILE_AVATAR_KEY, String(index));
    if (normalizeProfileAvatar(storage?.getItem(PROFILE_AVATAR_KEY)) !== index) throw new Error("avatar_read_back_mismatch");
    globalThis.dispatchEvent?.(new CustomEvent("atelier-persistence", { detail: { state: "saved_local", evidence: { durable: true, scope: "device" } } }));
    return index;
  } catch (error) {
    globalThis.dispatchEvent?.(new CustomEvent("atelier-persistence", { detail: { state: "retryable_error", evidence: { durable: false }, error: "avatar_save_failed" } }));
    return previous;
  }
}
