import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthBff,
  createFixedWindowRateLimiter,
  providerCommandAllowed,
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
