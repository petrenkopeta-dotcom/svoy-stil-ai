import test from "node:test";
import assert from "node:assert/strict";
import { reasonAboutSilhouette, SILHOUETTE_RULESET_VERSION } from "./silhouetteReasoning.js";
import { layeredSilhouetteFixture, unknownReasoningFixture } from "./reasoningFixtures.js";

test("silhouette reasoning is unknown-safe", () => {
  assert.deepEqual(reasonAboutSilhouette(unknownReasoningFixture), { rulesetVersion: SILHOUETTE_RULESET_VERSION, facts: [], constraints: [] });
  assert.deepEqual(reasonAboutSilhouette({ top: { volume: "oversized" }, bottom: { volume: "oversized" } }).facts, []);
});

test("silhouette rules are deterministic and explainable", () => {
  const first = reasonAboutSilhouette(layeredSilhouetteFixture);
  const second = reasonAboutSilhouette(layeredSilhouetteFixture);
  assert.deepEqual(first, second);
  assert.deepEqual(first.facts.map(({ code }) => code), [
    "SIL_VOLUME_DOUBLE_OVERSIZED",
    "SIL_OUTER_SHORTER_THAN_TOP",
    "SIL_OVERLAPPING_LONG_LENGTHS",
    "SIL_WAISTLINE_PREFERENCE_MISMATCH",
  ]);
  assert.ok(first.facts.every((entry) => entry.ruleVersion === SILHOUETTE_RULESET_VERSION && entry.explanation && entry.evidence));
  assert.ok(first.constraints.every((entry) => entry.kind === "soft"));
});

test("only an explicit required waistline preference becomes hard", () => {
  const result = reasonAboutSilhouette({
    bottom: { confirmed: true, waistline: "low" },
    preference: { confirmed: true, waistline: "high", required: true },
  });
  assert.equal(result.constraints[0].kind, "hard");
});
