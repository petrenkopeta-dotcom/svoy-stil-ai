import test from "node:test";
import assert from "node:assert/strict";
import { reasonAboutContext, CONTEXT_RULESET_VERSION } from "./contextReasoning.js";
import { officeWalkFixture, unknownReasoningFixture } from "./reasoningFixtures.js";

test("context reasoning is unknown-safe and does not block on partial input", () => {
  assert.deepEqual(reasonAboutContext(unknownReasoningFixture), { rulesetVersion: CONTEXT_RULESET_VERSION, facts: [], constraints: [] });
  assert.deepEqual(reasonAboutContext({ context: { confirmed: true, walkingMinutes: 90 } }).constraints, []);
});

test("explicit context conflicts produce stable hard constraints", () => {
  const first = reasonAboutContext(officeWalkFixture);
  assert.deepEqual(first, reasonAboutContext(officeWalkFixture));
  assert.deepEqual(first.facts.map(({ code }) => code), [
    "CTX_FORMALITY_BELOW_MINIMUM",
    "CTX_TOO_COLD_FOR_OUTFIT",
    "CTX_LONG_WALK_LOW_SHOE_COMFORT",
    "CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY",
  ]);
  assert.ok(first.constraints.every(({ kind }) => kind === "hard"));
  assert.ok(first.facts.every((entry) => entry.ruleVersion === CONTEXT_RULESET_VERSION && entry.evidence));
});

test("occasion exclusion, hot weather and standing advice remain fact-bound", () => {
  const result = reasonAboutContext({
    context: { confirmed: true, occasion: "hiking", temperatureC: 31, standingMinutes: 90 },
    outfit: { confirmed: true, excludedOccasions: ["hiking"], maxTemperatureC: 24 },
    shoes: { confirmed: true, standingComfort: "medium" },
  });
  assert.deepEqual(result.constraints.map(({ kind }) => kind), ["hard", "hard", "soft"]);
});
