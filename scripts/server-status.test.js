import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createStatusServer } from "./server-start.mjs";
import { configurationChecks } from "./server-preflight.mjs";

test("loopback status is bounded, generic, and never grants readiness", async () => {
  const server = createStatusServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [route, method, status, body] of [
      ["/healthz", "GET", 200, { live: true }],
      ["/readyz", "GET", 503, { ready: false }],
      ["/healthz?secret=do-not-echo", "GET", 404, { code: "not_found" }],
      ["/healthz", "POST", 404, { code: "not_found" }],
    ]) {
      const response = await fetch(origin + route, { method });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), body);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("preflight rejects ambiguous configuration without exposing values", () => {
  const env = {
    STAGING_ORIGIN: "https://stylist.invalid",
    VK_APP_ID: "123",
    VK_APP_SECRET: "test-only-secret",
    STAGING_DATA_DIR: "/var/lib/stylist",
  };
  assert.ok(Object.values(configurationChecks(env)).every(Boolean));
  for (const origin of [
    "http://stylist.invalid",
    "https://stylist.invalid/",
    "https://user:password@stylist.invalid",
    "https://stylist.invalid/path",
  ]) {
    assert.equal(
      configurationChecks({ ...env, STAGING_ORIGIN: origin }).origin,
      false,
    );
  }
  assert.equal(configurationChecks({ ...env, PORT: "0" }).port, false);
  assert.equal(
    JSON.stringify(configurationChecks(env)).includes(env.VK_APP_SECRET),
    false,
  );
});
