import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingActivationFlow } from "./onboardingActivationFlow.js";
import { createOnboardingCompletionBoundary } from "./onboardingCompletionBoundary.js";
import { createOnboardingPreferencesPersistence } from "./onboardingPreferencesPersistence.js";

class MemoryStorage {
  constructor() { this.values = new Map(); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("five-step completion activates the wardrobe once after local success, including double-click and replay", async () => {
  const storage = new MemoryStorage();
  const persistence = createOnboardingPreferencesPersistence({ storage, sessionStorage: new MemoryStorage() });
  const boundary = createOnboardingCompletionBoundary({ preferencesPersistence: persistence });
  const transitions = [];
  const applied = [];
  const flow = createOnboardingActivationFlow({
    completionBoundary: boundary,
    onLocalComplete: (command) => {
      applied.push(command.preferences);
      transitions.push("wardrobe");
    },
  });
  const command = {
    idempotencyKey: "closed-alpha-onboarding-v1",
    preferences: { goal: "Работа", style: "Minimal" },
    rememberPreferences: true,
  };

  const first = flow.finish(command);
  const doubleClick = flow.finish(command);
  assert.strictEqual(doubleClick, first);
  const [result, concurrent] = await Promise.all([first, doubleClick]);
  const replay = await flow.finish(command);

  assert.equal(result.localCompleted, true);
  assert.equal(concurrent.localCompleted, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(applied, [command.preferences]);
  assert.deepEqual(transitions, ["wardrobe"]);
  assert.equal(storage.writes, 2); // staged transaction plus the verified durable record
});

test("activation does not leave the wizard until local completion succeeds", async () => {
  let resolveCompletion;
  const transitions = [];
  const flow = createOnboardingActivationFlow({
    completionBoundary: { complete: () => new Promise((resolve) => { resolveCompletion = resolve; }) },
    onLocalComplete: () => transitions.push("wardrobe"),
  });

  const finish = flow.finish({ idempotencyKey: "wait-for-local", preferences: {} });
  assert.deepEqual(transitions, []);
  resolveCompletion({ ok: true, localCompleted: true });
  await finish;
  assert.deepEqual(transitions, ["wardrobe"]);
});

test("a failed local completion keeps the wizard active and can be retried", async () => {
  let attempts = 0;
  const transitions = [];
  const flow = createOnboardingActivationFlow({
    completionBoundary: { complete: () => Promise.resolve(++attempts === 1 ? { ok: false, localCompleted: false } : { ok: true, localCompleted: true }) },
    onLocalComplete: () => transitions.push("wardrobe"),
  });
  const command = { idempotencyKey: "retry", preferences: {} };
  assert.equal((await flow.finish(command)).localCompleted, false);
  assert.deepEqual(transitions, []);
  assert.equal((await flow.finish(command)).localCompleted, true);
  assert.deepEqual(transitions, ["wardrobe"]);
});
