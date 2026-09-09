import test from "node:test";
import assert from "node:assert/strict";
import { loadProfileAvatar, normalizeProfileAvatar, PROFILE_AVATAR_KEY, saveProfileAvatar } from "./profileAvatar.js";

test("profile avatar is limited to the selected 01-09 series", () => {
  assert.equal(normalizeProfileAvatar(1), 1);
  assert.equal(normalizeProfileAvatar("9"), 9);
  assert.equal(normalizeProfileAvatar(0), 1);
  assert.equal(normalizeProfileAvatar(10), 1);
});

test("profile avatar persists locally and storage failures stay safe", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(saveProfileAvatar(6, storage), 6);
  assert.equal(data.get(PROFILE_AVATAR_KEY), "6");
  assert.equal(loadProfileAvatar(storage), 6);
  assert.equal(loadProfileAvatar({ getItem() { throw new Error("denied"); } }), 1);
});
