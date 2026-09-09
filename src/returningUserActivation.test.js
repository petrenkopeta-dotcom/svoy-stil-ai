import test from "node:test";
import assert from "node:assert/strict";
import {
  createReturningUserActivation,
  RETURNING_USER_SCHEMA_VERSION,
  RETURNING_USER_SESSION_KEY,
  RETURNING_USER_STORAGE_KEY,
} from "./returningUserActivation.js";
import { ONBOARDING_PREFERENCES_CONSENT_VERSION, ONBOARDING_PREFERENCES_STORAGE_KEY } from "./onboardingPreferencesPersistence.js";

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("reload restores in-tab progress and completed onboarding skips the wizard", () => {
  const durable = new MemoryStorage();
  const session = new MemoryStorage();
  const first = createReturningUserActivation({ storage: durable, sessionStorage: session });
  first.bootstrap();
  first.updateProgress({ started: true, screen: "test", step: 3 });
  assert.equal(createReturningUserActivation({ storage: durable, sessionStorage: session }).bootstrap().progress.step, 3);
  first.complete({ preferences: { style: "minimal" }, rememberPreferences: false });
  const restored = createReturningUserActivation({ storage: durable, sessionStorage: session }).bootstrap();
  assert.equal(restored.completed, true);
  assert.deepEqual(restored.progress, { started: true, screen: "wardrobe" });
});

test("decline keeps the local session active without durable writes", () => {
  const durable = new MemoryStorage();
  const session = new MemoryStorage();
  const controller = createReturningUserActivation({ storage: durable, sessionStorage: session });
  controller.bootstrap();
  const result = controller.complete({ preferences: { goal: "work" }, rememberPreferences: false });
  assert.equal(result.completed, true);
  assert.equal(durable.writes, 0);
  assert.equal(durable.getItem(RETURNING_USER_STORAGE_KEY), null);
  assert.ok(session.getItem(RETURNING_USER_SESSION_KEY));
});

test("consent persists completion and preferences for a new session", () => {
  const durable = new MemoryStorage();
  const first = createReturningUserActivation({ storage: durable, sessionStorage: new MemoryStorage(), now: () => "2026-08-14T00:00:00.000Z" });
  first.bootstrap();
  first.complete({ preferences: { style: "classic" }, rememberPreferences: true });
  const restored = createReturningUserActivation({ storage: durable, sessionStorage: new MemoryStorage() }).bootstrap();
  assert.equal(restored.completed, true);
  assert.equal(restored.consented, true);
  assert.deepEqual(restored.preferences, { style: "classic" });
  assert.equal(JSON.parse(durable.getItem(RETURNING_USER_STORAGE_KEY)).schemaVersion, RETURNING_USER_SCHEMA_VERSION);
});

test("legacy consent schema migrates to the current completed-user record", () => {
  const legacy = { schemaVersion: 1, consent: { granted: true, version: ONBOARDING_PREFERENCES_CONSENT_VERSION }, preferences: { style: "legacy" } };
  const durable = new MemoryStorage([[ONBOARDING_PREFERENCES_STORAGE_KEY, JSON.stringify(legacy)]]);
  const state = createReturningUserActivation({ storage: durable, sessionStorage: new MemoryStorage() }).bootstrap();
  assert.equal(state.completed, true);
  assert.equal(JSON.parse(durable.getItem(RETURNING_USER_STORAGE_KEY)).migratedFrom, 1);
});

test("corrupt records are discarded and defaults remain usable", () => {
  const durable = new MemoryStorage([[RETURNING_USER_STORAGE_KEY, "{bad"]]);
  const session = new MemoryStorage([[RETURNING_USER_SESSION_KEY, JSON.stringify({ schemaVersion: 2, completed: "yes" })]]);
  const state = createReturningUserActivation({ storage: durable, sessionStorage: session }).bootstrap({ preferences: { style: "default" } });
  assert.equal(state.completed, false);
  assert.deepEqual(state.preferences, { style: "default" });
  assert.equal(durable.getItem(RETURNING_USER_STORAGE_KEY), null);
  assert.equal(session.getItem(RETURNING_USER_SESSION_KEY), null);
});

test("future schema is ignored but preserved for a newer client", () => {
  const raw = JSON.stringify({ schemaVersion: 99, completed: true, preferences: { style: "future" } });
  const durable = new MemoryStorage([[RETURNING_USER_STORAGE_KEY, raw]]);
  const state = createReturningUserActivation({ storage: durable, sessionStorage: new MemoryStorage() }).bootstrap();
  assert.equal(state.completed, false);
  assert.equal(durable.getItem(RETURNING_USER_STORAGE_KEY), raw);
});
