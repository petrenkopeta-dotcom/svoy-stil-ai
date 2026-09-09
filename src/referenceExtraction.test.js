import test from "node:test";
import assert from "node:assert/strict";
import { REFERENCE_GOLDEN_CASES } from "./referenceExtraction.golden.js";
import { createPersonalWardrobeItem, extractReferenceCandidates, markPossibleDuplicates, reviewReferenceCandidate } from "./referenceExtraction.js";

test("four golden references yield only visible candidate regions", () => {
  for (const fixture of REFERENCE_GOLDEN_CASES) {
    const result = extractReferenceCandidates({ reference_id: fixture.id, regions: fixture.regions });
    assert.equal(result.candidates.length, fixture.regions.length);
    assert.ok(result.candidates.every((item) => item.source_mode === "reference" && item.ownership === "unconfirmed"));
    assert.equal(result.candidates.some((item) => item.fields.category.value === "shoes"), false);
  }
});

test("occluded or cropped candidates disclose preview-only reconstruction", () => {
  for (const fixture of REFERENCE_GOLDEN_CASES) for (const candidate of extractReferenceCandidates({ reference_id: fixture.id, regions: fixture.regions }).candidates) {
    if (["occluded", "cropped"].includes(candidate.visibility)) {
      assert.equal(candidate.reconstruction_status, "preview_only");
      assert.equal(candidate.ui_label, "AI-превью · проверьте детали");
    }
  }
});

test("unknown observations stay unknown and cannot become verified facts", () => {
  const [candidate] = extractReferenceCandidates({ reference_id: "unknown", regions: [{ id: "r", crop: { x: 0, y: 0, width: 1, height: 1 }, observations: { category: { value: "shoes", visible: false, score: .99 } } }] }).candidates;
  assert.equal(candidate.fields.category.value, "unknown");
  assert.equal(candidate.fields.category.status, "unknown");
});

test("explicit hypotheses remain inferred and force preview disclosure", () => {
  const [candidate] = extractReferenceCandidates({ reference_id: "hypothesis", regions: [{ id: "r", crop: { x: 0, y: 0, width: 1, height: 1 }, observations: { category: { value: "dress", status: "inferred", score: .7 } } }] }).candidates;
  assert.equal(candidate.fields.category.status, "inferred");
  assert.equal(candidate.reconstruction_status, "preview_only");
  assert.equal(candidate.ui_label, "AI-превью · проверьте детали");
});

test("each candidate can be confirmed, corrected, or rejected", () => {
  const candidate = extractReferenceCandidates({ reference_id: "r", regions: [REFERENCE_GOLDEN_CASES[2].regions[0]] }).candidates[0];
  assert.equal(reviewReferenceCandidate(candidate, "confirm").state, "confirmed_reference");
  assert.equal(reviewReferenceCandidate(candidate, "correct", { color: "blue" }).fields.color.evidence[0], "user_correction");
  assert.equal(reviewReferenceCandidate(candidate, "reject").state, "rejected");
});

test("wardrobe creation requires exact explicit ownership action", () => {
  const candidate = reviewReferenceCandidate(extractReferenceCandidates({ reference_id: "r", regions: [REFERENCE_GOLDEN_CASES[0].regions[0]] }).candidates[0], "confirm");
  assert.throws(() => createPersonalWardrobeItem(candidate, { type: "confirm" }), /EXPLICIT/);
  assert.equal(createPersonalWardrobeItem(candidate, { type: "declare_personal_item", label: "Это моя вещь" }).ownership, "personal_confirmed");
});

test("deduplication is conservative and never merges candidates", () => {
  const result = extractReferenceCandidates({ reference_id: "d", regions: [REFERENCE_GOLDEN_CASES[2].regions[0], { ...REFERENCE_GOLDEN_CASES[2].regions[0], id: "similar", observations: { ...REFERENCE_GOLDEN_CASES[2].regions[0].observations, silhouette: { value: "relaxed", visible: true, score: .9, evidence: ["visible relaxed"] } } }] });
  const marked = markPossibleDuplicates(result.candidates);
  assert.equal(marked.length, 2);
  assert.deepEqual(marked[1].duplicate_review.possible_match_ids, []);
});
