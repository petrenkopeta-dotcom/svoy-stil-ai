import test from "node:test";
import assert from "node:assert/strict";
import { createOfflineFirstStorage, DEVICE_NOT_SAVED_MESSAGE } from "./resilientStorage.js";

class FaultyStorage {
  constructor({ denied = false, quota = false, entries = {} } = {}) { this.denied = denied; this.quota = quota; this.values = new Map(Object.entries(entries)); }
  getItem(key) { if (this.denied) throw new DOMException("denied", "SecurityError"); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.denied) throw new DOMException("denied", "SecurityError"); if (this.quota) throw new DOMException("full", "QuotaExceededError"); this.values.set(key, String(value)); }
  removeItem(key) { if (this.denied) throw new DOMException("denied", "SecurityError"); this.values.delete(key); }
}

test("storage denied still completes onboarding in memory without false success", () => {
  const appStorage = createOfflineFirstStorage({ storage: new FaultyStorage({ denied: true }) });
  const saved = appStorage.preferences.write("as-started", true);
  assert.equal(saved.data, true);
  assert.equal(saved.meta.persisted, false);
  assert.equal(saved.meta.code, "storage_unavailable");
  assert.equal(saved.meta.message, DEVICE_NOT_SAVED_MESSAGE);
  assert.equal(appStorage.preferences.read("as-started", false).data, true);
  assert.equal(appStorage.preferences.read("as-started", false).meta.persisted, false);
});

test("an unavailable storage adapter can initialize and operate entirely in memory", () => {
  const appStorage = createOfflineFirstStorage({ storage: null });
  assert.equal(appStorage.preferences.write("as-screen", "wardrobe").meta.code, "storage_unavailable");
  assert.deepEqual(appStorage.repositories.wardrobe.save([{ id: 2 }]).data, [{ id: 2 }]);
  assert.deepEqual(appStorage.repositories.wardrobe.load().data, [{ id: 2 }]);
});

test("quota failure keeps a newly added wardrobe item in memory and reports not persisted", () => {
  const appStorage = createOfflineFirstStorage({ storage: new FaultyStorage({ quota: true }) });
  const result = appStorage.repositories.wardrobe.save([{ id: "new-item", source: "personal" }]);
  assert.equal(result.meta.persisted, false);
  assert.equal(result.meta.code, "quota_exceeded");
  assert.equal(result.meta.message, DEVICE_NOT_SAVED_MESSAGE);
  assert.deepEqual(appStorage.repositories.wardrobe.load().data, [{ id: "new-item", source: "personal" }]);
  assert.equal(appStorage.repositories.wardrobe.load().meta.persisted, false);
});

test("memory cache retains a successful device persistence status", () => {
  const appStorage = createOfflineFirstStorage({ storage: new FaultyStorage() });
  assert.equal(appStorage.preferences.write("as-started", true).meta.persisted, true);
  assert.equal(appStorage.preferences.read("as-started", false).meta.persisted, true);
  assert.equal(appStorage.repositories.wardrobe.save([{ id: 1 }]).meta.persisted, true);
  assert.equal(appStorage.repositories.wardrobe.load().meta.persisted, true);
});

test("corrupt repository data recovers in memory and does not claim device success", () => {
  const key = "ai-stylist:v1:local-warm-mvp-user:wardrobe";
  const appStorage = createOfflineFirstStorage({ storage: new FaultyStorage({ entries: { [key]: "{broken" } }), now: () => "2026-08-12T00:00:00.000Z" });
  const result = appStorage.repositories.wardrobe.load();
  assert.deepEqual(result.data, []);
  assert.equal(result.meta.persisted, false);
  assert.equal(result.meta.code, "corrupt_data");
  assert.equal(result.meta.message, DEVICE_NOT_SAVED_MESSAGE);
});
