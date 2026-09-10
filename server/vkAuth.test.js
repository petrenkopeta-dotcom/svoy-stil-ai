import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyVkLaunch } from "./vkAuth.mjs";
const secret = "synthetic-test-secret-only";
const now = 1800000000000;
const raw = "vk_app_id=123&vk_ts=1800000000&vk_user_id=456";
const sign = createHmac("sha256", secret).update(raw).digest("base64url");
const signed = `${raw}&sign=${sign}`;
test("VK server verifies app-bound HMAC and rejects altered identities/replays", () => {
  assert.equal(verifyVkLaunch(signed, { secret, appId: "123", now }).userId, "vk:123:456");
  for (const input of [raw, signed.replace("456", "457"), `${signed}&vk_user_id=456`, `${signed}&sign=${sign}`]) assert.throws(() => verifyVkLaunch(input, { secret, appId: "123", now }), /invalid_vk_launch/);
  assert.throws(() => verifyVkLaunch(signed, { secret, appId: "124", now }), /invalid_vk_launch/);
  assert.throws(() => verifyVkLaunch(signed, { secret, appId: "123", now: now + 301000 }), /invalid_vk_launch/);
  assert.throws(() => verifyVkLaunch(signed, { secret, appId: "123", now: now - 31000 }), /invalid_vk_launch/);
});
