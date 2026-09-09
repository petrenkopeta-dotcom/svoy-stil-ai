import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_REASONING_FACT_CODES,
  runStylistReasoningPipeline,
} from "./stylistReasoningPipeline.js";

test("integrates confirmed facts through all engines into the Russian renderer", () => {
  const result = runStylistReasoningPipeline({
    items: [
      { id: "coat", confirmed: true, color: { family: "navy", neutral: true, role: "base" } },
      { id: "bag", confirmed: true, color: { family: "red", role: "accent" } },
    ],
    silhouette: {
      top: { confirmed: true, volume: "oversized" },
      bottom: { confirmed: true, volume: "oversized" },
    },
    context: {
      context: { confirmed: true, walkingMinutes: 45 },
      shoes: { confirmed: true, walkingComfort: "low" },
    },
  });

  assert.deepEqual(result.facts.map(({ code }) => code), [
    "NEUTRAL_BASE_SINGLE_ACCENT",
    "SIL_VOLUME_DOUBLE_OVERSIZED",
    "CTX_LONG_WALK_LOW_SHOE_COMFORT",
  ]);
  assert.equal(result.explanation.locale, "ru-RU");
  assert.equal(result.explanation.sections.find(({ id }) => id === "colors").supported, true);
  assert.equal(result.explanation.sections.find(({ id }) => id === "silhouette").supported, true);
  assert.equal(result.explanation.sections.find(({ id }) => id === "context").supported, true);
  assert.deepEqual(result.explanation.unknown_codes, []);
});

test("drops unconfirmed and unknown data without inventing claims", () => {
  const result = runStylistReasoningPipeline({
    items: [
      { id: "confirmed", confirmed: true, color: { family: "blue", role: "base" } },
      { id: "suggested", confirmed: false, color: { family: "blue", role: "support" } },
    ],
    silhouette: {
      top: { confirmed: false, volume: "oversized" },
      bottom: { confirmed: true, volume: "oversized" },
    },
    context: {
      context: { confirmed: false, temperatureC: -20 },
      outfit: { confirmed: true, minTemperatureC: 10 },
    },
  });

  assert.deepEqual(result.facts, []);
  assert.deepEqual(result.explanation.unknown_codes, []);
  assert.equal(result.explanation.sections.every(({ supported }) => supported === false), true);
});

test("publishes only allowlisted minimal facts and never exposes scores or evidence", () => {
  const result = runStylistReasoningPipeline({
    items: [
      { id: "one", confirmed: true, color: { family: "blue", lightness: 20 } },
      { id: "two", confirmed: true, color: { family: "blue", lightness: 60 } },
    ],
  }, { length: "short" });

  assert.equal(result.facts.length > 0, true);
  for (const fact of result.facts) {
    assert.equal(ALLOWED_REASONING_FACT_CODES.includes(fact.code), true);
    assert.deepEqual(Object.keys(fact).sort(), ["code", "confirmed", "rule_version", "source"]);
  }
  assert.equal(JSON.stringify(result).includes('"score"'), false);
  assert.equal(JSON.stringify(result).includes('"evidence"'), false);
});

test("renders every allowlisted silhouette and context fact without unknown codes", () => {
  const scenarios = [
    {
      silhouette: {
        top: { confirmed: true, volume: "oversized", length: "midi" },
        bottom: { confirmed: true, volume: "oversized", length: "maxi", waistline: "low" },
        outer: { confirmed: true, length: "short" },
        preference: { confirmed: true, waistline: "high" },
      },
      context: {
        context: { confirmed: true, occasion: "office", minFormality: 4, temperatureC: 5, walkingMinutes: 45, standingMinutes: 90, activity: "active" },
        outfit: { confirmed: true, formality: 2, minTemperatureC: 10, excludedOccasions: ["office"], mobility: "restricted" },
        shoes: { confirmed: true, walkingComfort: "low", standingComfort: "medium" },
      },
    },
    {
      silhouette: {
        top: { confirmed: true, volume: "fitted" },
        bottom: { confirmed: true, volume: "fitted" },
      },
      context: {
        context: { confirmed: true, temperatureC: 30 },
        outfit: { confirmed: true, maxTemperatureC: 24 },
      },
    },
  ].map((input) => runStylistReasoningPipeline(input));

  const codes = scenarios.flatMap(({ facts }) => facts.map(({ code }) => code));
  const expected = ALLOWED_REASONING_FACT_CODES.filter((code) => code.startsWith("SIL_") || code.startsWith("CTX_"));
  assert.deepEqual(new Set(codes), new Set(expected));
  assert.equal(scenarios.every(({ explanation }) => explanation.unknown_codes.length === 0), true);
});
