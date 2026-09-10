import { randomUUID } from "node:crypto";
import { verifyVkLaunch } from "./vkAuth.mjs";

/** Separate Russian backend contract. No Supabase or external photo forwarding. */
export function createStagingApi({ db, sessions, origin, secret, appId, now = Date.now, budgetAllowed = () => false }) {
  if (sessions?.durable !== true || !origin?.startsWith("https://")) throw new Error("staging_configuration_required");
  db.exec("CREATE TABLE IF NOT EXISTS staging_wardrobe (owner TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const reply = (status, value, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...headers } });
  return async (request) => {
    try {
      if (await budgetAllowed() !== true) return reply(503, { code: "staging_budget_blocked" });
      const url = new URL(request.url);
      if (url.search) return reply(400, { code: "query_not_allowed" });
      if (request.method !== "GET" && (request.headers.get("origin") !== origin || request.headers.get("x-csrf-intent") !== "ai-stylist")) return reply(403, { code: "origin_rejected" });
      if (url.pathname === "/api/staging/vk-session" && request.method === "POST") {
        const launch = await request.text();
        const identity = verifyVkLaunch(launch, { secret, appId, now: now() });
        const id = randomUUID();
        await sessions.put(id, { ...identity, expiresAt: Math.floor(now() / 1000) + 3600 });
        return reply(200, { userId: identity.userId }, { "Set-Cookie": `stylist_vk=${id}; Path=/api/staging; HttpOnly; Secure; SameSite=None; Max-Age=3600` });
      }
      const id = request.headers.get("cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith("stylist_vk="))?.slice(11);
      const session = id && await sessions.get(id);
      if (!session || session.expiresAt * 1000 <= now()) return reply(401, { code: "session_required" });
      if (url.pathname === "/api/staging/logout" && request.method === "POST") {
        await sessions.delete(id);
        return reply(200, { signedOut: true }, { "Set-Cookie": "stylist_vk=; Path=/api/staging; HttpOnly; Secure; SameSite=None; Max-Age=0" });
      }
      if (url.pathname === "/api/staging/wardrobe" && request.method === "GET") {
        const row = db.prepare("SELECT value FROM staging_wardrobe WHERE owner=?").get(session.userId);
        return reply(200, { items: row ? JSON.parse(row.value) : [] });
      }
      if (url.pathname === "/api/staging/wardrobe" && request.method === "PUT") {
        const raw = await request.text();
        if (raw.length > 16384) return reply(413, { code: "request_too_large" });
        const items = JSON.parse(raw);
        // A narrow metadata-only schema prevents photo/base64 persistence bypass.
        if (!Array.isArray(items) || items.length > 100 || items.some((item) => !item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["id", "category", "color"].includes(key)) || ![item.id, item.category, item.color].every((value) => typeof value === "string" && /^[\p{L}\p{N} _-]{1,64}$/u.test(value)))) return reply(422, { code: "invalid_wardrobe" });
        db.prepare("INSERT OR REPLACE INTO staging_wardrobe VALUES (?,?)").run(session.userId, JSON.stringify(items));
        return reply(200, { saved: true });
      }
      return reply(404, { code: "route_unavailable" });
    } catch { return reply(400, { code: "request_rejected" }); }
  };
}
