import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingTransitionGuard, toggleOnboardingLimit, updateOnboardingPreference } from "./onboardingRuntime.js";

test("Landing and completion transitions ignore synchronous double activation", () => {
  const guard = createOnboardingTransitionGuard();
  let transitions = 0;
  assert.equal(guard.run(() => { transitions += 1; }), true);
  assert.equal(guard.run(() => { transitions += 1; }), false);
  assert.equal(transitions, 1);
});

test("rapid onboarding updates compose from current state instead of stale render state", () => {
  const initial = { goal: "Work", style: "Classic", limits: [] };
  const first = updateOnboardingPreference(initial, "style", "Minimal");
  const second = toggleOnboardingLimit(first, "Comfort");
  const third = toggleOnboardingLimit(second, "Warm");
  assert.deepEqual(third, { goal: "Work", style: "Minimal", limits: ["Comfort", "Warm"] });
  assert.deepEqual(toggleOnboardingLimit(third, "Comfort").limits, ["Warm"]);
});
