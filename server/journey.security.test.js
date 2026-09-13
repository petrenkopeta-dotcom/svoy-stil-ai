import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startStagingServer } from "./stagingServer.mjs";
import { createGarmentPhotoFlow } from "./garmentPhotoFlow.mjs";

// Requires final VK journey 46ef738; seeded synthetic DB records test SQL scope,
// not confirmation/model quality (covered separately by acceptance.security).
test("security HTTP journey: capabilities and bounded photo list preserve auth, owner and deny", async (t) => {
  const prefix = path.join(path.resolve(tmpdir()), "stylist-security-journey-");
  const directory = await mkdtemp(prefix);
  const db = new DatabaseSync(":memory:");
  let released = true,
    budget = true;
  const flow = createGarmentPhotoFlow({
    db,
    worker: {
      close() {},
      analyze() {
        assert.fail("listing must not invoke model");
      },
    },
    releaseApproved: () => released,
  });
  const owner = "vk:123:456";
  const ids = [];
  for (let i = 0; i < 105; i++) {
    const id = randomUUID();
    ids.push(id);
    db.prepare("INSERT INTO garment_photos VALUES(?,?,?,?)").run(
      id,
      owner,
      Buffer.from("synthetic approved fixture"),
      "a".repeat(64),
    );
  }
  const foreignId = randomUUID();
  db.prepare("INSERT INTO garment_photos VALUES(?,?,?,?)").run(
    foreignId,
    "vk:123:789",
    Buffer.from("foreign fixture"),
    "b".repeat(64),
  );
  const secret = "synthetic-security-secret";
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: directory,
      STAGING_ORIGIN: "https://example.test",
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
    },
    budgetAllowed: () => budget,
    photoFlow: flow,
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.ok(path.resolve(directory).startsWith(prefix));
    await rm(directory, { recursive: true });
  });
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/staging/`;
  const headers = {
    origin: "https://example.test",
    "x-csrf-intent": "ai-stylist",
  };
  const request = async (route, method = "GET", overrides = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...headers, ...overrides },
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text ? JSON.parse(text) : null,
    };
  };
  for (const route of ["capabilities", "photos"])
    assert.equal((await request(route)).status, 401);
  const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=456`;
  const login = await fetch(base + "vk-session", {
    method: "POST",
    headers,
    body: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
  });
  assert.equal(login.status, 200);
  headers.cookie = login.headers.get("set-cookie").split(";")[0];
  await login.arrayBuffer();
  const capability = await request("capabilities");
  assert.equal(capability.status, 200);
  assert.deepEqual(capability.body, { photos: true });
  assert.equal(capability.headers.get("cache-control"), "no-store");
  const photos = await request("photos");
  assert.equal(photos.status, 200);
  assert.equal(photos.headers.get("cache-control"), "no-store");
  assert.equal(photos.body.items.length, 100);
  assert.deepEqual(
    photos.body.items.map((x) => x.id),
    ids.slice(5).reverse(),
  );
  for (const item of photos.body.items) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "sha256"]);
    assert.equal(item.sha256, "a".repeat(64));
  }
  assert.equal((await request(`photos/${foreignId}`)).status, 404);
  for (const route of ["capabilities", "photos"]) {
    for (const method of ["POST", "PUT", "DELETE", "HEAD"])
      assert.equal((await request(route, method)).status, 404);
    assert.equal((await request(`${route}?owner=vk:123:789`)).status, 404);
  }
  released = false;
  assert.deepEqual((await request("capabilities")).body, { photos: false });
  assert.equal((await request("photos")).status, 503);
  assert.throws(() => flow.list(owner), /photo_release_unapproved/);
  budget = false;
  assert.equal((await request("capabilities")).status, 503);
  assert.equal((await request("photos")).status, 503);
});
