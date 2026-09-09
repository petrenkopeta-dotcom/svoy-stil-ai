import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingCompletionBoundary } from "./onboardingCompletionBoundary.js";
import { createOnboardingPreferencesPersistence } from "./onboardingPreferencesPersistence.js";

class FaultyStorage {
  constructor(mode) { this.mode = mode; this.values = new Map(); }
  getItem(key) { if (this.mode === "denied") throw new DOMException("denied", "SecurityError"); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.mode === "denied") throw new DOMException("denied", "SecurityError"); if (this.mode === "quota") throw new DOMException("full", "QuotaExceededError"); this.values.set(key, String(value)); }
  removeItem(key) { if (this.mode === "denied") throw new DOMException("denied", "SecurityError"); this.values.delete(key); }
}
const safeSession = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

for (const [mode, code] of [["denied", "storage_unavailable"], ["quota", "quota_exceeded"]]) {
  test(`${mode} storage cannot block local onboarding completion`, async () => {
    const preferencesPersistence = createOnboardingPreferencesPersistence({ storage: new FaultyStorage(mode), sessionStorage: safeSession });
    const boundary = createOnboardingCompletionBoundary({ preferencesPersistence });
    const result = await boundary.complete({ idempotencyKey: `finish-${mode}`, preferences: { style: "minimal" }, rememberPreferences: true });
    assert.equal(result.ok, true);
    assert.equal(result.localCompleted, true);
    assert.equal(result.persistence.persisted, false);
    assert.equal(result.persistence.code, code);
    assert.equal(result.profileSync.code, "profile_api_unavailable");
  });
}

test("unavailable Profile API is a sync warning, not a local completion error", async () => {
  const preferencesPersistence = createOnboardingPreferencesPersistence({ storage: new FaultyStorage(), sessionStorage: safeSession });
  const profileApi = { completeOnboarding: async () => { throw new Error("offline"); } };
  const result = await createOnboardingCompletionBoundary({ preferencesPersistence, profileApi }).complete({ idempotencyKey: "offline", preferences: {}, rememberPreferences: false });
  assert.equal(result.ok, true);
  assert.equal(result.localCompleted, true);
  assert.equal(result.profileSync.code, "profile_api_unavailable");
});

test("concurrent double click and later replay invoke persistence and Profile API once", async () => {
  let saves = 0;
  let apiCalls = 0;
  const preferencesPersistence = { grant: () => { saves += 1; return { ok: true }; }, decline: () => { throw new Error("unused"); } };
  const profileApi = { completeOnboarding: async () => { apiCalls += 1; return { ok: true }; } };
  const boundary = createOnboardingCompletionBoundary({ preferencesPersistence, profileApi });
  const command = { idempotencyKey: "same", preferences: { goal: "work" }, rememberPreferences: true };
  const [first, concurrent] = await Promise.all([boundary.complete(command), boundary.complete(command)]);
  const replay = await boundary.complete(command);
  assert.deepEqual(concurrent, first);
  assert.equal(replay.replayed, true);
  assert.equal(saves, 1);
  assert.equal(apiCalls, 1);
});

test("missing key fails before any side effect", async () => {
  let called = false;
  const boundary = createOnboardingCompletionBoundary({ preferencesPersistence: { grant: () => { called = true; } } });
  assert.deepEqual(await boundary.complete({ rememberPreferences: true }), { ok: false, localCompleted: false, code: "idempotency_key_required" });
  assert.equal(called, false);
});
