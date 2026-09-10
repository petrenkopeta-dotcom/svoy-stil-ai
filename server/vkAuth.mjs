import { createHmac, timingSafeEqual } from "node:crypto";

// Signing algorithm: VKCOM/vk-apps-launch-params/examples/node.js.
// TTL, duplicate rejection and app binding are additional server policy.
export function verifyVkLaunch(raw, { secret, appId, now = Date.now(), maxAgeSeconds = 300 } = {}) {
  const deny = () => { throw new Error("invalid_vk_launch"); };
  if (typeof secret !== "string" || secret.length < 16 || !/^[1-9]\d*$/.test(String(appId)) || typeof raw !== "string" || raw.length > 8192) deny();
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  for (const key of params.keys()) if (params.getAll(key).length !== 1) deny();
  const sign = params.get("sign");
  if (!/^[A-Za-z0-9_-]{43}$/.test(sign || "")) deny();
  const canonical = [...params].filter(([key]) => /^vk_/.test(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  const expected = createHmac("sha256", secret).update(canonical).digest("base64url");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sign))) deny();
  if (params.get("vk_app_id") !== String(appId) || !/^[1-9]\d*$/.test(params.get("vk_user_id") || "")) deny();
  if (!/^\d+$/.test(params.get("vk_ts") || "")) deny();
  const age = Math.floor(now / 1000) - Number(params.get("vk_ts"));
  if (!Number.isSafeInteger(age) || age < -30 || age > maxAgeSeconds) deny();
  return Object.freeze({ userId: `vk:${appId}:${params.get("vk_user_id")}` });
}
