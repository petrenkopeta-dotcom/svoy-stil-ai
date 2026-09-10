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
    server = startStagingServer({ env: { STAGING_DATA_DIR: dir, STAGING_ORIGIN: "https://example.test", VK_APP_ID: "123", VK_APP_SECRET: "synthetic-test-secret", PORT: "0" } });
    await once(server, "listening");
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/staging/vk-session`, { method: "POST", body: "synthetic-input" });
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
  const server = startStagingServer({ env: { STAGING_DATA_DIR: dir, STAGING_ORIGIN: "https://example.test", VK_APP_ID: "123", VK_APP_SECRET: secret, PORT: "0" }, budgetAllowed: () => true });
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/staging/`;
    const raw = `vk_app_id=123&vk_ts=${Math.floor(Date.now() / 1000)}&vk_user_id=456`;
    const headers = { Origin: "https://example.test", "X-CSRF-Intent": "ai-stylist" };
    const login = await fetch(base + "vk-session", { method: "POST", headers, body: `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}` });
    assert.equal(login.status, 200);
    headers.Cookie = login.headers.get("set-cookie").split(";")[0];
    const items = [{ id: "1", category: "shirt", color: "blue" }];
    assert.equal((await fetch(base + "wardrobe", { method: "PUT", headers, body: JSON.stringify(items) })).status, 200);
    assert.deepEqual((await (await fetch(base + "wardrobe", { headers })).json()).items, items);
    assert.equal((await fetch(base + "session", { headers })).status, 200);
    assert.equal((await fetch(base + "photos", { method: "POST", headers, body: "synthetic" })).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true }); }
});
