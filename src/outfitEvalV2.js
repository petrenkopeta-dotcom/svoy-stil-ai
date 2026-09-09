import { STYLIST_FEEDBACK_ACTIONS, STYLIST_FEEDBACK_REASONS } from "./stylistLearning.js";

export const OUTFIT_EVAL_V2_VERSION = "outfit-eval-v2";
export const OUTFIT_EVAL_V2_CONSENT_SCOPE = "developer_local_outfit_eval";
export const OUTFIT_EVAL_V2_CONSENT_VERSION = "outfit-eval-consent-v1";
export const OUTFIT_EVAL_V2_ACTIONS = Object.freeze([...STYLIST_FEEDBACK_ACTIONS, "undo"]);

const ACTIONS = new Set(OUTFIT_EVAL_V2_ACTIONS);
const REASONS = new Set(STYLIST_FEEDBACK_REASONS);
const CASE_FIELDS = new Set(["caseId", "mode", "consent", "wardrobe", "sourceOutfit", "resultOutfit", "anchorItemId", "history", "feedback", "expected"]);
const CONSENT_FIELDS = new Set(["granted", "scope", "storage", "version"]);
const ITEM_FIELDS = new Set(["id", "category", "provenance"]);
const OUTFIT_FIELDS = new Set(["id", "recommendationId", "itemIds"]);
const HISTORY_FIELDS = new Set(["eventId", "action", "reason", "replaceItemId"]);
const FEEDBACK_FIELDS = new Set(["action", "reason", "replaceItemId", "replacementItemId", "targetEventId"]);
const EXPECTED_FIELDS = new Set(["accepted", "action", "activeAction", "preservation"]);
const FORBIDDEN_KEYS = new Set([
  "email", "phone", "name", "fullName", "address", "birthDate", "photo", "image", "url", "path", "filename",
  "ownerId", "userId", "sessionId", "deviceId", "ip", "token", "vkId", "location", "freeText", "prompt",
  "analytics", "telemetry", "endpoint", "headers", "metadata",
]);

const text = (value) => String(value ?? "").trim();
const unknownFields = (value, allowed) => Object.keys(value || {}).filter((key) => !allowed.has(key));

function containsForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || containsForbiddenKey(child));
}

function reject(caseId, code) {
  return { caseId: text(caseId) || "unknown", status: "rejected", code };
}

function validOutfit(outfit) {
  return outfit && !unknownFields(outfit, OUTFIT_FIELDS).length && text(outfit.id) && text(outfit.recommendationId) && Array.isArray(outfit.itemIds);
}

function validateShape(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "invalid_case";
  if (containsForbiddenKey(input)) return "privacy_field_forbidden";
  if (unknownFields(input, CASE_FIELDS).length) return "unknown_field";
  if (!text(input.caseId)) return "case_id_required";
  if (input.mode !== "personal") return input.mode === "demo" ? "ineligible_source" : "personal_mode_required";
  const consent = input.consent;
  if (!consent || unknownFields(consent, CONSENT_FIELDS).length) return "consent_required";
  if (consent.granted !== true || consent.scope !== OUTFIT_EVAL_V2_CONSENT_SCOPE || consent.storage !== "local_only" || consent.version !== OUTFIT_EVAL_V2_CONSENT_VERSION) return "consent_required";
  if (!Array.isArray(input.wardrobe) || !input.wardrobe.length) return "wardrobe_required";
  if (input.wardrobe.some((item) => !item || unknownFields(item, ITEM_FIELDS).length || !text(item.id) || item.provenance !== "personal")) return "ineligible_source";
  if (!validOutfit(input.sourceOutfit)) return "invalid_source_outfit";
  if (input.resultOutfit != null && !validOutfit(input.resultOutfit)) return "invalid_result_outfit";
  if (!Array.isArray(input.history) || input.history.some((event) => !event || unknownFields(event, HISTORY_FIELDS).length || !text(event.eventId) || !ACTIONS.has(event.action) || event.action === "undo")) return "invalid_history";
  if (!input.feedback || unknownFields(input.feedback, FEEDBACK_FIELDS).length) return "invalid_feedback";
  if (!input.expected || unknownFields(input.expected, EXPECTED_FIELDS).length) return "invalid_expected";
  return null;
}

function sameItems(left, right) {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}

/** Pure developer-local oracle: no persistence, transport, telemetry, or runtime calls. */
export function evaluateOutfitFeedbackV2(input) {
  const invalid = validateShape(input);
  if (invalid) return reject(input?.caseId, invalid);
  const wardrobeIds = new Set(input.wardrobe.map((item) => text(item.id)));
  const sourceIds = input.sourceOutfit.itemIds.map(text);
  if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !wardrobeIds.has(id))) return reject(input.caseId, "ineligible_source");
  const anchorItemId = text(input.anchorItemId);
  if (!anchorItemId || !sourceIds.includes(anchorItemId)) return reject(input.caseId, "anchor_required");

  const { feedback, expected } = input;
  if (!ACTIONS.has(feedback.action)) return reject(input.caseId, "unsupported_action");
  if (feedback.action === "undo") {
    const target = input.history.find((event) => event.eventId === text(feedback.targetEventId));
    if (!target) return reject(input.caseId, "event_not_found");
    if (expected.action !== "undo" || expected.activeAction !== null || expected.accepted !== true) return reject(input.caseId, "invalid_expected");
    return { caseId: input.caseId, status: "passed", action: "undo", activeAction: null, audit: [target.action, "undo"] };
  }

  if (feedback.action === "would_wear") {
    if (feedback.reason != null) return reject(input.caseId, "unsupported_reason");
    if (expected.action !== "would_wear" || expected.accepted !== true) return reject(input.caseId, "invalid_expected");
    return { caseId: input.caseId, status: "passed", action: "would_wear" };
  }

  if (!REASONS.has(feedback.reason)) return reject(input.caseId, "unsupported_reason");
  if (feedback.action === "not_for_me") {
    if (expected.action !== "not_for_me" || expected.accepted !== true) return reject(input.caseId, "invalid_expected");
    return { caseId: input.caseId, status: "passed", action: "not_for_me" };
  }

  const replaceItemId = text(feedback.replaceItemId);
  const replacementItemId = text(feedback.replacementItemId);
  if (!sourceIds.includes(replaceItemId)) return reject(input.caseId, "target_not_in_recommendation");
  if (replaceItemId === anchorItemId) return reject(input.caseId, "anchor_replacement_forbidden");
  if (!wardrobeIds.has(replacementItemId)) return reject(input.caseId, "replacement_not_in_personal_wardrobe");
  if (replaceItemId === replacementItemId) return reject(input.caseId, "replacement_must_differ");
  const categoryById = new Map(input.wardrobe.map((item) => [text(item.id), text(item.category)]));
  if (!categoryById.get(replaceItemId) || categoryById.get(replaceItemId) !== categoryById.get(replacementItemId)) return reject(input.caseId, "replacement_category_mismatch");
  const resultIds = input.resultOutfit?.itemIds?.map(text);
  if (!resultIds || resultIds.some((id) => !wardrobeIds.has(id))) return reject(input.caseId, "replacement_result_required");
  const targetIndex = sourceIds.indexOf(replaceItemId);
  const expectedIds = sourceIds.with(targetIndex, replacementItemId);
  if (!sameItems(resultIds, expectedIds)) return reject(input.caseId, "preservation_failed");
  if (input.resultOutfit.recommendationId === input.sourceOutfit.recommendationId) return reject(input.caseId, "result_provenance_required");
  if (expected.action !== "replace_item" || expected.accepted !== true || expected.preservation !== "passed") return reject(input.caseId, "invalid_expected");
  return { caseId: input.caseId, status: "passed", action: "replace_item", preservation: "passed" };
}

export function runOutfitEvalV2(cases) {
  if (!Array.isArray(cases)) throw new TypeError("cases must be an array");
  const results = cases.map(evaluateOutfitFeedbackV2);
  return { version: OUTFIT_EVAL_V2_VERSION, execution: "developer_local_only", status: results.every((result) => result.status === "passed") ? "passed" : "failed", results };
}
