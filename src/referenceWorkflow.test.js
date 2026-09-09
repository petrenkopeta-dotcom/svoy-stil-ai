import test from "node:test";
import assert from "node:assert/strict";
import { adaptLocalReferenceRegions, createLocalReferenceCandidate, prepareConfirmedWardrobeBatch, referenceAnalyticsEvent, undoReferenceReview, updateReferenceReview } from "./referenceWorkflow.js";

const dto = { purpose: "reference", networkAllowed: false, previewUrl: "blob:test" };
test("staged local fallback starts with unknown facts and no ownership claim", () => {
  const item = createLocalReferenceCandidate(dto, "r");
  assert.equal(item.fields.category.status, "unknown"); assert.equal(item.ownership, "unconfirmed");
});
test("review supports correction, rejection and undo", () => {
  const before = [createLocalReferenceCandidate(dto, "r")];
  const corrected = updateReferenceReview(before, before[0].id, "correct", { category: "top", color: "blue", silhouette: "manual_outline" });
  assert.equal(corrected[0].state, "confirmed_reference");
  assert.deepEqual(undoReferenceReview(corrected, before), before);
  assert.equal(updateReferenceReview(before, before[0].id, "reject")[0].state, "rejected");
});
test("batch contains only confirmed items and repeated save is idempotent", () => {
  const item = createLocalReferenceCandidate(dto, "r");
  assert.equal(prepareConfirmedWardrobeBatch(updateReferenceReview([item], item.id, "confirm"), [], "b").length, 0);
  const reviewed = updateReferenceReview([item], item.id, "correct", { category: "top", color: "blue", __declarePersonal: true });
  const batch = prepareConfirmedWardrobeBatch(reviewed, [], "b");
  assert.equal(batch.length, 1); assert.equal(prepareConfirmedWardrobeBatch(reviewed, batch, "b").length, 0);
});

test("wardrobe batch retains the selected crop needed for its local preview", () => {
  const [candidate] = adaptLocalReferenceRegions(dto, [{ visible: true, selection: { version: "garment-selection-v1", bounds: { x: .2, y: .1, width: .5, height: .7 }, points: [{ x: .2, y: .1 }, { x: .7, y: .1 }, { x: .7, y: .8 }] } }], "crop");
  const reviewed = updateReferenceReview([candidate], candidate.id, "correct", { category: "top", __declarePersonal: true });
  const [item] = prepareConfirmedWardrobeBatch(reviewed, [], "batch");
  assert.deepEqual(item.reference_crop, { x: .2, y: .1, width: .5, height: .7 });
});
test("reference analytics schema excludes image, URL, path and PII", () => {
  assert.deepEqual(referenceAnalyticsEvent("review", { method: "paste", count: 2, outcome: "completed" }), { name: "reference_flow", properties: { stage: "review", method: "paste", count: 2, outcome: "completed" } });
});
test("adapter supports zero, one and many visible manual regions without invented categories", () => {
  assert.deepEqual(adaptLocalReferenceRegions(dto, [], "r"), []);
  const selection = { version: "manual-outline-v1", bounds: { x: .1, y: .1, width: .4, height: .5 }, points: [{ x: .1, y: .1 }, { x: .5, y: .1 }, { x: .5, y: .6 }] };
  const many = adaptLocalReferenceRegions(dto, [{ visible: false, selection }, { visible: true, selection }, { visible: true, selection }], "r");
  assert.equal(many.length, 2); assert.ok(many.every((item) => item.fields.category.status === "unknown"));
  assert.ok(many.every((item) => item.region.outline.purpose === "guidance_only" && item.region.outline.trust === "untrusted"));
});
