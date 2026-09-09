import test from "node:test";
import assert from "node:assert/strict";
import { completeProductTour, navigationDecision, shouldShowProductTour } from "./productTour.js";

test("product tour is shown once per device", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(shouldShowProductTour(storage), true);
  completeProductTour(storage);
  assert.equal(shouldShowProductTour(storage), false);
});

test("local pilot wardrobe navigation never opens auth", () => {
  assert.deepEqual(navigationDecision({ destination: "wardrobe", localPilot: true }), { type: "screen", screen: "wardrobe" });
  assert.equal(navigationDecision({ destination: "history", localPilot: true }).type, "auth");
});

test("Today does not restart completed onboarding", () => {
  assert.deepEqual(navigationDecision({ destination: "test", onboardingComplete: true, hasFirstResult: true }), { type: "screen", screen: "look" });
  assert.deepEqual(navigationDecision({ destination: "test", onboardingComplete: true, hasFirstResult: false }), { type: "screen", screen: "look" });
});
