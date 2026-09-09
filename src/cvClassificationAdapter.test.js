import test from "node:test";
import assert from "node:assert/strict";
import { adaptGarmentCandidates, mapDetectedCategory, mapDetectedColor } from "./cvClassificationAdapter.js";

const source = { mode: "owner", ownerId: "owner-a" };
const detection = (id, label, x, extra = {}) => ({ id, label, confidence: .91, color: { label: "navy", confidence: .84 }, bbox: { x, y: 10, width: 40, height: 60 }, ...extra });
const segment = (id, extra = {}) => ({ detection_id: id, mask_confidence: .9, edge_quality: .8, visibility: "full", ...extra });

test("adapts multiple actual garments without inventing slots and requires confirmation", () => {
  const result = adaptGarmentCandidates({ photoId: "p1", source, detections: [detection("d1", "shirt", 0), detection("d2", "jeans", 60)], segmentations: [segment("d1"), segment("d2")] });
  assert.deepEqual(result.candidates.map((item) => item.category.value), ["top", "bottom"]);
  assert.ok(result.candidates.every((item) => item.confirmation_required && !item.confirmed && item.state === "pending_confirmation"));
  assert.equal(result.candidates.length, 2);
  assert.equal(JSON.stringify(result).includes("mask-data"), false);
});

test("occlusion is retained as uncertainty and can never auto-confirm", () => {
  const result = adaptGarmentCandidates({ photoId: "p", source, detections: [detection("coat", "coat", 0)], segmentations: [segment("coat", { visibility: "occluded", mask_confidence: .6 })] });
  assert.deepEqual(result.candidates[0].review_reasons.filter((x) => /visibility|mask/.test(x)), ["low_mask_confidence", "visibility_review_required"]);
  assert.equal(result.candidates[0].confirmation_required, true);
});

test("unknown labels and malformed confidence fail closed", () => {
  const result = adaptGarmentCandidates({ photoId: "p", source, detections: [detection("x", "astronaut cape", 0, { confidence: 4, color: { label: "infrared", confidence: "certain" } })] });
  const item = result.candidates[0];
  assert.deepEqual(item.category, { value: "unknown", score: null, confidence: "unknown" });
  assert.deepEqual(item.color, { value: "unknown", score: null, confidence: "unknown" });
  assert.ok(item.review_reasons.includes("segmentation_missing"));
  assert.equal(mapDetectedCategory("astronaut cape"), "unknown");
  assert.equal(mapDetectedColor("infrared"), "unknown");
});

test("maps GroundingDINO composite text labels to the first known garment taxonomy", () => {
  assert.equal(mapDetectedCategory("t - shirt blouse sweater jacket coat"), "top");
});

test("deterministically suppresses only overlapping same-taxonomy duplicates", () => {
  const result = adaptGarmentCandidates({ photoId: "p", source, detections: [detection("first", "shirt", 0), detection("dup", "t-shirt", 1), detection("other", "shirt", 100)], segmentations: [] });
  assert.deepEqual(result.candidates.map((x) => x.detector_id), ["first", "other"]);
  assert.deepEqual(result.suppressed_duplicates, [{ detector_id: "dup", duplicate_of: "first", reason: "overlapping_same_taxonomy" }]);
  assert.throws(() => adaptGarmentCandidates({ photoId: "p", source, detections: [detection("same", "shirt", 0), detection("same", "shirt", 80)] }), /duplicate detection id/);
  const unknowns = adaptGarmentCandidates({ photoId: "p", source, detections: [detection("u1", "mystery", 0, { color: "mystery" }), detection("u2", "mystery", 1, { color: "mystery" })] });
  assert.equal(unknowns.candidates.length, 2);
});

test("owner and reference scopes are mutually exclusive and reference ownership stays unconfirmed", () => {
  assert.throws(() => adaptGarmentCandidates({ photoId: "p", source: { mode: "owner" } }), /ownerId/);
  assert.throws(() => adaptGarmentCandidates({ photoId: "p", source: { mode: "owner", ownerId: "a", referenceId: "r" } }), /referenceId/);
  assert.throws(() => adaptGarmentCandidates({ photoId: "p", source: { mode: "reference", referenceId: "r", ownerId: "a" } }), /ownerId/);
  const result = adaptGarmentCandidates({ photoId: "p", source: { mode: "reference", referenceId: "r" }, detections: [detection("d", "dress", 0)], segmentations: [segment("d")] });
  assert.equal(result.candidates[0].ownership, "unconfirmed");
  assert.equal(result.candidates[0].reference_id, "r");
  assert.equal("owner_scope" in result.candidates[0], false);
});
