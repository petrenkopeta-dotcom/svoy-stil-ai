function decodeJwtPayload(token) {
  try { return JSON.parse(globalThis.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
}
export function diagnoseAuthConfig({ url, publishableKey } = {}) {
  const result = { configured: false, urlPresent: Boolean(url), keyPresent: Boolean(publishableKey), reason: null };
  if (!url || !publishableKey) return { ...result, reason: "missing" };
  let parsed; try { parsed = new URL(url); } catch { return { ...result, reason: "malformed_url" }; }
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) return { ...result, reason: "insecure_url" };
  const payload = publishableKey.includes(".") ? decodeJwtPayload(publishableKey) : null;
  if (payload?.role === "service_role" || /^sb_secret_/i.test(publishableKey)) return { ...result, reason: "forbidden_secret_key" };
  if (!(publishableKey.length >= 20 || /^sb_publishable_/i.test(publishableKey))) return { ...result, reason: "malformed_key" };
  return { ...result, configured: true, reason: null };
}
