import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";
import { createStagingApi } from "./stagingApi.mjs";

test("VK sessions isolate durable wardrobes, reject photo bypass and obey budget block", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-vk-"));
  const db = new DatabaseSync(path.join(dir, "metadata.db"));
  const sessions = createSqliteSessionStore({
    filename: path.join(dir, "sessions.db"),
    now: () => 1800000000000,
  });
  const origin = "https://staging.example.test";
  const secret = "synthetic-test-secret-only";
  let allowed = true;
  const handler = createStagingApi({
    db,
    sessions,
    origin,
    secret,
    appId: "123",
    now: () => 1800000000000,
    budgetAllowed: () => allowed,
  });
  const request = (route, method = "GET", body, cookie) =>
    handler(
      new Request(`${origin}/api/staging/${route}`, {
        method,
        headers: {
          origin,
          "x-csrf-intent": "ai-stylist",
          ...(cookie ? { cookie } : {}),
        },
        body,
      }),
    );
  try {
    const login = async (user) => {
      const raw = `vk_app_id=123&vk_ts=1800000000&vk_user_id=${user}`;
      const response = await request(
        "vk-session",
        "POST",
        `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
      );
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const a = await login("456"),
      b = await login("789");
    assert.equal(
      (
        await request(
          "wardrobe",
          "PUT",
          JSON.stringify([{ id: "1", category: "coat", color: "blue" }]),
          a,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await request("wardrobe", "GET", undefined, a)).json()).items
        .length,
      1,
    );
    assert.deepEqual(
      (await (await request("wardrobe", "GET", undefined, b)).json()).items,
      [],
    );
    assert.equal(
      (
        await request(
          "wardrobe",
          "PUT",
          JSON.stringify([{ id: "1", photo: "data:image/png;base64,AQID" }]),
          a,
        )
      ).status,
      422,
    );
    assert.equal(
      (await request("wardrobe?owner=456", "GET", undefined, b)).status,
      400,
    );
    assert.equal((await request("wardrobe")).status, 401);
    await request("logout", "POST", "", a);
    assert.equal((await request("wardrobe", "GET", undefined, a)).status, 401);
    allowed = false;
    assert.equal((await request("wardrobe", "GET", undefined, b)).status, 503);
  } finally {
    sessions.close();
    db.close();
    await rm(dir, { recursive: true });
  }
});

// Entire adapter exists only in this test module. No env, URL or browser flag
// can inject it into the shipped backend. It accepts only fixed synthetic bytes.
test("synthetic VK photo journey: login, analyze, confirm, list/read, owner isolation, logout", async () => {
  const { createGarmentPhotoFlow } = await import("./garmentPhotoFlow.mjs");
  const { createVkStagingClient } = await import("../src/vkStagingClient.js");
  const { createHash } = await import("node:crypto");
  const db = new DatabaseSync(":memory:");
  const records = new Map();
  const sessions = {
    durable: true,
    put: async (id, value) => records.set(id, value),
    get: async (id) => records.get(id),
    delete: async (id) => records.delete(id),
  };
  const origin = "https://staging.example.test",
    secret = "synthetic-test-only-secret";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
    "base64",
  );
  const source = Buffer.from("fixed synthetic source");
  const digest = createHash("sha256").update(png).digest("hex");
  let approved = false,
    behavior = "normal",
    calls = 0;
  const worker = {
    async analyze(bytes, options) {
      calls++;
      assert.deepEqual(bytes, options.operation === "verify" ? png : source);
      if (behavior === "timeout") throw new Error("cv_deadline_exceeded");
      if (behavior === "empty") return { candidates: [] };
      return {
        candidates: [
          {
            png: png.toString("base64"),
            label: "shirt",
            safety: {
              sha256: digest,
              checked: true,
              garmentOnly: true,
              personPresent: false,
              facePresent: false,
            },
          },
        ],
      };
    },
    close() {},
  };
  const flow = createGarmentPhotoFlow({
    db,
    worker,
    releaseApproved: () => approved,
  });
  const handler = createStagingApi({
    db,
    sessions,
    origin,
    secret,
    appId: "123",
    now: () => 1800000000000,
    budgetAllowed: () => true,
    photoFlow: flow,
  });
  const makeClient = (user) => {
    let cookie = "";
    const raw = `vk_app_id=123&vk_ts=1800000000&vk_user_id=${user}`;
    return createVkStagingClient({
      launch: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`,
      fetchImpl: async (url, options) => {
        const response = await handler(
          new Request(`${origin}${url}`, {
            ...options,
            headers: { ...options.headers, origin, cookie },
          }),
        );
        if (response.headers.has("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";")[0];
        return response;
      },
    });
  };
  const a = makeClient("456"),
    b = makeClient("789");
  const input = () => new Blob([source], { type: "image/png" });
  try {
    await a.login();
    await b.login();
    assert.deepEqual(await a.wardrobe(), { items: [] });
    assert.deepEqual(await a.capabilities(), { photos: false });
    await assert.rejects(a.analyze(input()), /photo_release_unapproved/);
    assert.equal(calls, 0);
    approved = true;
    behavior = "empty";
    assert.deepEqual(await a.analyze(input()), { candidates: [] });
    behavior = "timeout";
    await assert.rejects(
      a.analyze(input()),
      (error) => error.status === 504 && error.code === "cv_deadline_exceeded",
    );
    behavior = "normal";
    const {
      candidates: [candidate],
    } = await a.analyze(input());
    assert.deepEqual(await a.photos(), { items: [] });
    await assert.rejects(
      b.confirm(candidate.id),
      (error) => error.status === 404,
    );
    const saved = await a.confirm(candidate.id);
    assert.equal(saved.sha256, digest);
    assert.deepEqual(Buffer.from(await saved.blob.arrayBuffer()), png);
    assert.deepEqual(
      (await a.photos()).items.map((item) => item.id),
      [saved.id],
    );
    assert.deepEqual(await b.photos(), { items: [] });
    await assert.rejects(b.readPhoto(saved), (error) => error.status === 404);
    await assert.rejects(
      a.confirm(candidate.id),
      (error) => error.status === 404,
    );
    const {
      candidates: [pending],
    } = await a.analyze(input());
    await a.logout();
    await assert.rejects(a.photos(), (error) => error.status === 401);
    await assert.rejects(
      flow.confirm("vk:123:456", pending.id),
      /candidate_not_found/,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM garment_photos").get().n,
      1,
    );
  } finally {
    a.close();
    b.close();
    flow.close();
    db.close();
  }
});
