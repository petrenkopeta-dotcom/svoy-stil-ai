import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startStagingServer } from "./stagingServer.mjs";
import { createHmac } from "node:crypto";

test("real HTTP listener stays closed without provider budget enforcement", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-http-"));
  let server;
  try {
    server = startStagingServer({
      env: {
        STAGING_DATA_DIR: dir,
        STAGING_ORIGIN: "https://example.test",
        VK_APP_ID: "123",
        VK_APP_SECRET: "synthetic-test-secret",
        PORT: "0",
      },
    });
    await once(server, "listening");
    const result = await fetch(
      `http://127.0.0.1:${server.address().port}/api/staging/vk-session`,
      { method: "POST", body: "synthetic-input" },
    );
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { code: "staging_budget_blocked" });
    assert.equal(result.headers.get("cache-control"), "no-store");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});

test("HTTP VK login, authenticated write and read-back work with injected test admission", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-flow-"));
  const secret = "synthetic-test-secret";
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: "https://example.test",
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
    },
    budgetAllowed: () => true,
  });
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/staging/`;
    const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=456`;
    const headers = {
      Origin: "https://example.test",
      "X-CSRF-Intent": "ai-stylist",
    };
    const login = await fetch(base + "vk-session", {
      method: "POST",
      headers,
      body: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
    });
    assert.equal(login.status, 200);
    headers.Cookie = login.headers.get("set-cookie").split(";")[0];
    const items = [{ id: "1", category: "shirt", color: "blue" }];
    assert.equal(
      (
        await fetch(base + "wardrobe", {
          method: "PUT",
          headers,
          body: JSON.stringify(items),
        })
      ).status,
      200,
    );
    assert.deepEqual(
      (await (await fetch(base + "wardrobe", { headers })).json()).items,
      items,
    );
    assert.equal((await fetch(base + "session", { headers })).status, 200);
    assert.equal(
      (
        await fetch(base + "photos", {
          method: "POST",
          headers,
          body: "synthetic",
        })
      ).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});

test("budget denial still permits only authenticated CSRF-checked bounded logout", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-logout-"));
  const secret = "synthetic-test-secret";
  let allowed = true;
  const cancelled = [];
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: "https://example.test",
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
    },
    budgetAllowed: () => allowed,
    photoFlow: {
      cancel: (owner) => cancelled.push(owner),
      close() {},
      enabled: () => false,
    },
  });
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/staging/`;
    const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=456`;
    const headers = {
      Origin: "https://example.test",
      "X-CSRF-Intent": "ai-stylist",
    };
    const login = await fetch(base + "vk-session", {
      method: "POST",
      headers,
      body: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
    });
    headers.Cookie = login.headers.get("set-cookie").split(";")[0];
    allowed = false;
    assert.equal((await fetch(base + "session", { headers })).status, 503);
    assert.equal((await fetch(base + "logout", { headers })).status, 503);
    assert.equal(
      (
        await fetch(base + "logout", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "logout", {
          method: "POST",
          headers: { ...headers, "X-CSRF-Intent": "" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "logout", {
          method: "POST",
          headers: { ...headers, Cookie: "stylist_vk=stale" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "logout", {
          method: "POST",
          headers,
          body: "x".repeat(16385),
        })
      ).status,
      413,
    );
    assert.deepEqual(cancelled, []);
    const logout = await fetch(base + "logout", { method: "POST", headers });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.deepEqual(cancelled, ["vk:123:456"]);
    allowed = true;
    assert.equal((await fetch(base + "session", { headers })).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});

test("HTTP photo routes enforce owner, method, release and budget boundaries", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { createGarmentPhotoFlow } = await import("./garmentPhotoFlow.mjs");
  const { createVkStagingClient } = await import("../src/vkStagingClient.js");
  const dir = await mkdtemp(
    path.join(tmpdir(), "stylist-synthetic-photo-http-"),
  );
  const db = new DatabaseSync(":memory:");
  const secret = "synthetic-test-secret";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
    "base64",
  );
  const sha256 = createHash("sha256").update(png).digest("hex");
  let approved = false,
    allowed = true;
  const flow = createGarmentPhotoFlow({
    db,
    releaseApproved: () => approved,
    worker: {
      close() {},
      async analyze(bytes) {
        assert.deepEqual(bytes, png); // Fixture-only seam cannot process another image.
        return {
          candidates: [
            {
              label: "shirt",
              png: png.toString("base64"),
              safety: {
                sha256,
                checked: true,
                garmentOnly: true,
                personPresent: false,
                facePresent: false,
              },
            },
          ],
        };
      },
    },
  });
  const server = startStagingServer({
    env: {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: "https://example.test",
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
    },
    budgetAllowed: () => allowed,
    photoFlow: flow,
  });
  const clients = [];
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const make = (user) => {
      let cookie = "";
      const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=${user}`;
      const client = createVkStagingClient({
        launch: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
        fetchImpl: async (url, options) => {
          const result = await fetch(base + url, {
            ...options,
            headers: {
              ...options.headers,
              Origin: "https://example.test",
              Cookie: cookie,
            },
          });
          if (result.headers.has("set-cookie"))
            cookie = result.headers.get("set-cookie").split(";")[0];
          return result;
        },
      });
      clients.push(client);
      return client;
    };
    const a = make("456"),
      b = make("789");
    assert.equal((await fetch(base + "/api/staging/capabilities")).status, 401);
    await a.login();
    await b.login();
    assert.deepEqual(await a.capabilities(), { photos: false });
    await assert.rejects(a.photos(), (e) => e.status === 503);
    approved = true;
    assert.equal((await fetch(base + "/api/staging/photos")).status, 401);
    for (const route of ["photos", "capabilities"])
      assert.equal(
        (await fetch(base + "/api/staging/" + route, { method: "POST" }))
          .status,
        404,
      );
    const {
      candidates: [candidate],
    } = await a.analyze(new Blob([png], { type: "image/png" }));
    const saved = await a.confirm(candidate.id);
    assert.equal(saved.sha256, sha256);
    assert.deepEqual((await a.photos()).items, [{ id: saved.id, sha256 }]);
    assert.deepEqual(await b.photos(), { items: [] });
    await assert.rejects(b.readPhoto(saved), (e) => e.status === 404);
    allowed = false;
    await assert.rejects(a.photos(), (e) => e.status === 503);
    await assert.rejects(a.capabilities(), (e) => e.status === 503);
    await a.logout();
    allowed = true;
    await assert.rejects(a.photos(), (e) => e.status === 401);
  } finally {
    for (const client of clients) client.close();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(dir, { recursive: true });
  }
});
