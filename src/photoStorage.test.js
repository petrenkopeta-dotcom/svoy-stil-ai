import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoStorage, MemoryPhotoBackend, PHOTO_POLICY_VERSION, PHOTO_STORAGE_CODES, prepareLegacyPhotoMigration } from "./photoStorage.js";

const consent = { granted: true, policyVersion: PHOTO_POLICY_VERSION, grantedAt: "2026-08-14T00:00:00.000Z" };
const image = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

test("photo storage requires explicit versioned consent", async () => {
  await assert.rejects(createPhotoStorage({ backend: new MemoryPhotoBackend() }).save(image(), { granted: true }), (error) => error.code === PHOTO_STORAGE_CODES.CONSENT_REQUIRED);
});

test("photo storage stores Blob and deletes expired data", async () => {
  let time = 100;
  const store = createPhotoStorage({ backend: new MemoryPhotoBackend(), now: () => time, randomId: () => "p1", retentionMs: 10 });
  assert.equal((await store.save(image(), consent)).id, "p1");
  assert.equal((await store.get("p1")).blob.size, 3);
  time = 111;
  await assert.rejects(store.get("p1"), (error) => error.code === PHOTO_STORAGE_CODES.NOT_FOUND);
});

test("memory fallback is explicitly non-persistent", async () => {
  const store = createPhotoStorage({ indexedDB: null, randomId: () => "fallback" });
  assert.equal(store.persisted, false);
  assert.equal((await store.save(image(), consent)).meta.persisted, false);
});

test("quota failures have a stable code", async () => {
  const backend = new MemoryPhotoBackend();
  backend.put = async () => { throw new DOMException("full", "QuotaExceededError"); };
  await assert.rejects(createPhotoStorage({ backend }).save(image(), consent), (error) => error.code === PHOTO_STORAGE_CODES.QUOTA_EXCEEDED);
});

test("legacy migration is copy-first and rollback-safe", async () => {
  const store = createPhotoStorage({ backend: new MemoryPhotoBackend(), randomId: () => "migrated" });
  const original = [{ id: "garment", imageUrl: "data:image/png;base64,AQID" }];
  const migration = await prepareLegacyPhotoMigration(original, store, consent);
  assert.equal(original[0].imageUrl.startsWith("data:"), true);
  assert.deepEqual(migration.items[0].imageUrl, { photoId: "migrated" });
  assert.equal(migration.backup[0].dataUrl, original[0].imageUrl);
  assert.deepEqual(await migration.rollback(), original);
  await assert.rejects(store.get("migrated"), (error) => error.code === PHOTO_STORAGE_CODES.NOT_FOUND);
});

test("deleteAll clears photo bytes", async () => {
  const store = createPhotoStorage({ backend: new MemoryPhotoBackend(), randomId: () => "p1" });
  await store.save(image(), consent); await store.deleteAll();
  await assert.rejects(store.get("p1"), (error) => error.code === PHOTO_STORAGE_CODES.NOT_FOUND);
});

test("delete returns a verifiable local receipt", async () => {
  const store = createPhotoStorage({ backend: new MemoryPhotoBackend(), randomId: () => "receipt", now: () => 77 });
  await store.save(image(), consent); const receipt = await store.delete("receipt");
  assert.deepEqual(receipt, { receiptVersion: "photo-delete-receipt-v1", id: "receipt", deleted: true, deletedAt: 77 });
});

test("deleteExpired removes all due records", async () => {
  let time = 1; let id = 0;
  const store = createPhotoStorage({ backend: new MemoryPhotoBackend(), now: () => time, retentionMs: 5, randomId: () => `p${++id}` });
  await store.save(image(), consent); await store.save(image(), consent); time = 7;
  assert.deepEqual(await store.deleteExpired(), { deleted: 2 });
});
