import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingPreferencesPersistence, ONBOARDING_PREFERENCES_STORAGE_KEY, ONBOARDING_PREFERENCES_TRANSACTION_KEY } from "./onboardingPreferencesPersistence.js";

class Storage {
  constructor() { this.values = new Map(); this.fail = null; this.stale = false; }
  getItem(key) { if (this.fail === "read") throw new Error("unavailable"); return this.stale ? null : this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail === "quota") throw new DOMException("full", "QuotaExceededError"); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("verified grant rolls draft back on quota and can retry", () => {
  const storage = new Storage();
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage(), now: () => "2026-08-20T00:00:00.000Z" });
  persistence.begin({ style: "Smart casual" });
  storage.fail = "quota";
  const failed = persistence.grant({ style: "Minimal" });
  assert.equal(failed.persisted, false); assert.equal(failed.code, "quota_exceeded"); assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), null);
  storage.fail = null;
  const retried = persistence.grant({ style: "Minimal" });
  assert.equal(retried.persisted, true); assert.equal(persistence.export().preferences.style, "Minimal");
});

test("write without matching read-back never reports saved", () => {
  const storage = new Storage();
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  persistence.begin({ goal: "Работа" }); storage.stale = true;
  const result = persistence.grant({ goal: "Встреча" });
  assert.equal(result.persisted, false); assert.equal(result.ok, true); assert.equal(result.code, "storage_unavailable");
});

test("read-back error after publication restores and verifies the previous durable record", () => {
  const storage = new Storage();
  const first = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage(), now: () => "2026-08-20T00:00:00.000Z" });
  first.begin({ goal: "Работа" }); first.grant({ goal: "Работа" });
  const previousRaw = storage.values.get(ONBOARDING_PREFERENCES_STORAGE_KEY);
  let failOnce = true;
  const originalGet = storage.getItem.bind(storage);
  storage.getItem = (key) => {
    if (key === ONBOARDING_PREFERENCES_STORAGE_KEY && failOnce && storage.values.get(key) !== previousRaw) { failOnce = false; throw new Error("read denied"); }
    return originalGet(key);
  };
  const result = first.grant({ goal: "Встреча" });
  assert.equal(result.persisted, false);
  assert.equal(result.restored, true);
  assert.equal(result.restoreVerified, true);
  assert.equal(storage.values.get(ONBOARDING_PREFERENCES_STORAGE_KEY), previousRaw);
  assert.equal(storage.values.has(ONBOARDING_PREFERENCES_TRANSACTION_KEY), false);
});

test("stale expectedVersion conflicts without overwriting another tab", () => {
  const storage = new Storage();
  const seed = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  seed.begin({ goal: "Работа" }); seed.grant({ goal: "Работа" });
  const tabA = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  const tabB = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  tabA.begin({}); tabB.begin({});
  assert.equal(tabA.grant({ goal: "Встреча" }).persisted, true);
  const winnerRaw = storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY);
  const conflict = tabB.grant({ goal: "Прогулка" });
  assert.equal(conflict.state, "conflict");
  assert.equal(conflict.code, "version_conflict");
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), winnerRaw);
});

test("unproven restore is recovery_required and next load recovers a crash-like publication", () => {
  const storage = new Storage();
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage(), now: () => "2026-08-20T00:00:00.000Z" });
  persistence.begin({ style: "Casual" }); persistence.grant({ style: "Casual" });
  const previousRaw = storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY);
  let readsAfterPublish = 0;
  const originalGet = storage.getItem.bind(storage);
  storage.getItem = (key) => {
    if (key === ONBOARDING_PREFERENCES_STORAGE_KEY && storage.values.get(key) !== previousRaw && ++readsAfterPublish >= 1) throw new Error("read unavailable");
    return originalGet(key);
  };
  const failed = persistence.grant({ style: "Minimal" });
  assert.equal(failed.state, "recovery_required");
  assert.equal(failed.restoreVerified, false);
  assert.equal(storage.values.has(ONBOARDING_PREFERENCES_TRANSACTION_KEY), true);
  storage.getItem = originalGet;
  const reloaded = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  assert.equal(reloaded.begin({}).preferences.style, "Casual");
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), previousRaw);
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_TRANSACTION_KEY), null);
});

test("recovery never restores over a newer foreign durable value", () => {
  const storage = new Storage();
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  persistence.begin({ style: "Casual" }); persistence.grant({ style: "Casual" });
  const previousRaw = storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY);
  const candidate = JSON.parse(previousRaw); candidate.version += 1; candidate.preferences.style = "Minimal"; candidate.transactionId = "crashed";
  const foreign = { ...candidate, version: candidate.version + 1, transactionId: "other-tab", preferences: { style: "Romantic" } };
  storage.setItem(ONBOARDING_PREFERENCES_TRANSACTION_KEY, JSON.stringify({ schemaVersion: 1, storageKey: ONBOARDING_PREFERENCES_STORAGE_KEY, transactionId: "crashed", previousRaw, candidateRaw: JSON.stringify(candidate) }));
  storage.setItem(ONBOARDING_PREFERENCES_STORAGE_KEY, JSON.stringify(foreign));
  const reloaded = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  assert.equal(reloaded.begin({}).preferences.style, "Romantic");
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_TRANSACTION_KEY), null);
});

test("delete is idempotent and clears an unfinished transaction", () => {
  const storage = new Storage();
  storage.setItem(ONBOARDING_PREFERENCES_TRANSACTION_KEY, "{broken");
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new Storage() });
  assert.doesNotThrow(() => persistence.delete());
  assert.doesNotThrow(() => persistence.delete());
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_TRANSACTION_KEY), null);
});
