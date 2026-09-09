export const SEGMENTATION_CONTRACT_VERSION = "segmentation-v1";
export const CLASSIFICATION_CONTRACT_VERSION = "garment-classification-v2";

export function createSegmentationRequest({ photoId, background = {}, allowGenerativeInpainting = false } = {}) {
  if (!photoId) throw new TypeError("photoId is required");
  if (allowGenerativeInpainting) throw new Error("GENERATIVE_INPAINTING_REQUIRES_EXPLICIT_FEATURE_REVIEW");
  return Object.freeze({ version: SEGMENTATION_CONTRACT_VERSION, photoId, preserve_original: true, contrast_adaptive_background: true, background, output: { mask_confidence: true, edge_quality: true, uncertainty_map: true }, generative_inpainting: false });
}

export function reviewSegmentation(result = {}, { minMaskConfidence = .82, minEdgeQuality = .72 } = {}) {
  const confidence = Number(result.mask_confidence); const edge = Number(result.edge_quality);
  const reviewRequired = !Number.isFinite(confidence) || !Number.isFinite(edge) || confidence < minMaskConfidence || edge < minEdgeQuality;
  return Object.freeze({ accepted: !reviewRequired, review_required: reviewRequired, preserve_original: true, reasons: [confidence < minMaskConfidence ? "low_mask_confidence" : null, edge < minEdgeQuality ? "poor_edge_quality" : null].filter(Boolean) });
}

export function normalizeClassification(result = {}, { minimumConfidence = .78 } = {}) {
  const confidence = Number(result.confidence);
  const safe = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const aiSuggestion = Object.freeze({ category: result.category || "unknown", subcategory_ru: result.subcategory_ru || result.subcategory || "Не указана", name_ru: result.name_ru || "Вещь", color: result.color || "не указан", confidence: safe, provenance: result.provenance || "provider-neutral", version: String(result.version || CLASSIFICATION_CONTRACT_VERSION) });
  return Object.freeze({ version: CLASSIFICATION_CONTRACT_VERSION, category: aiSuggestion.category, subcategory: aiSuggestion.subcategory_ru, name_ru: aiSuggestion.name_ru, color: aiSuggestion.color, confidence: safe, aiSuggestion, userConfirmed: null, editable: true, confirmation_required: true, manual_fallback: safe < minimumConfidence, provenance: aiSuggestion.provenance });
}

export function mergeClassificationSuggestion(current, result, options) {
  const normalized = normalizeClassification(result, options);
  return Object.freeze({ ...normalized, userConfirmed: current?.userConfirmed ? Object.freeze({ ...current.userConfirmed }) : null });
}

export function confirmClassification(current, value = {}, { source = "user", confirmedAt = new Date().toISOString() } = {}) {
  if (source !== "user" && source !== "manual_fallback") throw new TypeError("Unsupported confirmation source");
  const prior = Number(current?.userConfirmed?.version) || 0;
  const userConfirmed = Object.freeze({
    category: value.category || current?.userConfirmed?.category || current?.aiSuggestion?.category || "unknown",
    subcategory_ru: value.subcategory_ru || current?.userConfirmed?.subcategory_ru || current?.aiSuggestion?.subcategory_ru || "Не указана",
    name_ru: value.name_ru || current?.userConfirmed?.name_ru || current?.aiSuggestion?.name_ru || "Вещь",
    color: value.color || current?.userConfirmed?.color || current?.aiSuggestion?.color || "не указан",
    source, version: prior + 1, confirmedAt,
  });
  return Object.freeze({ ...current, userConfirmed, confirmation_required: false });
}
