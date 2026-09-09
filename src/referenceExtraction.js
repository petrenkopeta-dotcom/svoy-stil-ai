import { REFERENCE_CATEGORIES, REFERENCE_EXTRACTION_SCHEMA_VERSION, REFERENCE_FIELDS, assertReferenceExtraction, createEvidenceField, createReferenceCandidate } from "./referenceExtractionContracts.js";

const knownCategory = (value) => REFERENCE_CATEGORIES.includes(value) ? value : "unknown";
const observedField = (observation, name) => {
  const item = observation?.[name];
  if (item?.status === "inferred" && item.value) return createEvidenceField(name === "category" ? knownCategory(item.value) : item.value, { status: "inferred", score: item.score, evidence: item.evidence || ["model_hypothesis_not_visible_evidence"] });
  if (!item || item.visible !== true || !item.value) return createEvidenceField("unknown", { status: "unknown" });
  return createEvidenceField(name === "category" ? knownCategory(item.value) : item.value, { status: "verified", score: item.score, evidence: item.evidence || [`visible_${name}`] });
};

/**
 * Provider-neutral deterministic boundary. Region observations must come from
 * manual annotation or a future CV model; this function never inspects faces,
 * bodies or protected attributes and never fills absent garment slots.
 */
export function extractReferenceCandidates({ reference_id, regions = [] } = {}) {
  if (!reference_id) throw new TypeError("reference_id is required");
  const candidates = regions.filter((region) => region?.crop).map((region, index) => createReferenceCandidate({
    id: region.id || `${reference_id}:candidate-${index + 1}`,
    region: { crop: region.crop, mask: region.mask ?? null, outline: region.outline ?? null },
    visibility: region.visibility, occlusion: region.occlusion,
    fields: Object.fromEntries(REFERENCE_FIELDS.map((name) => [name, observedField(region.observations, name)])),
  }));
  return assertReferenceExtraction(Object.freeze({ schema_version: REFERENCE_EXTRACTION_SCHEMA_VERSION, source_mode: "reference", reference_id: String(reference_id), candidates: Object.freeze(candidates), limitations: Object.freeze(["region_detection_external", "no_hidden_part_verification", "no_ownership_assumption"]) }));
}

export function reviewReferenceCandidate(candidate, action, corrections = {}) {
  if (!candidate || !["confirm", "correct", "reject"].includes(action)) throw new TypeError("Unsupported review action");
  if (action === "reject") return Object.freeze({ ...candidate, state: "rejected", ownership: "unconfirmed" });
  const fields = { ...candidate.fields };
  if (action === "correct") for (const name of REFERENCE_FIELDS) if (corrections[name] != null) fields[name] = createEvidenceField(name === "category" ? knownCategory(corrections[name]) : corrections[name], { status: "verified", score: 1, evidence: ["user_correction"] });
  return Object.freeze({ ...candidate, fields: Object.freeze(fields), state: "confirmed_reference", ownership: "unconfirmed" });
}

export function markPossibleDuplicates(candidates = []) {
  return candidates.map((candidate, index) => {
    const possible = candidates.slice(0, index).filter((other) => {
      const a = candidate.fields, b = other.fields;
      return a.category.status !== "unknown" && a.category.value === b.category.value && a.color.status !== "unknown" && a.color.value === b.color.value && a.material.status !== "unknown" && a.material.value === b.material.value && a.silhouette.status !== "unknown" && a.silhouette.value === b.silhouette.value;
    }).map((item) => item.id);
    return Object.freeze({ ...candidate, duplicate_review: Object.freeze({ status: possible.length ? "possible_match_review" : "no_exact_feature_match", possible_match_ids: Object.freeze(possible) }) });
  });
}

export function createPersonalWardrobeItem(candidate, command = {}) {
  if (command.type !== "declare_personal_item" || command.label !== "Это моя вещь") throw new Error("EXPLICIT_PERSONAL_OWNERSHIP_CONFIRMATION_REQUIRED");
  if (candidate?.state !== "confirmed_reference") throw new Error("REFERENCE_CANDIDATE_MUST_BE_CONFIRMED");
  return Object.freeze({ id: command.wardrobe_item_id || `wardrobe:${candidate.id}`, source_candidate_id: candidate.id, source_mode: "reference", ownership: "personal_confirmed", category: candidate.fields.category.value, color: candidate.fields.color.value, material: candidate.fields.material.value, silhouette: candidate.fields.silhouette.value });
}
