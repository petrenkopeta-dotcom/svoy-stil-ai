export const REFERENCE_EXTRACTION_SCHEMA_VERSION = "reference-extraction/1.0.0";
export const REFERENCE_PREVIEW_LABEL = "AI-превью · проверьте детали";

export const REFERENCE_CATEGORIES = Object.freeze(["top", "bottom", "outerwear", "dress", "shoes", "bag", "accessory", "unknown"]);
export const REFERENCE_FIELDS = Object.freeze(["category", "color", "material", "silhouette"]);
export const CONFIDENCE_BANDS = Object.freeze(["low", "medium", "high", "unknown"]);
export const VISIBILITY_STATES = Object.freeze(["full", "partial", "cropped", "occluded", "unknown"]);

const bounded = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const cleanText = (value) => typeof value === "string" && value.trim() ? value.trim() : "unknown";

export function confidenceBand(score) {
  if (!bounded(score)) return "unknown";
  if (score >= .8) return "high";
  if (score >= .55) return "medium";
  return "low";
}

export function createEvidenceField(value, { status = "verified", score = null, evidence = [] } = {}) {
  if (!["verified", "inferred", "unknown"].includes(status)) throw new TypeError("Unsupported evidence status");
  if (status === "verified" && (!Array.isArray(evidence) || evidence.length === 0)) throw new TypeError("Verified fields require visible evidence");
  const normalized = status === "unknown" ? "unknown" : cleanText(value);
  return Object.freeze({ value: normalized, status, confidence: confidenceBand(score), score: bounded(score) ? score : null, evidence: Object.freeze((evidence || []).map(cleanText).filter((x) => x !== "unknown")) });
}

export function createReferenceCandidate(input = {}) {
  if (!input.id || !input.region?.crop) throw new TypeError("Candidate id and region.crop are required");
  const visibility = VISIBILITY_STATES.includes(input.visibility) ? input.visibility : "unknown";
  const fields = Object.fromEntries(REFERENCE_FIELDS.map((name) => [name, input.fields?.[name] ?? createEvidenceField("unknown", { status: "unknown" })]));
  const hidden = visibility === "cropped" || visibility === "occluded" || Object.values(fields).some((field) => field.status === "inferred");
  return Object.freeze({
    id: String(input.id), source_mode: "reference", ownership: "unconfirmed", state: "pending_review",
    region: Object.freeze({ crop: Object.freeze({ ...input.region.crop }), mask: input.region.mask ?? null, outline: input.region.outline ?? null }),
    visibility, occlusion: Object.freeze([...(input.occlusion || [])]), fields: Object.freeze(fields),
    reconstruction_status: hidden ? "preview_only" : "not_needed", ui_label: hidden ? REFERENCE_PREVIEW_LABEL : null,
    duplicate_review: Object.freeze({ status: "not_checked", possible_match_ids: Object.freeze([]) }),
  });
}

export function assertReferenceExtraction(result) {
  if (result?.schema_version !== REFERENCE_EXTRACTION_SCHEMA_VERSION || result?.source_mode !== "reference" || !Array.isArray(result.candidates)) throw new TypeError("Invalid reference extraction envelope");
  const ids = new Set();
  for (const candidate of result.candidates) {
    if (candidate.source_mode !== "reference" || candidate.ownership !== "unconfirmed" || ids.has(candidate.id)) throw new TypeError("Invalid reference candidate identity or ownership");
    ids.add(candidate.id);
    if (!REFERENCE_CATEGORIES.includes(candidate.fields.category.value)) throw new TypeError("Unsupported category");
    if (candidate.reconstruction_status === "preview_only" && candidate.ui_label !== REFERENCE_PREVIEW_LABEL) throw new TypeError("Preview disclosure is required");
    for (const field of Object.values(candidate.fields)) if (field.status === "verified" && !field.evidence.length) throw new TypeError("Verified field lacks evidence");
  }
  return result;
}
