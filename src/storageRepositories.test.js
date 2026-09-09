import test from "node:test";
import assert from "node:assert/strict";
import { createLocalRepositories, createObjectUrlRegistry, LOCAL_OWNER_ID, RepositoryError } from "./storageRepositories.js";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.failWrites = false; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (this.failWrites) { const error = new Error("full"); error.name = "QuotaExceededError"; throw error; } this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const fixedNow = () => "2026-08-12T10:00:00.000Z";

test("migrates current legacy keys into a versioned envelope without losing records", () => {
  const storage = new MemoryStorage({ "as-wardrobe": JSON.stringify([{ id: 7, name: "coat" }]) });
  const repos = createLocalRepositories({ storage, now: fixedNow });
  const result = repos.wardrobe.load();
  assert.deepEqual(result.data, [{ id: 7, name: "coat" }]);
  assert.equal(result.meta.migrated, true);
  assert.equal(storage.getItem("as-wardrobe"), null);
  assert.match([...storage.values.values()][0], /"schemaVersion":1/);
});

test("retains legacy data when migration cannot be committed because quota is full", () => {
  const legacy = JSON.stringify([{ id: 1 }]);
  const storage = new MemoryStorage({ "as-wardrobe": legacy });
  storage.failWrites = true;
  const repos = createLocalRepositories({ storage, now: fixedNow });
  assert.throws(() => repos.wardrobe.load(), (error) => error instanceof RepositoryError && error.code === "quota_exceeded");
  assert.equal(storage.getItem("as-wardrobe"), legacy);
});

test("quarantines corrupt data and recovers with a safe domain default", () => {
  const storage = new MemoryStorage();
  const repos = createLocalRepositories({ storage, now: fixedNow });
  repos.wardrobe.save([{ id: 1 }]);
  const key = [...storage.values.keys()][0];
  storage.setItem(key, "{broken");
  const result = repos.wardrobe.load();
  assert.deepEqual(result.data, []);
  assert.equal(result.meta.warning, "corrupt_data");
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.getItem(`${key}:corrupt:${fixedNow()}`), "{broken");
});

test("isolates owners and repository domains", () => {
  const storage = new MemoryStorage();
  const alice = createLocalRepositories({ storage, ownerId: "alice", now: fixedNow });
  const bob = createLocalRepositories({ storage, ownerId: "bob", now: fixedNow });
  alice.wardrobe.save([{ id: "alice-item" }]);
  alice.outfits.save([{ id: "alice-look" }]);
  bob.wardrobe.save([{ id: "bob-item" }]);
  assert.deepEqual(alice.wardrobe.load().data, [{ id: "alice-item" }]);
  assert.deepEqual(bob.wardrobe.load().data, [{ id: "bob-item" }]);
  assert.deepEqual(bob.outfits.load().data, []);
});

test("export scrubs transient object URLs and delete removes only the selected owner", () => {
  const storage = new MemoryStorage();
  const local = createLocalRepositories({ storage, ownerId: LOCAL_OWNER_ID, now: fixedNow });
  const other = createLocalRepositories({ storage, ownerId: "other", now: fixedNow });
  local.wardrobe.save([{ id: 1, photo: "blob:temporary" }, { id: 2, photo: "data:image/png;base64,AA" }]);
  other.wardrobe.save([{ id: 3 }]);
  const exported = local.exportAll();
  assert.equal(exported.data.wardrobe[0].photo, null);
  assert.equal(exported.data.wardrobe[1].photo, "data:image/png;base64,AA");
  local.deleteAll();
  assert.deepEqual(local.wardrobe.load().data, []);
  assert.deepEqual(other.wardrobe.load().data, [{ id: 3 }]);
});

test("object URL registry revokes URLs on replace, release, and dispose", () => {
  let sequence = 0;
  const revoked = [];
  const registry = createObjectUrlRegistry({ createObjectURL: () => `blob:${++sequence}`, revokeObjectURL: (url) => revoked.push(url) });
  registry.create("item-1", {});
  registry.create("item-1", {});
  registry.create("item-2", {});
  registry.release("item-1");
  registry.dispose();
  assert.deepEqual(revoked, ["blob:1", "blob:2", "blob:3"]);
  assert.equal(registry.size, 0);
});

