import test from "node:test";
import assert from "node:assert/strict";
import { buildCapsule } from "./capsuleEngine.js";
import { CAPSULE_GOLDEN_CASES, materializeGoldenCase } from "./capsuleEngine.golden.js";
import { CAPSULE_RESULT_SCHEMA, CAPSULE_TRACE_SCHEMA, validateCapsuleOutput } from "./capsuleContracts.js";

test("machine-checkable schemas close public DTO and internal trace objects", () => {
  assert.equal(CAPSULE_RESULT_SCHEMA.additionalProperties, false);
  assert.equal(CAPSULE_TRACE_SCHEMA.additionalProperties, false);
  const output = buildCapsule(materializeGoldenCase(CAPSULE_GOLDEN_CASES[0]));
  assert.deepEqual(validateCapsuleOutput(output), { valid: true, resultErrors: [], traceErrors: [] });

  const leakedPublic = { ...output, result: { ...output.result, score: 99 } };
  assert.equal(validateCapsuleOutput(leakedPublic).valid, false);
  const leakedTrace = { ...output, trace: { ...output.trace, ownerScope: "owner-a" } };
  assert.equal(validateCapsuleOutput(leakedTrace).valid, false);
  const inventedReason = { ...output, result: { ...output.result, tradeoffs: ["model_says_perfect"] } };
  assert.equal(validateCapsuleOutput(inventedReason).valid, false);
});

test(`authored golden corpus covers at least 30 cases (${CAPSULE_GOLDEN_CASES.length})`, () => {
  assert.ok(CAPSULE_GOLDEN_CASES.length >= 30);
  for (const definition of CAPSULE_GOLDEN_CASES) {
    const output = buildCapsule(materializeGoldenCase(definition));
    assert.equal(output.result.status, definition.status, definition.id);
    if (definition.reason) assert.ok(output.result.noResultReasons.includes(definition.reason), `${definition.id}: ${definition.reason}`);
    if (definition.tradeoff) assert.ok(output.result.tradeoffs.includes(definition.tradeoff), `${definition.id}: ${definition.tradeoff}`);
    if (definition.missing) assert.ok(output.result.missingPieces.some((piece) => piece.slot === definition.missing), `${definition.id}: ${definition.missing}`);
    const validation = validateCapsuleOutput(output);
    assert.equal(validation.valid, true, `${definition.id}: ${JSON.stringify(validation)}`);
  }
});

test("canonical output is byte-identical across 100 runs", () => {
  const source = materializeGoldenCase(CAPSULE_GOLDEN_CASES.find((entry) => entry.id === "multi-scenario"));
  const expected = JSON.stringify(buildCapsule(source));
  for (let index = 0; index < 100; index += 1) assert.equal(JSON.stringify(buildCapsule(structuredClone(source))), expected);
});

test("wardrobe, scenario, and anchor input order do not affect output", () => {
  const source = materializeGoldenCase(CAPSULE_GOLDEN_CASES.find((entry) => entry.id === "multi-scenario"));
  source.anchors = [
    { itemId: "top-1", required: true, minimumOutfitUses: 1 },
    { itemId: "shoes-1", required: true, minimumOutfitUses: 1 },
  ];
  const expected = buildCapsule(source);
  const permuted = buildCapsule({
    ...source, wardrobe: [...source.wardrobe].reverse(), scenarios: [...source.scenarios].reverse(), anchors: [...source.anchors].reverse(),
  });
  assert.deepEqual(permuted, expected);
});

test("unknown inputs remain not-evaluated and never produce numeric public ranking", () => {
  const definition = CAPSULE_GOLDEN_CASES.find((entry) => entry.id === "unknown-10");
  const output = buildCapsule(materializeGoldenCase(definition));
  assert.deepEqual(new Set(output.trace.ruleFacts.map((fact) => fact.outcome)), new Set(["not_evaluated"]));
  assert.ok(["occasion_data_insufficient", "weather_not_evaluated", "color_data_insufficient", "silhouette_data_insufficient"].every((code) => output.result.tradeoffs.includes(code)));
  assert.doesNotMatch(JSON.stringify(output.result), /"(?:score|utility|weight|percent)"\s*:/i);
});

test("missing-piece output is bounded, functional, and positive-only", () => {
  for (const definition of CAPSULE_GOLDEN_CASES) {
    const { result } = buildCapsule(materializeGoldenCase(definition));
    assert.ok(result.missingPieces.length <= 3, definition.id);
    for (const piece of result.missingPieces) {
      assert.ok(piece.unlocks.length > 0, definition.id);
      assert.ok(piece.unlocks.every((unlock) => Number.isInteger(unlock.additionalLooks) && unlock.additionalLooks > 0), definition.id);
      assert.equal("brand" in piece.requirement || "price" in piece.requirement || "url" in piece.requirement, false, definition.id);
    }
  }
});
