import test from "node:test";
import assert from "node:assert/strict";
import { createCloudPersistenceRepository, MemoryOutbox } from "./CloudPersistenceRepository.js";
import { createSupabaseDataPort } from "./SupabaseDataPort.js";

const mutation = { userId: "user-1", entityId: "item-1", idempotencyKey: "idem-1", expectedVersion: 2, value: { name: "coat" } };

test("cloud mutation is successful only after owner and version read-back", async () => {
  const calls = [];
  const repo = createCloudPersistenceRepository({ port: { async upsert(domain, value) { calls.push(["write", domain]); return { version: value.expectedVersion }; }, async read(domain) { calls.push(["read", domain]); return { id: "item-1", user_id: "user-1", version: 2, idempotency_key: "idem-1" }; } } });
  const result = await repo.mutate("wardrobe", mutation);
  assert.equal(result.status, "acknowledged"); assert.equal(result.durable, true);
  assert.deepEqual(calls, [["write", "wardrobe"], ["read", "wardrobe"]]);
});

test("missing provider queues explicit pending work and never claims durable success", async () => {
  const outbox = new MemoryOutbox();
  const repo = createCloudPersistenceRepository({ outbox });
  const result = await repo.mutate("outfits", mutation);
  assert.deepEqual({ status: result.status, durable: result.durable, queued: result.queued }, { status: "pending", durable: false, queued: true });
  assert.equal((await outbox.list()).length, 1);
});

test("retries transient failures with backoff then verifies acknowledgement", async () => {
  let attempts = 0; const delays = [];
  const repo = createCloudPersistenceRepository({ sleep: async (ms) => delays.push(ms), port: { async upsert() { attempts += 1; if (attempts < 3) throw Object.assign(new Error("offline"), { code: "offline" }); return { version: 2 }; }, async read() { return { user_id: "user-1", version: 2, idempotency_key: "idem-1" }; } } });
  assert.equal((await repo.mutate("feedback", mutation)).status, "acknowledged");
  assert.deepEqual(delays, [100, 200]);
});

test("stale read-back is a conflict and is not acknowledged", async () => {
  const repo = createCloudPersistenceRepository({ port: { async upsert() { return { version: 2 }; }, async read() { return { user_id: "user-1", version: 1, idempotency_key: "idem-1" }; } } });
  const result = await repo.mutate("shoppingDrafts", mutation);
  assert.equal(result.status, "conflict"); assert.equal(result.ok, false);
});

test("photos fail closed without consent and require durable object receipt", async () => {
  let uploads = 0;
  const repo = createCloudPersistenceRepository({ port: { async upsert() {}, async read() {}, async uploadPhoto() { uploads += 1; return { durable: true, bucket: "wardrobe-photos", path: "user-1/item-1/idem-1", etag: "abc" }; } } });
  assert.equal((await repo.savePhoto({ blob: new Blob(["x"], { type: "image/jpeg" }), userId: "user-1", entityId: "item-1", idempotencyKey: "idem-1" })).code, "consent_required");
  const saved = await repo.savePhoto({ blob: new Blob(["x"], { type: "image/jpeg" }), consent: { granted: true, policyVersion: "photo-v1" }, userId: "user-1", entityId: "item-1", idempotencyKey: "idem-1" });
  assert.equal(saved.status, "acknowledged"); assert.equal(uploads, 1);
});

test("Supabase port sends authenticated REST upsert and owner-scoped read-back", async () => {
  const calls = [];
  const port = createSupabaseDataPort({ request: async (input) => { calls.push(input); return input.method === "POST" ? [{ version: 2, idempotency_key: "idem-1" }] : [{ user_id: "user-1" }]; } });
  await port.upsert("wardrobe", mutation); await port.read("wardrobe", "user-1", "item-1");
  assert.match(calls[0].path, /wardrobe_items\?on_conflict=id/); assert.match(calls[1].path, /user_id=eq.user-1&id=eq.item-1/);
  assert.equal(calls[0].headers.Prefer, "resolution=merge-duplicates,return=representation");
});
