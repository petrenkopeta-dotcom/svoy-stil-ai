import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const SESSION_COOKIE = "ai_stylist_session";
const MAX_BODY_BYTES = 16_384;
const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;
const PROVIDER_TABLES = new Set([
  "profiles",
  "stylist_preferences",
  "user_consents",
  "wardrobe_items",
  "saved_outfits",
  "feedback_events",
  "shopping_drafts",
]);
const PROVIDER_METHODS = new Set(["GET", "POST", "PATCH"]);
const PROVIDER_QUERY_KEYS = new Set([
  "select",
  "on_conflict",
  "user_id",
  "id",
  "idempotency_key",
  "limit",
]);
const PROVIDER_PREFER_VALUES = new Set([
  "return=representation",
  "resolution=merge-duplicates,return=representation",
]);

const json = (status, payload, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...SECURITY_HEADERS, ...headers },
  });
const cookieValue = (request, name) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || null;
const sessionCookie = (id, secure) =>
  [
    `${SESSION_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
const expiredCookie = (secure) =>
  [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
const ownKeysAre = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.has(key));

const fail = (message, status, publicCode) =>
  Object.assign(new Error(message), { status, publicCode });
const normalizeEmail = (value) => {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw fail("invalid_email", 400, "invalid_request");
  return email;
};
const normalizeCode = (value) => {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(code)) throw fail("invalid_code", 400, "invalid_request");
  return code;
};
const validProviderSession = (session, currentTime) => {
  const expiresAt = Number(session?.expiresAt);
  return Boolean(
    session &&
    typeof session.userId === "string" &&
    session.userId &&
    typeof session.email === "string" &&
    typeof session.accessToken === "string" &&
    session.accessToken &&
    Number.isFinite(expiresAt) &&
    expiresAt * 1000 > currentTime &&
    expiresAt * 1000 <= currentTime + MAX_SESSION_SECONDS * 1000,
  );
};

export function createFixedWindowRateLimiter({
  now = () => Date.now(),
  windowMs = 10 * 60_000,
  limits = { otp: 5, verify: 10 },
  maxKeys = 20_000,
} = {}) {
  const buckets = new Map();
  return {
    consume(scope, identity) {
      const limit = limits[scope];
      if (!Number.isInteger(limit) || limit < 1) return true;
      const time = now();
      const key = `${scope}:${identity}`;
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        bucket = { count: 0, resetAt: time + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (buckets.size > maxKeys) {
        for (const [candidate, value] of buckets)
          if (value.resetAt <= time) buckets.delete(candidate);
        while (buckets.size > maxKeys)
          buckets.delete(buckets.keys().next().value);
      }
      return bucket.count <= limit;
    },
  };
}

function validProviderQuery(requestPath) {
  const url = new URL(requestPath, "https://provider.invalid");
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => !PROVIDER_QUERY_KEYS.has(key)) ||
    new Set(keys).size !== keys.length
  )
    return false;
  if (
    [...url.searchParams.values()].some(
      (value) => value.length > 512 || /[\u0000-\u001f\u007f]/.test(value),
    )
  )
    return false;
  const limit = url.searchParams.get("limit");
  return limit === null || (/^\d+$/.test(limit) && Number(limit) <= 100);
}

function validProviderHeaders(headers) {
  if (headers === undefined) return true;
  return (
    ownKeysAre(headers, new Set(["Prefer"])) &&
    (headers.Prefer === undefined || PROVIDER_PREFER_VALUES.has(headers.Prefer))
  );
}

export function providerCommandAllowed(routePath, command) {
  if (!ownKeysAre(command, new Set(["method", "path", "body", "headers"])))
    return false;
  if (!validProviderHeaders(command.headers)) return false;
  const method = String(command.method || "POST").toUpperCase();
  const requestPath = String(command.path || "");
  if (
    !requestPath.startsWith("/") ||
    requestPath.includes("\\") ||
    /%2e|%2f|%5c/i.test(requestPath)
  )
    return false;
  if (routePath !== `/api/provider${requestPath}`) return false;
  if (requestPath === "/functions/v1/delete-account") return method === "POST";
  const match = requestPath.match(/^\/rest\/v1\/([a-z_]+)(?:\?[^#]*)?$/);
  return Boolean(
    match &&
    PROVIDER_TABLES.has(match[1]) &&
    PROVIDER_METHODS.has(method) &&
    validProviderQuery(requestPath),
  );
}

export function createAuthBff({
  provider,
  allowedOrigins,
  secureCookies = true,
  sessions = new Map(),
  sessionLimit = 10_000,
  now = () => Date.now(),
  newSessionId = randomUUID,
  rateLimiter = createFixedWindowRateLimiter({ now }),
} = {}) {
  if (!provider) throw new TypeError("provider is required");
  if (!Number.isInteger(sessionLimit) || sessionLimit < 1)
    throw new TypeError("sessionLimit must be a positive integer");
  const origins = new Set(allowedOrigins || []);
  const requireIntent = (request) =>
    origins.has(request.headers.get("origin")) &&
    request.headers.get("x-csrf-intent") === "ai-stylist";
  const readBody = async (request) => {
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw fail("unsupported_media_type", 415, "json_required");
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
      throw fail("too_large", 413, "request_too_large");
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
      throw fail("too_large", 413, "request_too_large");
    try {
      return body ? JSON.parse(body) : {};
    } catch {
      throw fail("invalid_json", 400, "invalid_request");
    }
  };
  const removeExpiredSessions = () => {
    const time = now();
    for (const [id, session] of sessions)
      if (Number(session?.expiresAt) * 1000 <= time) sessions.delete(id);
  };
  const activeSession = (request) => {
    const id = cookieValue(request, SESSION_COOKIE);
    const session = id && sessions.get(id);
    if (!session || Number(session.expiresAt) * 1000 <= now()) {
      if (id) sessions.delete(id);
      return null;
    }
    return { id, session };
  };
  const storeSession = (id, session) => {
    removeExpiredSessions();
    while (sessions.size >= sessionLimit)
      sessions.delete(sessions.keys().next().value);
    sessions.set(id, session);
  };
  const consumeRateLimit = (scope, email) => {
    if (!rateLimiter.consume(scope, email))
      throw fail("rate_limited", 429, "rate_limited");
  };

  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && !requireIntent(request))
      return json(403, { code: "request_rejected" });
    try {
      if (url.pathname === "/api/auth/otp" && request.method === "POST") {
        const body = await readBody(request);
        if (!ownKeysAre(body, new Set(["email"])))
          throw fail("invalid_shape", 400, "invalid_request");
        const email = normalizeEmail(body.email);
        consumeRateLimit("otp", email);
        await provider.sendCode({ email });
        return json(202, { status: "code_sent" });
      }
      if (url.pathname === "/api/auth/verify" && request.method === "POST") {
        const body = await readBody(request);
        if (!ownKeysAre(body, new Set(["email", "code"])))
          throw fail("invalid_shape", 400, "invalid_request");
        const email = normalizeEmail(body.email);
        const code = normalizeCode(body.code);
        consumeRateLimit("verify", email);
        const providerSession = await provider.verifyCode({ email, code });
        if (!validProviderSession(providerSession, now()))
          throw new Error("invalid_provider_session");
        const id = newSessionId();
        storeSession(id, providerSession);
        return json(
          200,
          {
            userId: providerSession.userId,
            email: providerSession.email,
            expiresAt: providerSession.expiresAt,
          },
          { "Set-Cookie": sessionCookie(id, secureCookies) },
        );
      }
      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        const active = activeSession(request);
        return active
          ? json(200, {
              userId: active.session.userId,
              email: active.session.email,
              expiresAt: active.session.expiresAt,
            })
          : json(
              401,
              { code: "session_expired" },
              { "Set-Cookie": expiredCookie(secureCookies) },
            );
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        await readBody(request);
        const active = activeSession(request);
        if (active) {
          sessions.delete(active.id);
          await provider.logout(active.session).catch(() => {});
        }
        return json(
          200,
          { status: "signed_out" },
          { "Set-Cookie": expiredCookie(secureCookies) },
        );
      }
      if (
        url.pathname.startsWith("/api/provider/") &&
        request.method === "POST"
      ) {
        const active = activeSession(request);
        if (!active) return json(401, { code: "session_expired" });
        const command = await readBody(request);
        if (!providerCommandAllowed(`${url.pathname}${url.search}`, command))
          return json(403, { code: "provider_command_rejected" });
        return json(
          200,
          await provider.authenticatedRequest(active.session, command),
        );
      }
      return json(404, { code: "not_found" });
    } catch (error) {
      const status = Number.isInteger(error?.status)
        ? error.status
        : error?.code === "rate_limited"
          ? 429
          : 503;
      return json(status, {
        code:
          error?.publicCode ||
          (status === 429 ? "rate_limited" : "provider_unavailable"),
      });
    }
  };
}

export function createSupabaseServerProvider({
  url,
  publishableKey,
  fetchFn = fetch,
} = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base) || !publishableKey)
    throw new TypeError("valid server-side Supabase config is required");
  const auth = async (path, body, token) => {
    const response = await fetchFn(`${base}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error("provider_error"), {
        code: response.status === 429 ? "rate_limited" : "provider_error",
      });
    return payload;
  };
  return {
    sendCode: ({ email }) => auth("otp", { email, create_user: true }),
    async verifyCode({ email, code }) {
      const payload = await auth("verify", {
        email,
        token: code,
        type: "email",
      });
      return {
        userId: payload.user?.id,
        email: payload.user?.email || email,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: payload.expires_at,
      };
    },
    logout: (session) => auth("logout", {}, session.accessToken),
    async authenticatedRequest(session, command) {
      const allowedHeaders = command.headers?.Prefer
        ? { Prefer: String(command.headers.Prefer) }
        : {};
      const response = await fetchFn(`${base}${command.path}`, {
        method: command.method || "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          ...allowedHeaders,
        },
        body: command.body ? JSON.stringify(command.body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("provider_error");
      return payload;
    },
  };
}

export function startAuthBff({
  port = 8787,
  siteOrigin = process.env.AUTH_SITE_ORIGIN,
  supabaseUrl = process.env.SUPABASE_URL,
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY,
  secureCookies = process.env.AUTH_INSECURE_LOCAL_COOKIE !== "1",
} = {}) {
  if (!siteOrigin) throw new Error("AUTH_SITE_ORIGIN is required");
  if (process.env.NODE_ENV === "production" && !secureCookies)
    throw new Error("insecure cookies are forbidden in production");
  const handler = createAuthBff({
    provider: createSupabaseServerProvider({
      url: supabaseUrl,
      publishableKey,
    }),
    allowedOrigins: [siteOrigin],
    secureCookies,
  });
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const incoming = new Request(
      `http://${request.headers.host}${request.url}`,
      {
        method: request.method,
        headers: request.headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      },
    );
    const result = await handler(incoming);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  return server.listen(port, "127.0.0.1");
}

if (
  import.meta.url ===
  new URL(`file:///${String(process.argv[1] || "").replace(/\\/g, "/")}`).href
)
  startAuthBff();
