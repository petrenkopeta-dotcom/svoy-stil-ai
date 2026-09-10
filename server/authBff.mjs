import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const SESSION_COOKIE = "ai_stylist_session";
const MAX_BODY_BYTES = 16_384;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

export function createMemorySessionStore({
  sessions = new Map(),
  maxSessions = 10_000,
  now = () => Date.now(),
} = {}) {
  if (!(sessions instanceof Map)) throw new TypeError("sessions must be a Map");
  if (!Number.isInteger(maxSessions) || maxSessions < 1)
    throw new TypeError("maxSessions must be a positive integer");
  const removeExpired = () => {
    const time = now();
    for (const [id, session] of sessions)
      if (Number(session?.expiresAt) * 1000 <= time) sessions.delete(id);
  };
  return Object.freeze({
    durable: false,
    async get(id) {
      const session = sessions.get(id);
      if (!session || Number(session.expiresAt) * 1000 <= now()) {
        if (id) sessions.delete(id);
        return null;
      }
      return session;
    },
    async put(id, session) {
      removeExpired();
      while (sessions.size >= maxSessions)
        sessions.delete(sessions.keys().next().value);
      sessions.set(id, session);
    },
    async delete(id) {
      sessions.delete(id);
    },
  });
}

const validSessionStore = (store) =>
  store &&
  typeof store.get === "function" &&
  typeof store.put === "function" &&
  typeof store.delete === "function";

const photoSignatureMatches = (body, contentType) => {
  const bytes = new Uint8Array(body);
  if (contentType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (contentType === "image/png")
    return (
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
    );
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
};

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

export function providerPhotoPathAllowed(pathname, userId) {
  const prefix = "/api/provider/storage/v1/object/wardrobe-photos/";
  if (!pathname.startsWith(prefix) || pathname.includes("\\")) return false;
  const encodedParts = pathname.slice(prefix.length).split("/");
  if (encodedParts.length !== 3 || encodedParts.some((part) => !part))
    return false;
  try {
    const parts = encodedParts.map(decodeURIComponent);
    return (
      parts[0] === userId &&
      parts.every(
        (part) =>
          part.length <= 128 &&
          !part.includes("/") &&
          !part.includes("\\") &&
          !/[\u0000-\u001f\u007f]/.test(part),
      )
    );
  } catch {
    return false;
  }
}

export function createAuthBff({
  provider,
  validatePhoto,
  allowedOrigins,
  secureCookies = true,
  sessionStore,
  sessions,
  sessionLimit = 10_000,
  now = () => Date.now(),
  newSessionId = randomUUID,
  rateLimiter = createFixedWindowRateLimiter({ now }),
} = {}) {
  if (!provider) throw new TypeError("provider is required");
  if (!Number.isInteger(sessionLimit) || sessionLimit < 1)
    throw new TypeError("sessionLimit must be a positive integer");
  const store =
    sessionStore ||
    createMemorySessionStore({ sessions, maxSessions: sessionLimit, now });
  if (!validSessionStore(store))
    throw new TypeError("sessionStore must implement get, put, and delete");
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
  const readPhoto = async (request) => {
    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!PHOTO_MIMES.has(contentType))
      throw fail("unsupported_photo_type", 415, "photo_type_required");
    if (request.headers.get("x-upsert") !== "true")
      throw fail("invalid_upload_intent", 400, "invalid_request");
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES)
      throw fail("too_large", 413, "request_too_large");
    const body = await request.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_PHOTO_BYTES)
      throw fail(
        "invalid_photo_size",
        body.byteLength ? 413 : 400,
        body.byteLength ? "request_too_large" : "invalid_request",
      );
    if (!photoSignatureMatches(body, contentType))
      throw fail("photo_signature_mismatch", 415, "photo_type_required");
    return { body, contentType };
  };
  const activeSession = async (request) => {
    const id = cookieValue(request, SESSION_COOKIE);
    const session = id && (await store.get(id));
    if (!session || Number(session.expiresAt) * 1000 <= now()) {
      if (id) await store.delete(id);
      return null;
    }
    return { id, session };
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
      if (url.pathname === "/api/health" && request.method === "GET")
        return json(200, { status: "ok" });
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
        await store.put(id, providerSession);
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
        const active = await activeSession(request);
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
        const active = await activeSession(request);
        if (active) {
          await store.delete(active.id);
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
        const active = await activeSession(request);
        if (!active) return json(401, { code: "session_expired" });
        if (url.pathname.startsWith("/api/provider/storage/")) {
          if (
            url.search ||
            !providerPhotoPathAllowed(url.pathname, active.session.userId) ||
            typeof provider.uploadPhoto !== "function"
          )
            return json(403, { code: "provider_command_rejected" });
          const photo = await readPhoto(request);
          // Never trust request metadata or forward unverified pixels upstream.
          if (typeof validatePhoto !== "function")
            return json(503, { code: "photo_safety_unavailable" });
          if ((await validatePhoto(photo.body, photo.contentType)) !== true)
            return json(422, { code: "unsafe_photo" });
          const receipt = await provider.uploadPhoto(active.session, {
            path: url.pathname.slice("/api/provider".length),
            ...photo,
          });
          if (!receipt?.etag) throw new Error("object_receipt_missing");
          return new Response(null, {
            status: 201,
            headers: { ...SECURITY_HEADERS, ETag: receipt.etag },
          });
        }
        const command = await readBody(request);
        if (!providerCommandAllowed(`${url.pathname}${url.search}`, command))
          return json(403, { code: "provider_command_rejected" });
        return json(
          200,
          await provider.authenticatedRequest(active.session, command),
        );
      }
      const allowedMethod =
        new Map([
          ["/api/health", "GET"],
          ["/api/auth/otp", "POST"],
          ["/api/auth/verify", "POST"],
          ["/api/auth/session", "GET"],
          ["/api/auth/logout", "POST"],
        ]).get(url.pathname) ||
        (url.pathname.startsWith("/api/provider/") ? "POST" : null);
      if (allowedMethod)
        return json(
          405,
          { code: "method_not_allowed" },
          { Allow: allowedMethod },
        );
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

export function validateAuthBffConfig({
  port,
  siteOrigin,
  secureCookies,
  production = process.env.NODE_ENV === "production",
}) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("AUTH_PORT must be an integer between 1 and 65535");
  let parsedOrigin;
  try {
    parsedOrigin = new URL(siteOrigin);
  } catch {
    throw new Error("AUTH_SITE_ORIGIN must be an absolute origin");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    parsedOrigin.hostname,
  );
  if (
    parsedOrigin.origin !== siteOrigin ||
    (parsedOrigin.protocol !== "https:" &&
      !(loopback && parsedOrigin.protocol === "http:"))
  )
    throw new Error(
      "AUTH_SITE_ORIGIN must be an HTTPS origin or HTTP loopback origin",
    );
  if (production && !secureCookies)
    throw new Error("insecure cookies are forbidden in production");
  return Object.freeze({
    port,
    siteOrigin: parsedOrigin.origin,
    secureCookies,
  });
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
    async uploadPhoto(session, { path, body, contentType }) {
      const response = await fetchFn(`${base}${path}`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body,
      });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag) throw new Error("object_receipt_missing");
      return { etag };
    },
  };
}

export function startAuthBff({
  port = Number(process.env.AUTH_PORT || 8787),
  siteOrigin = process.env.AUTH_SITE_ORIGIN,
  supabaseUrl = process.env.SUPABASE_URL,
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY,
  secureCookies = process.env.AUTH_INSECURE_LOCAL_COOKIE !== "1",
  sessionStore = process.env.AUTH_SESSION_DB
    ? createSqliteSessionStore({ filename: process.env.AUTH_SESSION_DB })
    : undefined,
  production = process.env.NODE_ENV === "production",
} = {}) {
  const config = validateAuthBffConfig({
    port,
    siteOrigin,
    secureCookies,
    production,
  });
  if (
    production &&
    (!validSessionStore(sessionStore) || sessionStore.durable !== true)
  )
    throw new Error("a durable sessionStore is required in production");
  const handler = createAuthBff({
    provider: createSupabaseServerProvider({
      url: supabaseUrl,
      publishableKey,
    }),
    allowedOrigins: [config.siteOrigin],
    secureCookies: config.secureCookies,
    sessionStore,
  });
  const server = createServer(async (request, response) => {
    const requestLimit = request.url?.startsWith(
      "/api/provider/storage/v1/object/wardrobe-photos/",
    )
      ? MAX_PHOTO_BYTES
      : MAX_BODY_BYTES;
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > requestLimit) {
      request.resume();
      const result = json(413, { code: "request_too_large" });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const chunks = [];
    let receivedBytes = 0;
    for await (const chunk of request) {
      receivedBytes += chunk.length;
      if (receivedBytes <= requestLimit) chunks.push(chunk);
    }
    if (receivedBytes > requestLimit) {
      const result = json(413, { code: "request_too_large" });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const incoming = new Request(`http://localhost${request.url}`, {
      method: request.method,
      headers: request.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const result = await handler(incoming);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server.listen(config.port, "127.0.0.1");
}

if (
  import.meta.url === (process.argv[1] && pathToFileURL(process.argv[1]).href)
)
  startAuthBff();
