import { OUTFIT_EVAL_V2_CONSENT_SCOPE, OUTFIT_EVAL_V2_CONSENT_VERSION } from "./outfitEvalV2.js";

const consent = Object.freeze({ granted: true, scope: OUTFIT_EVAL_V2_CONSENT_SCOPE, storage: "local_only", version: OUTFIT_EVAL_V2_CONSENT_VERSION });
const wardrobe = Object.freeze([
  Object.freeze({ id: "top-1", category: "top", provenance: "personal" }),
  Object.freeze({ id: "bottom-1", category: "bottom", provenance: "personal" }),
  Object.freeze({ id: "shoes-1", category: "shoes", provenance: "personal" }),
  Object.freeze({ id: "shoes-2", category: "shoes", provenance: "personal" }),
]);
const sourceOutfit = Object.freeze({ id: "look-1", recommendationId: "recommendation-1", itemIds: Object.freeze(["top-1", "bottom-1", "shoes-1"]) });
const common = Object.freeze({ mode: "personal", consent, wardrobe, sourceOutfit, resultOutfit: null, anchorItemId: "top-1", history: Object.freeze([]) });

export const OUTFIT_EVAL_V2_GOLDEN_CASES = Object.freeze([
  Object.freeze({ ...common, caseId: "would-wear", feedback: Object.freeze({ action: "would_wear" }), expected: Object.freeze({ accepted: true, action: "would_wear" }) }),
  Object.freeze({ ...common, caseId: "not-for-me-with-reason", feedback: Object.freeze({ action: "not_for_me", reason: "not_my_style" }), expected: Object.freeze({ accepted: true, action: "not_for_me" }) }),
  Object.freeze({
    ...common, caseId: "replace-one-slot-preserve-anchor", resultOutfit: Object.freeze({ id: "look-2", recommendationId: "recommendation-2", itemIds: Object.freeze(["top-1", "bottom-1", "shoes-2"]) }),
    feedback: Object.freeze({ action: "replace_item", reason: "shoes", replaceItemId: "shoes-1", replacementItemId: "shoes-2" }),
    expected: Object.freeze({ accepted: true, action: "replace_item", preservation: "passed" }),
  }),
  Object.freeze({
    ...common, caseId: "undo-would-wear", history: Object.freeze([Object.freeze({ eventId: "feedback-1", action: "would_wear" })]),
    feedback: Object.freeze({ action: "undo", targetEventId: "feedback-1" }), expected: Object.freeze({ accepted: true, action: "undo", activeAction: null }),
  }),
]);
