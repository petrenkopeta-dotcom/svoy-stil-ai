import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOutfitFeedbackV2, OUTFIT_EVAL_V2_ACTIONS, OUTFIT_EVAL_V2_CONSENT_SCOPE, OUTFIT_EVAL_V2_CONSENT_VERSION, runOutfitEvalV2 } from "./outfitEvalV2.js";
import { OUTFIT_EVAL_V2_GOLDEN_CASES } from "./outfitEvalV2.golden.js";

const clone = (value) => structuredClone(value);
const base = () => clone(OUTFIT_EVAL_V2_GOLDEN_CASES[0]);

test("contract vocabulary and learning consent align with stylistLearning", () => {
  assert.deepEqual(OUTFIT_EVAL_V2_ACTIONS, ["would_wear", "not_for_me", "replace_item", "undo"]);
  const input = base();
  assert.deepEqual(input.consent, { granted: true, scope: OUTFIT_EVAL_V2_CONSENT_SCOPE, storage: "local_only", version: OUTFIT_EVAL_V2_CONSENT_VERSION });
  assert.equal(evaluateOutfitFeedbackV2(input).status, "passed");
});

test("golden feedback, replacement and undo pass without public scores", () => {
  const report = runOutfitEvalV2(OUTFIT_EVAL_V2_GOLDEN_CASES);
  assert.equal(report.status, "passed");
  assert.equal(report.execution, "developer_local_only");
  assert.deepEqual(report.results.map((result) => result.action), ["would_wear", "not_for_me", "replace_item", "undo"]);
  assert.ok(report.results.every((result) => !("score" in result) && !("weight" in result) && !("confidence" in result)));
  assert.deepEqual(report.results[3].audit, ["would_wear", "undo"]);
});

test("consent is explicit, versioned, learning-scoped and local-only", () => {
  for (const consent of [undefined, { granted: false, scope: OUTFIT_EVAL_V2_CONSENT_SCOPE, storage: "local_only", version: OUTFIT_EVAL_V2_CONSENT_VERSION }, { granted: true, scope: "telemetry", storage: "local_only", version: OUTFIT_EVAL_V2_CONSENT_VERSION }, { granted: true, scope: OUTFIT_EVAL_V2_CONSENT_SCOPE, storage: "cloud", version: OUTFIT_EVAL_V2_CONSENT_VERSION }]) {
    const input = base(); input.consent = consent;
    assert.equal(evaluateOutfitFeedbackV2(input).code, "consent_required");
  }
});

test("rejects PII, egress and unknown fields recursively", () => {
  for (const patch of [{ email: "person@example.test" }, { telemetry: true }, { feedback: { action: "would_wear", endpoint: "https://example.test" } }]) {
    assert.equal(evaluateOutfitFeedbackV2(Object.assign(base(), patch)).code, "privacy_field_forbidden");
  }
  const unknown = base(); unknown.feedback.note = "free form";
  assert.equal(evaluateOutfitFeedbackV2(unknown).code, "invalid_feedback");
});

test("demo, unknown and non-personal provenance fail closed", () => {
  const demo = base(); demo.mode = "demo";
  assert.equal(evaluateOutfitFeedbackV2(demo).code, "ineligible_source");
  const mixed = base(); mixed.wardrobe[0].provenance = "demo";
  assert.equal(evaluateOutfitFeedbackV2(mixed).code, "ineligible_source");
});

test("not-for-me and replacement require allowlisted reasons", () => {
  for (const action of ["not_for_me", "replace_item"]) {
    const input = clone(action === "replace_item" ? OUTFIT_EVAL_V2_GOLDEN_CASES[2] : OUTFIT_EVAL_V2_GOLDEN_CASES[1]);
    input.feedback.reason = "free_text_reason";
    assert.equal(evaluateOutfitFeedbackV2(input).code, "unsupported_reason");
  }
  const positive = base(); positive.feedback.reason = "colors";
  assert.equal(evaluateOutfitFeedbackV2(positive).code, "unsupported_reason");
});

test("replacement changes exactly one target slot and preserves anchor and non-target items", () => {
  const golden = clone(OUTFIT_EVAL_V2_GOLDEN_CASES[2]);
  assert.equal(evaluateOutfitFeedbackV2(golden).preservation, "passed");
  const nonTargetChanged = clone(golden); nonTargetChanged.resultOutfit.itemIds = ["top-1", "shoes-1", "shoes-2"];
  assert.equal(evaluateOutfitFeedbackV2(nonTargetChanged).code, "preservation_failed");
  const reordered = clone(golden); reordered.resultOutfit.itemIds = ["bottom-1", "top-1", "shoes-2"];
  assert.equal(evaluateOutfitFeedbackV2(reordered).code, "preservation_failed");
  const anchorTarget = clone(golden); anchorTarget.feedback.replaceItemId = "top-1"; anchorTarget.feedback.replacementItemId = "shoes-2";
  assert.equal(evaluateOutfitFeedbackV2(anchorTarget).code, "anchor_replacement_forbidden");
  const wrongCategory = clone(golden); wrongCategory.feedback.replacementItemId = "top-1"; wrongCategory.resultOutfit.itemIds = ["top-1", "bottom-1", "top-1"];
  assert.equal(evaluateOutfitFeedbackV2(wrongCategory).code, "replacement_category_mismatch");
});

test("undo requires an existing event and keeps append-only audit evidence", () => {
  const golden = clone(OUTFIT_EVAL_V2_GOLDEN_CASES[3]);
  assert.deepEqual(evaluateOutfitFeedbackV2(golden).audit, ["would_wear", "undo"]);
  golden.feedback.targetEventId = "missing";
  assert.equal(evaluateOutfitFeedbackV2(golden).code, "event_not_found");
});

test("evaluation is deterministic and does not mutate inputs", () => {
  const input = clone(OUTFIT_EVAL_V2_GOLDEN_CASES[2]);
  const before = clone(input);
  assert.deepEqual(evaluateOutfitFeedbackV2(input), evaluateOutfitFeedbackV2(input));
  assert.deepEqual(input, before);
});
