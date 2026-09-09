import test from "node:test";
import assert from "node:assert/strict";
import { COLOR_REASONING_VERSION, reasonAboutColors } from "./colorReasoning.js";
import { neutralAccentLook, relatedLook } from "./colorReasoning.fixtures.js";
const codes = (result) => result.facts.map((x) => x.code);

test("color reasoning is deterministic, versioned, and structured", () => {
  const result = reasonAboutColors(neutralAccentLook);
  assert.deepEqual(result, reasonAboutColors(structuredClone(neutralAccentLook)));
  assert.equal(result.engine_version, COLOR_REASONING_VERSION);
  result.facts.forEach((x) => {
    assert.deepEqual(Object.keys(x), ["code", "evidence", "item_ids", "severity", "rule_version"]);
    assert.equal(x.rule_version, COLOR_REASONING_VERSION);
  });
});
test("finds neutral base, accent, and saturation focus", () => {
  const result = codes(reasonAboutColors(neutralAccentLook));
  assert.ok(result.includes("NEUTRAL_BASE_SINGLE_ACCENT"));
  assert.ok(result.includes("SATURATION_SINGLE_FOCUS"));
});
test("finds related shades, repetition, moderate contrast, and light-dark balance", () => {
  const result = codes(reasonAboutColors(relatedLook));
  ["RELATED_SHADES_PRESENT", "COLOR_FAMILY_REPEATED", "MODERATE_LIGHTNESS_CONTRAST", "LIGHT_DARK_BALANCED"].forEach((x) => assert.ok(result.includes(x)));
});
test("reports conflicting accents", () => {
  const result = reasonAboutColors({ items: [
    { id: "a", color: { family: "red", neutral: false, role: "accent" } },
    { id: "b", color: { family: "green", neutral: false, role: "accent" } },
  ] });
  assert.deepEqual(codes(result), ["MULTIPLE_ACCENTS_CONFLICT"]);
  assert.deepEqual(result.facts[0].item_ids, ["a", "b"]);
});
test("reports high saturation load", () => {
  const items = [70, 80, 90, 20].map((saturation, index) => ({ id: index, color: { family: `f${index}`, saturation, role: "support" } }));
  assert.ok(codes(reasonAboutColors({ items })).includes("SATURATION_LOAD_HIGH"));
});
test("unknown colors are not invented or included", () => {
  const result = reasonAboutColors({ items: [
    { id: "unknown", color: { known: false, family: "red", role: "accent" } },
    { id: "missing" },
    { id: "known", color: { family: "blue", role: "base" } },
  ] });
  assert.deepEqual(codes(result), ["COLOR_DATA_INSUFFICIENT"]);
  assert.deepEqual(result.facts[0].item_ids, ["known"]);
  assert.equal(Object.hasOwn(result.facts[0].evidence, "family"), false);
  assert.equal(Object.values(result.facts[0].evidence).includes("red"), false);
});
test("malformed input is safe", () => {
  const result = reasonAboutColors(null);
  assert.deepEqual(codes(result), ["COLOR_DATA_INSUFFICIENT"]);
  assert.deepEqual(result.facts[0].evidence, { known_item_count: 0, total_item_count: 0, required_known_item_count: 2 });
});
