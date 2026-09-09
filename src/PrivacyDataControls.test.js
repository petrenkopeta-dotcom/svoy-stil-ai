import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalRepositories } from "./storageRepositories.js";
import { CONTEXT_STORAGE_KEY, persistContext } from "./contextAdapter.js";
import { createPrivacyDataController, PRIVACY_DELETION_RESULT_KEY } from "./privacyDataController.js";
import { createOnboardingPreferencesPersistence } from "./onboardingPreferencesPersistence.js";
import { PROFILE_AVATAR_KEY } from "./profileAvatar.js";
import { RETURNING_USER_SESSION_KEY, RETURNING_USER_STORAGE_KEY } from "./returningUserActivation.js";
import { PRODUCT_TOUR_KEY } from "./productTour.js";
import { DEMO_PERSONAL_STORAGE_KEY } from "./demoPersonalFlow.js";
import { TELEMETRY_STORAGE_KEYS } from "./telemetry/localCollector.js";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const now = () => "2026-08-12T12:00:00.000Z";

function fixture() {
  const storage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const repositories = createLocalRepositories({ storage, now });
  const onboardingPersistence = createOnboardingPreferencesPersistence({ storage, sessionStorage, now });
  return {
    storage, sessionStorage, repositories, onboardingPersistence,
    controller: createPrivacyDataController({ repositories, storage, sessionStorage, onboardingPersistence, now }),
  };
}

test("exports repository, profile, preferences, and context without temporary blob URLs", () => {
  const f = fixture();
  f.repositories.wardrobe.save([{ id: 1, photo: "blob:temporary" }, { id: 2, photo: "data:image/png;base64,AA" }]);
  f.repositories.learningProfile.save({ revision: 3 });
  f.onboardingPersistence.grant({ style: "minimal", preview: "blob:profile-preview" });
  persistContext(f.storage, { occasion: "office" }, { consent: true, now: now() });
  const exported = f.controller.exportData();
  assert.equal(exported.data.wardrobe[0].photo, null);
  assert.equal(exported.data.learningProfile.revision, 3);
  assert.equal(exported.data.preferences.preferences.preview, null);
  assert.equal(exported.data.context.occasion, "office");
  assert.equal(f.controller.exportHref().startsWith("data:application/json"), true);
  assert.equal(f.controller.exportHref().includes("blob%3A"), false);
});

test("reset removes profile, preferences, and recommendations but preserves wardrobe and context", () => {
  const f = fixture();
  f.repositories.wardrobe.save([{ id: 1 }]);
  f.repositories.outfits.save([{ id: 2 }]);
  f.repositories.learningProfile.save({ revision: 3 });
  f.onboardingPersistence.grant({ style: "minimal" });
  persistContext(f.storage, { occasion: "office" }, { consent: true });
  f.controller.resetProfile();
  assert.deepEqual(f.repositories.wardrobe.load().data, [{ id: 1 }]);
  assert.deepEqual(f.repositories.outfits.load().data, []);
  assert.equal(f.repositories.learningProfile.load().data, null);
  assert.equal(f.onboardingPersistence.export(), null);
  assert.notEqual(f.storage.getItem(CONTEXT_STORAGE_KEY), null);
});

test("delete clears all repository and service-owned local data, including legacy keys and photos", async () => {
  const f = fixture();
  f.storage.setItem("as-wardrobe", "[]");
  f.repositories.wardrobe.save([{ id: 1 }]);
  f.repositories.outfits.save([{ id: 2 }]);
  f.repositories.learningProfile.save({ revision: 1 });
  f.repositories.consent.save({ granted: true });
  f.onboardingPersistence.grant({ style: "minimal" });
  persistContext(f.storage, { occasion: "office" }, { consent: true });
  let disposed = 0;
  let photosDeleted = 0;
  const controller = createPrivacyDataController({
    repositories: f.repositories, storage: f.storage, sessionStorage: f.sessionStorage,
    onboardingPersistence: f.onboardingPersistence, objectUrlRegistry: { dispose: () => disposed++ },
    photoStorage: { deleteAll: async () => photosDeleted++ }, now,
  });
  await controller.deleteAll();
  assert.deepEqual(f.repositories.wardrobe.load().data, []);
  assert.deepEqual(f.repositories.outfits.load().data, []);
  assert.equal(f.repositories.learningProfile.load().data, null);
  assert.deepEqual(f.repositories.consent.load().data, { granted: false, policyVersion: null, grantedAt: null });
  assert.equal(f.storage.getItem("as-wardrobe"), null);
  assert.equal(f.storage.getItem(CONTEXT_STORAGE_KEY), null);
  assert.equal(f.onboardingPersistence.export(), null);
  assert.equal(disposed, 1);
  assert.equal(photosDeleted, 1);
});

test("deletion result survives one reload and is consumed once", async () => {
  const f = fixture();
  await f.controller.deleteAll();
  assert.notEqual(f.sessionStorage.getItem(PRIVACY_DELETION_RESULT_KEY), null);
  assert.deepEqual(f.controller.consumeDeletionResult(), { ok: true, completedAt: now() });
  assert.equal(f.controller.consumeDeletionResult(), null);
});

test("delete is idempotent and leaves no profile journey residues", async () => {
  const f = fixture();
  for (const key of [PROFILE_AVATAR_KEY, RETURNING_USER_STORAGE_KEY, DEMO_PERSONAL_STORAGE_KEY, PRODUCT_TOUR_KEY, ...Object.values(TELEMETRY_STORAGE_KEYS)]) f.storage.setItem(key, "residue");
  for (const key of [RETURNING_USER_SESSION_KEY, ...Object.values(TELEMETRY_STORAGE_KEYS)]) f.sessionStorage.setItem(key, "residue");
  await f.controller.deleteAll();
  await f.controller.deleteAll();
  for (const key of [PROFILE_AVATAR_KEY, RETURNING_USER_STORAGE_KEY, DEMO_PERSONAL_STORAGE_KEY, PRODUCT_TOUR_KEY, ...Object.values(TELEMETRY_STORAGE_KEYS)]) assert.equal(f.storage.getItem(key), null);
  for (const key of [RETURNING_USER_SESSION_KEY, ...Object.values(TELEMETRY_STORAGE_KEYS)]) assert.equal(f.sessionStorage.getItem(key), null);
});

test("delete still clears JSON domains when photo cleanup fails", async () => {
  const f = fixture();
  f.repositories.wardrobe.save([{ id: 1 }]);
  const failure = new Error("photo database unavailable");
  const controller = createPrivacyDataController({ repositories: f.repositories, storage: f.storage, sessionStorage: f.sessionStorage, onboardingPersistence: f.onboardingPersistence, photoStorage: { deleteAll: async () => { throw failure; } }, now });
  await assert.rejects(controller.deleteAll(), failure);
  assert.deepEqual(f.repositories.wardrobe.load().data, []);
});

test("privacy controls stay isolated from the application entry point", () => {
  const source = readFileSync(new URL("./PrivacyDataControls.jsx", import.meta.url), "utf8");
  assert.match(source, /export function PrivacyDataControls/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|removeItem|setItem/);
});
