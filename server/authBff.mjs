import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status, payload, headers = {}) => new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...headers } });
const cookieValue = (request, name) => request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const sessionCookie = (id, secure) => [`ai_stylist_session=${id}`, "Path=/", "HttpOnly", "SameSite=Lax", secure ? "Secure" : ""].filter(Boolean).join("; ");
const expiredCookie = (secure) => [`ai_stylist_session=`, "Path=/", "HttpOnly", "SameSite=Lax", secure ? "Secure" : "", "Max-Age=0"].filter(Boolean).join("; ");

export function createAuthBff({ provider, allowedOrigins, secureCookies = true, sessions = new Map(), now = () => Date.now(), newSessionId = randomUUID } = {}) {
  if (!provider) throw new TypeError("provider is required");
  const origins = new Set(allowedOrigins || []);
  const requireIntent = (request) => origins.has(request.headers.get("origin")) && request.headers.get("x-csrf-intent") === "ai-stylist";
  const readBody = async (request) => { const body = await request.text(); if (body.length > 16_384) throw Object.assign(new Error("too_large"), { status: 413 }); return body ? JSON.parse(body) : {}; };
  const activeSession = (request) => { const id = cookieValue(request, "ai_stylist_session"); const session = id && sessions.get(id); if (!session || Number(session.expiresAt) * 1000 <= now()) { if (id) sessions.delete(id); return null; } return { id, session }; };
  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && !requireIntent(request)) return json(403, { code: "request_rejected" });
    try {
      if (url.pathname === "/api/auth/otp" && request.method === "POST") { const { email } = await readBody(request); await provider.sendCode({ email }); return json(202, { status: "code_sent" }); }
      if (url.pathname === "/api/auth/verify" && request.method === "POST") { const { email, code } = await readBody(request); const providerSession = await provider.verifyCode({ email, code }); const id = newSessionId(); sessions.set(id, providerSession); return json(200, { userId: providerSession.userId, email: providerSession.email, expiresAt: providerSession.expiresAt }, { "Set-Cookie": sessionCookie(id, secureCookies) }); }
      if (url.pathname === "/api/auth/session" && request.method === "GET") { const active = activeSession(request); return active ? json(200, { userId: active.session.userId, email: active.session.email, expiresAt: active.session.expiresAt }) : json(401, { code: "session_expired" }, { "Set-Cookie": expiredCookie(secureCookies) }); }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") { const active = activeSession(request); if (active) { sessions.delete(active.id); await provider.logout(active.session).catch(() => {}); } return json(200, { status: "signed_out" }, { "Set-Cookie": expiredCookie(secureCookies) }); }
      if (url.pathname.startsWith("/api/provider/") && request.method === "POST") { const active = activeSession(request); if (!active) return json(401, { code: "session_expired" }); const command = await readBody(request); return json(200, await provider.authenticatedRequest(active.session, command)); }
      return json(404, { code: "not_found" });
    } catch (error) { const status = error?.status === 413 ? 413 : error?.code === "rate_limited" ? 429 : 503; return json(status, { code: status === 429 ? "rate_limited" : status === 413 ? "request_too_large" : "provider_unavailable" }); }
  };
}

export function createSupabaseServerProvider({ url, publishableKey, fetchFn = fetch } = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base) || !publishableKey) throw new TypeError("valid server-side Supabase config is required");
  const auth = async (path, body, token) => { const response = await fetchFn(`${base}/auth/v1/${path}`, { method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error("provider_error"), { code: response.status === 429 ? "rate_limited" : "provider_error" }); return payload; };
  return { sendCode: ({ email }) => auth("otp", { email, create_user: true }), async verifyCode({ email, code }) { const payload = await auth("verify", { email, token: code, type: "email" }); return { userId: payload.user?.id, email: payload.user?.email || email, accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: payload.expires_at }; }, logout: (session) => auth("logout", {}, session.accessToken), async authenticatedRequest(session, command) { const response = await fetchFn(`${base}${command.path}`, { method: command.method || "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" }, body: command.body ? JSON.stringify(command.body) : undefined }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error("provider_error"); return payload; } };
}

export function startAuthBff({ port = 8787, siteOrigin = process.env.AUTH_SITE_ORIGIN, supabaseUrl = process.env.SUPABASE_URL, publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY, secureCookies = process.env.AUTH_INSECURE_LOCAL_COOKIE !== "1" } = {}) {
  if (!siteOrigin) throw new Error("AUTH_SITE_ORIGIN is required");
  const handler = createAuthBff({ provider: createSupabaseServerProvider({ url: supabaseUrl, publishableKey }), allowedOrigins: [siteOrigin], secureCookies });
  const server = createServer(async (request, response) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); const incoming = new Request(`http://${request.headers.host}${request.url}`, { method: request.method, headers: request.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }); const result = await handler(incoming); response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer())); });
  return server.listen(port, "127.0.0.1");
}

if (import.meta.url === new URL(`file:///${String(process.argv[1] || "").replace(/\\/g, "/")}`).href) startAuthBff();
