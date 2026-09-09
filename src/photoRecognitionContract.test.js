import test from "node:test";
import assert from "node:assert/strict";
import { confirmClassification, createSegmentationRequest, mergeClassificationSuggestion, normalizeClassification, reviewSegmentation } from "./photoRecognitionContract.js";

test("segmentation preserves original and disables generative inpainting", () => {
  const request = createSegmentationRequest({ photoId: "p1", background: { dominant: "#eee" } });
  assert.equal(request.contrast_adaptive_background, true); assert.equal(request.generative_inpainting, false); assert.equal(request.preserve_original, true);
  assert.throws(() => createSegmentationRequest({ photoId: "p1", allowGenerativeInpainting: true }), /REQUIRES_EXPLICIT/);
});

test("mask and edge uncertainty require review", () => {
  assert.equal(reviewSegmentation({ mask_confidence: .9, edge_quality: .8 }).accepted, true);
  assert.deepEqual(reviewSegmentation({ mask_confidence: .7, edge_quality: .6 }).reasons, ["low_mask_confidence", "poor_edge_quality"]);
});

test("classification is editable and falls back to manual below confidence", () => {
  const low = normalizeClassification({ category: "top", subcategory: "shirt", name_ru: "Рубашка", color: "синий", confidence: .4 });
  assert.equal(low.manual_fallback, true); assert.equal(low.editable, true); assert.equal(low.confirmation_required, true);
  assert.equal(low.aiSuggestion.subcategory_ru, "shirt"); assert.equal(low.userConfirmed, null);
});

test("user correction persists across later AI suggestions with provenance", () => {
  const first = normalizeClassification({ category: "Верх", subcategory_ru: "Рубашка", confidence: .91, version: "model-a" });
  const corrected = confirmClassification(first, { subcategory_ru: "Блуза" }, { source: "user", confirmedAt: "2026-08-20T00:00:00.000Z" });
  const rerun = mergeClassificationSuggestion(corrected, { category: "Верх", subcategory_ru: "Топ", confidence: .97, version: "model-b" });
  assert.equal(rerun.aiSuggestion.subcategory_ru, "Топ"); assert.equal(rerun.aiSuggestion.confidence, .97);
  assert.equal(rerun.userConfirmed.subcategory_ru, "Блуза"); assert.equal(rerun.userConfirmed.source, "user"); assert.equal(rerun.userConfirmed.version, 1);
  const reconfirmed = confirmClassification(rerun, { subcategory_ru: "Топ" }); assert.equal(reconfirmed.userConfirmed.version, 2);
});
