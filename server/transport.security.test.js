import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startStagingServer } from "./stagingServer.mjs";
import { createHmac } from "node:crypto";

async function listener(t, options = {}) {
  const prefix = path.join(
    path.resolve(tmpdir()),
    "stylist-security-synthetic-",
  );
  const dir = await mkdtemp(prefix);
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: "https://example.test",
      VK_APP_ID: "123",
      VK_APP_SECRET: "synthetic-security-secret",
      PORT: "0",
    },
    ...options,
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(path.resolve(dir).startsWith(prefix));
    await rm(dir, { recursive: true });
  });
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

// Deliberately never sends or ends the announced body. A response proves early admission.
async function headersOnly(url) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-length": "10485760",
          origin: "https://example.test",
          "x-csrf-intent": "ai-stylist",
        },
      },
      (res) => {
        res.resume();
        res.once("end", () => {
          resolve(res.statusCode);
          req.destroy();
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(2000, () =>
      req.destroy(new Error("early_admission_timeout")),
    );
    req.flushHeaders();
  });
}

test("security HTTP: budget deny responds before original body is transmitted", async (t) => {
  const base = await listener(t);
  assert.equal(await headersOnly(base + "/api/staging/photos/analyze"), 503);
});

test("security HTTP: unauthenticated photo refuses body before invoking worker", async (t) => {
  let calls = 0;
  const base = await listener(t, {
    budgetAllowed: () => true,
    testerAllowed: () => true,
    photoFlow: {
      enabled: () => true,
      analyze() {
        calls++;
      },
      close() {},
    },
  });
  assert.equal(await headersOnly(base + "/api/staging/photos/analyze"), 401);
  assert.equal(calls, 0);
});

test("security HTTP: unknown photo bypass route refuses body", async (t) => {
  const base = await listener(t, { budgetAllowed: () => true });
  assert.equal(
    await headersOnly(base + "/api/staging/photos/analyze?owner=other"),
    404,
  );
});

test("SEC-01 HTTP: blocked logout revokes cookie and still enforces CSRF", async (t) => {
  let allowed = true;
  const base = await listener(t, {
    budgetAllowed: () => allowed,
    testerAllowed: () => true,
  });
  const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=456`;
  const headers = {
    origin: "https://example.test",
    "x-csrf-intent": "ai-stylist",
  };
  const login = await fetch(base + "/api/staging/vk-session", {
    method: "POST",
    headers,
    body: `${raw}&sign=${createHmac("sha256", "synthetic-security-secret").update(raw).digest("base64url")}`,
  });
  assert.equal(login.status, 200);
  headers.cookie = login.headers.get("set-cookie").split(";")[0];
  await login.arrayBuffer();
  const status = async (route, method = "GET", overrides = {}) => {
    const response = await fetch(base + "/api/staging/" + route, {
      method,
      headers: { ...headers, ...overrides },
    });
    await response.arrayBuffer();
    return response.status;
  };
  for (const overrides of [
    { origin: "https://attacker.test" },
    { "x-csrf-intent": "" },
  ]) {
    assert.equal(await status("logout", "POST", overrides), 403);
    assert.equal(await status("session"), 200);
  }
  allowed = false;
  for (const overrides of [
    { origin: "https://attacker.test" },
    { "x-csrf-intent": "" },
  ])
    assert.equal(await status("logout", "POST", overrides), 403);
  const logout = await fetch(base + "/api/staging/logout", {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  await logout.arrayBuffer();
  allowed = true;
  assert.equal(await status("session"), 401);
});
