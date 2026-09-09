import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingPreferencesPersistence, ONBOARDING_PREFERENCES_CONSENT_VERSION, ONBOARDING_PREFERENCES_STORAGE_KEY, ONBOARDING_PROGRESS_SESSION_KEY } from "./onboardingPreferencesPersistence.js";

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("pre-consent answers remain in memory and legacy preferences are removed", () => {
  const storage = new MemoryStorage([["as-prefs", JSON.stringify({ style: "legacy" })]]);
  const adapter = createOnboardingPreferencesPersistence({ storage });
  assert.deepEqual(adapter.begin({ style: "default" }), { preferences: { style: "default" }, consented: false, reloadBehavior: "session_only" });
  adapter.update({ style: "minimal" });
  assert.equal(storage.getItem("as-prefs"), null);
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), null);
});

test("explicit consent performs a versioned save and a new session restores it", () => {
  const storage = new MemoryStorage();
  const now = () => "2026-08-12T12:00:00.000Z";
  const adapter = createOnboardingPreferencesPersistence({ storage, now });
  adapter.begin({ style: "default" });
  adapter.grant({ style: "minimal", limits: ["comfort"] });
  const record = JSON.parse(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY));
  assert.equal(record.schemaVersion, 1);
  assert.deepEqual(record.consent, { granted: true, version: ONBOARDING_PREFERENCES_CONSENT_VERSION, grantedAt: now() });
  assert.deepEqual(createOnboardingPreferencesPersistence({ storage }).begin({}), { preferences: { style: "minimal", limits: ["comfort"] }, consented: true, reloadBehavior: "restored" });
});

test("decline does not block completion and explains reset-on-reload", () => {
  const storage = new MemoryStorage();
  const adapter = createOnboardingPreferencesPersistence({ storage });
  adapter.begin({});
  assert.deepEqual(adapter.decline({ goal: "work" }), { ok: true, preferences: { goal: "work" }, reloadBehavior: "answers_reset_on_reload" });
  assert.equal(adapter.hasDurablePreferences(), false);
});

test("revoke and delete clear current and legacy preference keys", () => {
  for (const operation of ["revoke", "delete"]) {
    const storage = new MemoryStorage([["as-prefs", "legacy"]]);
    const adapter = createOnboardingPreferencesPersistence({ storage });
    adapter.begin({});
    adapter.grant({ style: "casual" });
    adapter[operation]();
    assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), null);
    assert.equal(storage.getItem("as-prefs"), null);
  }
});

test("stale records are rejected and cleared", () => {
  const storage = new MemoryStorage([[ONBOARDING_PREFERENCES_STORAGE_KEY, JSON.stringify({ schemaVersion: 0, preferences: { style: "stale" } })]]);
  const state = createOnboardingPreferencesPersistence({ storage }).begin({ style: "default" });
  assert.equal(state.consented, false);
  assert.deepEqual(state.preferences, { style: "default" });
  assert.equal(storage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), null);
});

test("onboarding progress never uses durable storage and reloads only in the same session", () => {
  const durable = new MemoryStorage([["as-started", "true"], ["as-screen", '"look"']]);
  const session = new MemoryStorage();
  const first = createOnboardingPreferencesPersistence({ storage: durable, sessionStorage: session });
  assert.deepEqual(first.beginProgress(), { started: false, screen: "test", reloadBehavior: "reset_for_new_session" });
  first.updateProgress({ started: true, screen: "wardrobe" });
  assert.equal(durable.getItem("as-started"), null);
  assert.equal(durable.getItem("as-screen"), null);
  assert.equal(durable.getItem(ONBOARDING_PROGRESS_SESSION_KEY), null);
  assert.deepEqual(createOnboardingPreferencesPersistence({ storage: durable, sessionStorage: session }).beginProgress(), {
    started: true, screen: "wardrobe", reloadBehavior: "restored_in_tab",
  });
  assert.deepEqual(createOnboardingPreferencesPersistence({ storage: durable, sessionStorage: new MemoryStorage() }).beginProgress(), {
    started: false, screen: "test", reloadBehavior: "reset_for_new_session",
  });
});

test("delete clears preferences and session-only onboarding progress", () => {
  const durable = new MemoryStorage();
  const session = new MemoryStorage();
  const adapter = createOnboardingPreferencesPersistence({ storage: durable, sessionStorage: session });
  adapter.begin({});
  adapter.beginProgress();
  adapter.grant({ style: "minimal" });
  adapter.updateProgress({ started: true, screen: "look" });
  adapter.delete();
  assert.equal(durable.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY), null);
  assert.equal(session.getItem(ONBOARDING_PROGRESS_SESSION_KEY), null);
});

test("denied browser storage cannot crash Landing, reload restoration, or completion", () => {
  const denied = {
    getItem() { throw new DOMException("denied", "SecurityError"); },
    setItem() { throw new DOMException("denied", "SecurityError"); },
    removeItem() { throw new DOMException("denied", "SecurityError"); },
  };
  const adapter = createOnboardingPreferencesPersistence({ storage: denied, sessionStorage: denied });
  assert.deepEqual(adapter.begin({ goal: "work" }).preferences, { goal: "work" });
  assert.deepEqual(adapter.beginProgress(), { started: false, screen: "test", reloadBehavior: "reset_for_new_session" });
  assert.doesNotThrow(() => adapter.updateProgress({ started: true, screen: "test" }));
  const completion = adapter.grant({ goal: "walk" });
  assert.equal(completion.ok, true);
  assert.equal(completion.persisted, false);
  assert.doesNotThrow(() => adapter.decline({ goal: "walk" }));
});
