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
  const sessions = createSqliteSessionStore({ filename: path.join(dir, "sessions.db"), now: () => 1800000000000 });
  const origin = "https://staging.example.test";
  const secret = "synthetic-test-secret-only";
  let allowed = true;
  const handler = createStagingApi({ db, sessions, origin, secret, appId: "123", now: () => 1800000000000, budgetAllowed: () => allowed });
  const request = (route, method = "GET", body, cookie) => handler(new Request(`${origin}/api/staging/${route}`, { method, headers: { origin, "x-csrf-intent": "ai-stylist", ...(cookie ? { cookie } : {}) }, body }));
  try {
    const login = async (user) => {
      const raw = `vk_app_id=123&vk_ts=1800000000&vk_user_id=${user}`;
      const response = await request("vk-session", "POST", `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`);
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const a = await login("456"), b = await login("789");
    assert.equal((await request("wardrobe", "PUT", JSON.stringify([{ id: "1", category: "coat", color: "blue" }]), a)).status, 200);
    assert.equal((await (await request("wardrobe", "GET", undefined, a)).json()).items.length, 1);
    assert.deepEqual((await (await request("wardrobe", "GET", undefined, b)).json()).items, []);
    assert.equal((await request("wardrobe", "PUT", JSON.stringify([{ id: "1", photo: "data:image/png;base64,AQID" }]), a)).status, 422);
    assert.equal((await request("wardrobe?owner=456", "GET", undefined, b)).status, 400);
    assert.equal((await request("wardrobe")).status, 401);
    await request("logout", "POST", "", a);
    assert.equal((await request("wardrobe", "GET", undefined, a)).status, 401);
    allowed = false;
    assert.equal((await request("wardrobe", "GET", undefined, b)).status, 503);
  } finally { sessions.close(); db.close(); await rm(dir, { recursive: true }); }
});
