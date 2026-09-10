import test from "node:test";
import assert from "node:assert/strict";
import { createVkStagingClient } from "./vkStagingClient.js";
test("VK client sends launch only in same-origin body and verifies saved metadata by read-back", async () => {
  const calls = []; const items = [{ id: "1", category: "shirt", color: "blue" }];
  const client = createVkStagingClient({ launch: "vk_user_id=synthetic&sign=synthetic", fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith("wardrobe") && options.method === "GET" ? { items } : {} };
  } });
  await client.login(); await client.save(items); await client.login();
  assert.equal(calls[0].url, "/api/staging/vk-session");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.body, "vk_user_id=synthetic&sign=synthetic");
  assert.equal(calls.at(-1).url, "/api/staging/session");
  assert.equal(calls.some((x) => x.url.includes("sign")), false);
});
test("failed read-back never becomes successful save", async () => {
  const client = createVkStagingClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) });
  await assert.rejects(client.save([{ id: "1" }]), /readback_mismatch/);
});
