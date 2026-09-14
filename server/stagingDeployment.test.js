import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { startStagingServer, createTesterAdmission } from "./stagingServer.mjs";

const origin = "https://example.test";
const secret = "synthetic-only-secret";
function launch(id) {
  const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=${id}`;
  return `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`;
}
async function fixture(t, options = {}, overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-admission-"));
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: origin,
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
      ...overrides,
    },
    ...options,
  });
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  });
  assert.equal(server.address().address, "127.0.0.1");
  const base = `http://127.0.0.1:${server.address().port}/api/staging/`;
  const request = (route, method = "GET", body, cookie = "", extra = {}) =>
    fetch(base + route, {
      method,
      headers: { origin, "x-csrf-intent": "ai-stylist", cookie, ...extra },
      ...(body === undefined ? {} : { body }),
    });
  request.dataDirectory = dir;
  return request;
}

test("tester admission is empty by default, bounded, exact and app scoped", () => {
  assert.equal(createTesterAdmission("123")("vk:123:1"), false);
  const admit = createTesterAdmission("123", '["1","2"]');
  assert.equal(admit("vk:123:1"), true);
  for (const owner of ["1", "vk:999:1", "vk:123:3", "vk:123:01"])
    assert.equal(admit(owner), false);
  for (const value of [
    "true",
    "{}",
    '["01"]',
    '["1","1"]',
    "[1]",
    '["1",null]',
    JSON.stringify(Array.from({ length: 101 }, (_, i) => String(i + 1))),
  ])
    assert.throws(
      () => createTesterAdmission("123", value),
      /staging_tester_configuration_invalid/,
    );
});

test("signed launch cannot bypass empty tester list or closed budget via env or forwarding", async (t) => {
  const closed = await fixture(
    t,
    {},
    { STAGING_TESTER_IDS: '["456"]', BUDGET_ALLOWED: "true" },
  );
  assert.equal((await closed("vk-session", "POST", launch("456"))).status, 503);
  const noTesters = await fixture(t, { budgetAllowed: () => true });
  const rejected = await noTesters("vk-session", "POST", launch("456"), "", {
    "x-forwarded-for": "127.0.0.1",
    "x-forwarded-user": "456",
    authorization: "synthetic",
  });
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { code: "tester_not_allowed" });
  assert.equal(rejected.headers.get("set-cookie"), null);
  const stored = new DatabaseSync(
    path.join(noTesters.dataDirectory, "sessions.sqlite"),
  );
  try {
    assert.equal(
      stored.prepare("SELECT COUNT(*) AS count FROM sessions").get().count,
      0,
    );
  } finally {
    stored.close();
  }
  assert.equal((await noTesters("session")).status, 401);
});

test("session identity comes from each actual cookie; revocation blocks data but permits CSRF logout", async (t) => {
  const allowed = new Set(["vk:123:456", "vk:123:789"]);
  const request = await fixture(t, {
    budgetAllowed: () => true,
    testerAllowed: (id) => allowed.has(id),
  });
  const a = await request("vk-session", "POST", launch("456"));
  const cookieA = a.headers.get("set-cookie").split(";")[0];
  const b = await request("vk-session", "POST", launch("789"));
  const cookieB = b.headers.get("set-cookie").split(";")[0];
  assert.match(a.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=None/);
  assert.equal((await a.json()).userId, "vk:123:456");
  assert.equal((await b.json()).userId, "vk:123:789");
  // A browser which rejected B's Set-Cookie still sees A, never an invented B.
  assert.deepEqual(
    await (await request("session", "GET", undefined, cookieA)).json(),
    { authenticated: true, userId: "vk:123:456" },
  );
  assert.deepEqual(
    await (await request("session", "GET", undefined, cookieB)).json(),
    { authenticated: true, userId: "vk:123:789" },
  );
  const items = [{ id: "1", category: "shirt", color: "blue" }];
  assert.equal(
    (await request("wardrobe", "PUT", JSON.stringify(items), cookieA)).status,
    200,
  );
  assert.deepEqual(
    await (await request("wardrobe", "GET", undefined, cookieB)).json(),
    { items: [] },
  );
  allowed.delete("vk:123:456");
  for (const route of ["session", "wardrobe", "capabilities"])
    assert.equal((await request(route, "GET", undefined, cookieA)).status, 403);
  assert.equal(
    (
      await request("logout", "POST", "", cookieA, {
        origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal((await request("logout", "POST", "", cookieA)).status, 200);
  assert.equal(
    (await request("session", "GET", undefined, cookieA)).status,
    401,
  );
  assert.equal(
    (await request("session", "GET", undefined, cookieB)).status,
    200,
  );
});

test("allowlist provider failure is a generic denied login without a cookie", async (t) => {
  const request = await fixture(t, {
    budgetAllowed: () => true,
    testerAllowed: () => {
      throw new Error("private detail");
    },
  });
  const result = await request("vk-session", "POST", launch("456"));
  assert.equal(result.status, 403);
  assert.deepEqual(await result.json(), { code: "tester_not_allowed" });
  assert.equal(result.headers.get("set-cookie"), null);
});
