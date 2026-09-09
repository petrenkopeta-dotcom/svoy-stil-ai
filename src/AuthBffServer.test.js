import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthBff,
  createFixedWindowRateLimiter,
  createMemorySessionStore,
  createSupabaseServerProvider,
  providerCommandAllowed,
  providerPhotoPathAllowed,
  startAuthBff,
  validateAuthBffConfig,
} from "../server/authBff.mjs";
const origin = "https://stylist.example";
const headers = {
  Origin: origin,
  "X-CSRF-Intent": "ai-stylist",
  "Content-Type": "application/json",
};
test("BFF keeps provider tokens server-side and restores a sanitized cookie session", async () => {
  const calls = [];
  const provider = {
    sendCode: async (value) => calls.push(["otp", value]),
    verifyCode: async () => ({
      userId: "u1",
      email: "person@example.test",
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: 2000,
    }),
    logout: async () => calls.push(["logout"]),
    authenticatedRequest: async (session, command) => {
      calls.push(["proxy", session.accessToken, command]);
      return { ok: true };
    },
  };
  const handle = createAuthBff({
    provider,
    allowedOrigins: [origin],
    now: () => 1_000_000,
    newSessionId: () => "opaque-session",
  });
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: "person@example.test" }),
        }),
      )
    ).status,
    202,
  );
  const verified = await handle(
    new Request(`${origin}/api/auth/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "person@example.test", code: "123456" }),
    }),
  );
  const verifiedText = await verified.text();
  assert.doesNotMatch(verifiedText, /secret-access|secret-refresh/);
  const cookie = verified.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const session = await handle(
    new Request(`${origin}/api/auth/session`, {
      headers: { Cookie: "ai_stylist_session=opaque-session" },
    }),
  );
  assert.equal(session.status, 200);
  assert.doesNotMatch(await session.text(), /secret-access|secret-refresh/);
  const proxy = await handle(
    new Request(`${origin}/api/provider/functions/v1/delete-account`, {
      method: "POST",
      headers: { ...headers, Cookie: "ai_stylist_session=opaque-session" },
      body: JSON.stringify({
        method: "POST",
        path: "/functions/v1/delete-account",
        body: {},
      }),
    }),
  );
  assert.equal(proxy.status, 200);
  assert.equal(calls.at(-1)[1], "secret-access");
});
test("BFF rejects cross-origin writes and expires unknown sessions with 401", async () => {
  const provider = {
    sendCode: async () => assert.fail(),
    verifyCode: async () => assert.fail(),
    logout: async () => {},
    authenticatedRequest: async () => assert.fail(),
  };
  const handle = createAuthBff({ provider, allowedOrigins: [origin] });
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/otp`, {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "X-CSRF-Intent": "ai-stylist",
          },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  const expired = await handle(
    new Request(`${origin}/api/auth/session`, {
      headers: { Cookie: "ai_stylist_session=missing" },
    }),
  );
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie"), /Max-Age=0/);
});

test("provider proxy accepts only explicit application resources", () => {
  assert.equal(
    providerCommandAllowed("/api/provider/rest/v1/profiles?select=*", {
      method: "GET",
      path: "/rest/v1/profiles?select=*",
    }),
    true,
  );
  assert.equal(
    providerCommandAllowed("/api/provider/functions/v1/delete-account", {
      method: "POST",
      path: "/functions/v1/delete-account",
      body: {},
    }),
    true,
  );
  for (const command of [
    { method: "POST", path: "/auth/v1/admin/users" },
    { method: "DELETE", path: "/rest/v1/profiles" },
    { method: "POST", path: "/rest/v1/unknown_table" },
    { method: "POST", path: "/rest/v1/%2e%2e/auth" },
  ])
    assert.equal(
      providerCommandAllowed(`/api/provider${command.path}`, command),
      false,
    );
});

test("photo proxy accepts only the authenticated owner path", () => {
  assert.equal(
    providerPhotoPathAllowed(
      "/api/provider/storage/v1/object/wardrobe-photos/u1/item-1/idem-1",
      "u1",
    ),
    true,
  );
  for (const path of [
    "/api/provider/storage/v1/object/wardrobe-photos/u2/item-1/idem-1",
    "/api/provider/storage/v1/object/wardrobe-photos/u1/item-1",
    "/api/provider/storage/v1/object/wardrobe-photos/u1/%2Fetc/idem-1",
    "/api/provider/storage/v1/object/other/u1/item-1/idem-1",
  ])
    assert.equal(providerPhotoPathAllowed(path, "u1"), false);
});

test("BFF streams an allowlisted photo upload and returns only its receipt", async () => {
  const uploads = [];
  const handle = createAuthBff({
    provider: providerStub({
      uploadPhoto: async (session, upload) => {
        uploads.push({ session, upload });
        return { etag: '"photo-etag"' };
      },
    }),
    allowedOrigins: [origin],
    sessions: new Map([
      [
        "photo-session",
        {
          userId: "u1",
          email: "person@example.test",
          accessToken: "access",
          expiresAt: 2000,
        },
      ],
    ]),
    now: () => 1_000_000,
  });
  const response = await handle(
    new Request(
      `${origin}/api/provider/storage/v1/object/wardrobe-photos/u1/item-1/idem-1`,
      {
        method: "POST",
        headers: {
          Origin: origin,
          "X-CSRF-Intent": "ai-stylist",
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
          Cookie: "ai_stylist_session=photo-session",
        },
        body: new Uint8Array([0xff, 0xd8, 0xff]),
      },
    ),
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("etag"), '"photo-etag"');
  assert.equal(await response.text(), "");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].upload.contentType, "image/jpeg");
  assert.equal(uploads[0].upload.body.byteLength, 3);
});

test("photo proxy rejects cross-owner paths and non-image bodies before provider egress", async () => {
  let uploads = 0;
  const handle = createAuthBff({
    provider: providerStub({
      uploadPhoto: async () => {
        uploads += 1;
        return { etag: "unexpected" };
      },
    }),
    allowedOrigins: [origin],
    sessions: new Map([
      [
        "photo-session",
        {
          userId: "u1",
          email: "person@example.test",
          accessToken: "access",
          expiresAt: 2000,
        },
      ],
    ]),
    now: () => 1_000_000,
  });
  const upload = (path, contentType = "image/jpeg") =>
    handle(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: {
          Origin: origin,
          "X-CSRF-Intent": "ai-stylist",
          "Content-Type": contentType,
          "x-upsert": "true",
          Cookie: "ai_stylist_session=photo-session",
        },
        body: new Uint8Array([1]),
      }),
    );
  assert.equal(
    (
      await upload(
        "/api/provider/storage/v1/object/wardrobe-photos/u2/item/idem",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await upload(
        "/api/provider/storage/v1/object/wardrobe-photos/u1/item/idem",
        "application/octet-stream",
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await upload(
        "/api/provider/storage/v1/object/wardrobe-photos/u1/item/idem",
      )
    ).status,
    415,
  );
  assert.equal(uploads, 0);
});

test("Supabase photo provider keeps the bearer token server-side and requires an ETag", async () => {
  const calls = [];
  const provider = createSupabaseServerProvider({
    url: "https://project.supabase.co",
    publishableKey: "publishable-test-key",
    fetchFn: async (...args) => {
      calls.push(args);
      return new Response(null, {
        status: 200,
        headers: { ETag: '"stored-etag"' },
      });
    },
  });
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
  assert.deepEqual(
    await provider.uploadPhoto(
      { accessToken: "server-access-token" },
      {
        path: "/storage/v1/object/wardrobe-photos/u1/item/idem",
        body: bytes,
        contentType: "image/jpeg",
      },
    ),
    { etag: '"stored-etag"' },
  );
  assert.equal(
    calls[0][0],
    "https://project.supabase.co/storage/v1/object/wardrobe-photos/u1/item/idem",
  );
  assert.equal(calls[0][1].headers.Authorization, "Bearer server-access-token");
  assert.equal(calls[0][1].headers["x-upsert"], "true");
  assert.equal(calls[0][1].body, bytes);
});

const providerStub = (overrides = {}) => ({
  sendCode: async () => {},
  verifyCode: async ({ email }) => ({
    userId: "u1",
    email,
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: 2000,
  }),
  logout: async () => {},
  authenticatedRequest: async () => ({ ok: true }),
  ...overrides,
});

test("BFF requires JSON and reports malformed JSON as a client error", async () => {
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
  });
  const missingType = await handle(
    new Request(`${origin}/api/auth/otp`, {
      method: "POST",
      headers: { Origin: origin, "X-CSRF-Intent": "ai-stylist" },
      body: "{}",
    }),
  );
  assert.equal(missingType.status, 415);
  assert.equal((await missingType.json()).code, "json_required");
  const malformed = await handle(
    new Request(`${origin}/api/auth/otp`, {
      method: "POST",
      headers,
      body: "{",
    }),
  );
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "invalid_request");
});

test("BFF validates and normalizes authentication inputs", async () => {
  const calls = [];
  const handle = createAuthBff({
    provider: providerStub({
      sendCode: async ({ email }) => calls.push(email),
    }),
    allowedOrigins: [origin],
  });
  for (const email of ["", "broken", `${"a".repeat(250)}@x.test`]) {
    assert.equal(
      (
        await handle(
          new Request(`${origin}/api/auth/otp`, {
            method: "POST",
            headers,
            body: JSON.stringify({ email }),
          }),
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: " Person@Example.Test " }),
        }),
      )
    ).status,
    202,
  );
  assert.deepEqual(calls, ["person@example.test"]);
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: "person@example.test", code: "123" }),
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: "person@example.test", admin: true }),
        }),
      )
    ).status,
    400,
  );
});

test("fixed-window limiter blocks repeated OTP requests and resets", async () => {
  let time = 0;
  const limiter = createFixedWindowRateLimiter({
    now: () => time,
    windowMs: 100,
    limits: { otp: 2, verify: 2 },
  });
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
    rateLimiter: limiter,
  });
  const request = () =>
    handle(
      new Request(`${origin}/api/auth/otp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: "person@example.test" }),
      }),
    );
  assert.equal((await request()).status, 202);
  assert.equal((await request()).status, 202);
  assert.equal((await request()).status, 429);
  time = 101;
  assert.equal((await request()).status, 202);
});

test("BFF rejects incomplete, expired, and excessive provider sessions", async () => {
  for (const providerSession of [
    { userId: "u1", email: "person@example.test", expiresAt: 2000 },
    {
      userId: "u1",
      email: "person@example.test",
      accessToken: "access",
      expiresAt: 999,
    },
    {
      userId: "u1",
      email: "person@example.test",
      accessToken: "access",
      expiresAt: 999999999,
    },
  ]) {
    const handle = createAuthBff({
      provider: providerStub({ verifyCode: async () => providerSession }),
      allowedOrigins: [origin],
      now: () => 1_000_000,
    });
    const response = await handle(
      new Request(`${origin}/api/auth/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: "person@example.test", code: "123456" }),
      }),
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("BFF bounds in-memory sessions and evicts the oldest", async () => {
  const sessions = new Map([
    [
      "old",
      {
        userId: "old",
        email: "old@example.test",
        accessToken: "access",
        expiresAt: 2000,
      },
    ],
  ]);
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
    sessions,
    sessionLimit: 1,
    now: () => 1_000_000,
    newSessionId: () => "new",
  });
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: "person@example.test",
            code: "123456",
          }),
        }),
      )
    ).status,
    200,
  );
  assert.equal(sessions.has("old"), false);
  assert.equal(sessions.has("new"), true);
});

test("BFF uses the asynchronous session store contract for restore and revoke", async () => {
  const records = new Map();
  const calls = [];
  const sessionStore = {
    durable: true,
    async get(id) {
      calls.push(["get", id]);
      return records.get(id) || null;
    },
    async put(id, session) {
      calls.push(["put", id]);
      records.set(id, session);
    },
    async delete(id) {
      calls.push(["delete", id]);
      records.delete(id);
    },
  };
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
    sessionStore,
    now: () => 1_000_000,
    newSessionId: () => "durable-session",
  });
  const verified = await handle(
    new Request(`${origin}/api/auth/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "person@example.test", code: "123456" }),
    }),
  );
  assert.equal(verified.status, 200);
  assert.equal(records.has("durable-session"), true);
  const cookieHeaders = {
    ...headers,
    Cookie: "ai_stylist_session=durable-session",
  };
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/session`, { headers: cookieHeaders }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/auth/logout`, {
          method: "POST",
          headers: cookieHeaders,
          body: "{}",
        }),
      )
    ).status,
    200,
  );
  assert.equal(records.has("durable-session"), false);
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ["put", "get", "get", "delete"],
  );
});

test("production startup rejects the non-durable memory session store", () => {
  const options = {
    port: 8787,
    siteOrigin: "https://stylist.example",
    secureCookies: true,
    production: true,
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "publishable-test-key",
  };
  assert.throws(() => startAuthBff(options), /durable sessionStore/);
  assert.throws(
    () =>
      startAuthBff({
        ...options,
        sessionStore: createMemorySessionStore(),
      }),
    /durable sessionStore/,
  );
});

test("provider proxy rejects unknown query controls and oversized limits", () => {
  for (const path of [
    "/rest/v1/profiles?apikey=secret",
    "/rest/v1/profiles?limit=101",
    "/rest/v1/profiles?limit=1&limit=2",
    "/rest/v1/profiles?select=*%00",
  ])
    assert.equal(
      providerCommandAllowed(`/api/provider${path}`, { method: "GET", path }),
      false,
    );
  const path = "/rest/v1/profiles";
  assert.equal(
    providerCommandAllowed(`/api/provider${path}`, {
      method: "PATCH",
      path,
      headers: { Authorization: "override" },
    }),
    false,
  );
  assert.equal(
    providerCommandAllowed(`/api/provider${path}`, {
      method: "PATCH",
      path,
      headers: { Prefer: "tx=rollback" },
    }),
    false,
  );
});

test("BFF responses carry baseline API security headers", async () => {
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
  });
  const response = await handle(new Request(`${origin}/missing`));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
});

test("health is minimal and known routes reject wrong methods", async () => {
  const handle = createAuthBff({
    provider: providerStub(),
    allowedOrigins: [origin],
  });
  const health = await handle(new Request(`${origin}/api/health`));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  const wrongMethod = await handle(
    new Request(`${origin}/api/auth/session`, { method: "PUT" }),
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");
});

test("production BFF configuration rejects unsafe origins, ports, and cookies", () => {
  assert.deepEqual(
    validateAuthBffConfig({
      port: 8787,
      siteOrigin: "https://stylist.example",
      secureCookies: true,
      production: true,
    }),
    { port: 8787, siteOrigin: "https://stylist.example", secureCookies: true },
  );
  assert.deepEqual(
    validateAuthBffConfig({
      port: 8787,
      siteOrigin: "http://localhost:5173",
      secureCookies: false,
      production: false,
    }),
    { port: 8787, siteOrigin: "http://localhost:5173", secureCookies: false },
  );
  for (const config of [
    { port: 0, siteOrigin: origin, secureCookies: true },
    { port: 8787, siteOrigin: "http://stylist.example", secureCookies: true },
    {
      port: 8787,
      siteOrigin: "https://stylist.example/path",
      secureCookies: true,
    },
    { port: 8787, siteOrigin: origin, secureCookies: false, production: true },
  ])
    assert.throws(() => validateAuthBffConfig(config));
});
