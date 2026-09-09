import test from "node:test";
import assert from "node:assert/strict";
import { PERSISTENCE_STATES, persistenceCopy, saveLocally, saveWithVerification } from "./persistenceState.js";

test("local success requires durable read-back and never claims account persistence", () => {
  let stored = null;
  const repository = { save(value) { stored = structuredClone(value); return { meta: { version: 2 } }; }, load() { return { data: structuredClone(stored) }; } };
  const outcome = saveLocally(repository, { name: "coat" });
  assert.equal(outcome.state, PERSISTENCE_STATES.SAVED_LOCAL);
  assert.equal(outcome.evidence.durable, true);
  assert.equal(persistenceCopy[outcome.state], "Сохранено на этом устройстве");
});

test("local read-back mismatch cannot emit success", () => {
  const outcome = saveLocally({ save() { return { meta: {} }; }, load() { return { data: { stale: true } }; } }, { fresh: true });
  assert.equal(outcome.state, PERSISTENCE_STATES.FAILED);
});

test("cloud success requires ack and matching versioned read-back", async () => {
  const value = { id: 1 };
  const verified = await saveWithVerification({ async save() { return { acknowledged: true, version: 7 }; }, async load() { return { version: 7, data: value }; } }, value);
  assert.equal(verified.state, PERSISTENCE_STATES.SAVED_CLOUD_VERIFIED);
  const stale = await saveWithVerification({ async save() { return { acknowledged: true, version: 8 }; }, async load() { return { version: 7, data: value }; } }, value);
  assert.equal(stale.state, PERSISTENCE_STATES.CONFLICT);
});

test("offline queues without invoking provider", async () => {
  let calls = 0;
  const offline = await saveWithVerification({ save() { calls += 1; } }, { id: 1 }, { online: false });
  assert.equal(offline.state, PERSISTENCE_STATES.OFFLINE_QUEUED);
  assert.equal(calls, 0);
  assert.equal(persistenceCopy[offline.state], "Синхронизируем при подключении");
});
