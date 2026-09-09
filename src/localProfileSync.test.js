import test from "node:test";
import assert from "node:assert/strict";
import { createLocalProfileSyncController, PROFILE_SYNC_STATES } from "./localProfileSync.js";

test("missing API keeps local success and never blocks", async () => {
  const controller = createLocalProfileSyncController({ profileRevision: 3 });
  await controller.retry();
  assert.equal(controller.getState(), PROFILE_SYNC_STATES.LOCAL_SAVED);
});
test("failed sync preserves local success and retry uses a stable idempotency key", async () => {
  const calls = []; let fail = true;
  const adapter = { syncProfile: async (command) => { calls.push(command); if (fail) throw new Error("offline"); } };
  const controller = createLocalProfileSyncController({ adapter, profileRevision: 7 });
  await controller.retry(); assert.equal(controller.getState(), PROFILE_SYNC_STATES.SYNC_FAILED);
  fail = false; await controller.retry(); assert.equal(controller.getState(), PROFILE_SYNC_STATES.LOCAL_SAVED);
  assert.equal(calls.length, 2); assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
});
test("parallel retries share one pending adapter call", async () => {
  let release; let calls = 0;
  const adapter = { syncProfile: () => { calls += 1; return new Promise((resolve) => { release = resolve; }); } };
  const controller = createLocalProfileSyncController({ adapter, profileRevision: 1 });
  const first = controller.retry(), second = controller.retry();
  assert.equal(first, second); assert.equal(controller.getState(), PROFILE_SYNC_STATES.SYNC_PENDING);
  await Promise.resolve(); release(); await first; assert.equal(calls, 1);
});
