import { createPersonalWardrobeItem, markPossibleDuplicates, reviewReferenceCandidate } from "./referenceExtraction.js";
import { extractReferenceCandidates } from "./referenceExtraction.js";

export const REFERENCE_FLOW_STAGES = Object.freeze(["idle", "importing", "review", "saving", "saved", "error"]);

export function createLocalReferenceCandidate(dto, id = `reference-${Date.now()}`) {
  if (dto?.purpose !== "reference" || dto?.networkAllowed !== false) throw new TypeError("SAFE_REFERENCE_INPUT_REQUIRED");
  return {
    id: `${id}:candidate-1`, source_mode: "reference", ownership: "unconfirmed", state: "pending_review",
    region: { crop: { x: 0, y: 0, width: 1, height: 1 }, mask: null, outline: null },
    visibility: "full", occlusion: [], reconstruction_status: "not_needed", ui_label: null,
    fields: Object.fromEntries(["category", "color", "material", "silhouette"].map((key) => [key, { value: "unknown", status: "unknown", confidence: "unknown", score: null, evidence: [] }])),
    duplicate_review: { status: "not_checked", possible_match_ids: [] }, previewUrl: dto.previewUrl,
  };
}

/** Adapter boundary: no detector means zero candidates; only explicit visible regions are passed to the domain extractor. */
export function adaptLocalReferenceRegions(dto, regions = [], referenceId = `reference-${Date.now()}`) {
  if (dto?.purpose !== "reference" || dto?.networkAllowed !== false) throw new TypeError("SAFE_REFERENCE_INPUT_REQUIRED");
  const visible = regions.filter((region) => region?.visible === true && region?.selection?.bounds);
  const result = extractReferenceCandidates({ reference_id: referenceId, regions: visible.map((region, index) => ({
    id: region.id || `${referenceId}:manual-${index + 1}`,
    crop: region.selection.bounds,
    outline: { version: region.selection.version, points: region.selection.points, trust: "untrusted", purpose: "guidance_only", source: "user_confirmed" },
    visibility: "full", observations: {},
  })) });
  return result.candidates.map((candidate) => ({ ...candidate, previewUrl: dto.previewUrl, selected: true }));
}

export function adaptAutomaticReferenceRegions(dto, regions = [], referenceId = `reference-${Date.now()}`) {
  if (dto?.purpose !== "reference" || dto?.networkAllowed !== false) throw new TypeError("SAFE_REFERENCE_INPUT_REQUIRED");
  const result = extractReferenceCandidates({ reference_id: referenceId, regions });
  return result.candidates.map((candidate, index) => ({ ...candidate, previewUrl: regions[index]?.previewUrl || dto.previewUrl, local_cutout_data_url: regions[index]?.previewUrl || null, selected: true }));
}

export function updateReferenceReview(candidates, id, action, corrections = {}) {
  return markPossibleDuplicates(candidates.map((candidate) => candidate.id === id ? Object.freeze({ ...reviewReferenceCandidate(candidate, action, corrections), personal_declaration: corrections.__declarePersonal === true }) : candidate));
}

export function undoReferenceReview(candidates, snapshot) {
  return snapshot ? structuredClone(snapshot) : candidates;
}

export function prepareConfirmedWardrobeBatch(candidates, existing = [], batchId = "reference-batch", selectedIds = null) {
  const selected = selectedIds == null ? null : new Set(selectedIds);
  const accepted = candidates.filter((candidate) => candidate.state === "confirmed_reference" && candidate.ownership === "unconfirmed" && candidate.personal_declaration === true && (!selected || selected.has(candidate.id)));
  const existingSources = new Set(existing.map((item) => item.source_candidate_id).filter(Boolean));
  return accepted.filter((candidate) => !existingSources.has(candidate.id)).map((candidate, index) => ({
    ...createPersonalWardrobeItem(candidate, { type: "declare_personal_item", label: "Это моя вещь", wardrobe_item_id: `${batchId}:${index + 1}` }),
    name: candidate.fields.category.value === "unknown" ? "Вещь из референса" : candidate.fields.category.value,
    type: candidate.fields.category.value, style: "Не указан", source: "personal", confirmed: true, status: "ready",
    confirmedFacts: { category: candidate.fields.category.status === "verified", color: candidate.fields.color.status === "verified", style: false }, emoji: "◇",
    reference_crop: { ...candidate.region.crop },
    reference_outline: candidate.region.outline,
    local_cutout_blob: candidate.local_cutout_blob || null,
    local_cutout_data_url: candidate.local_cutout_data_url || null,
  }));
}

export function referenceAnalyticsEvent(stage, { method = "unknown", count = 0, outcome = "shown" } = {}) {
  return { name: "reference_flow", properties: { stage, method, count: Math.max(0, Math.min(50, Number(count) || 0)), outcome } };
}
