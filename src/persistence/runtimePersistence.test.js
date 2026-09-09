import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimePersistence } from "./runtimePersistence.js";

const local = () => { let data = []; return { save(value) { data = structuredClone(value); return { meta: { schemaVersion: 1 } }; }, load() { return { data: structuredClone(data) }; } }; };
test("authenticated mutation is cloud-saved only after verified typed acknowledgement", async () => {
  const states = [];
  const runtime = createRuntimePersistence({ cloudRepository: { available: true, flush: async()=>[], mutate: async (_domain, mutation) => ({ status: "acknowledged", durable: true, entity: { user_id: mutation.userId }, version: 2 }) }, getAuthState: () => ({ status: "authenticated", session: { userId: "owner" } }), onResult: (result) => states.push(result.state) });
  const result = await runtime.persist({ domain: "wardrobe", localRepository: local(), value: [{ id: "g1" }], entityId: "g1", expectedVersion: 2, idempotencyKey: "wardrobe:g1:v2" });
  assert.equal(result.state, "saved_cloud_verified"); assert.deepEqual(states, ["syncing", "saved_cloud_verified"]);
});
test("provider pending is explicit offline queue while local read-back remains durable", async () => {
  const runtime = createRuntimePersistence({ cloudRepository: { available: false, flush: async()=>[], mutate: async () => ({ status: "pending", queued: true, code: "provider_unavailable" }) }, getAuthState: () => ({ status: "authenticated", session: { userId: "owner" } }) });
  const result = await runtime.persist({ domain: "outfits", localRepository: local(), value: [{ id: "o1" }], entityId: "o1", idempotencyKey: "outfit:o1" });
  assert.equal(result.state, "offline_queued"); assert.equal(result.evidence.durable, true);
});
