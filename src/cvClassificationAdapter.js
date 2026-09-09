import { TAXONOMY } from "./stylistReasoningSchemas.js";

export const CV_CLASSIFICATION_ADAPTER_VERSION = "cv-classification-adapter/1.0";

const CATEGORY_ALIASES = Object.freeze({
  top: "top", shirt: "top", blouse: "top", tshirt: "top", "t-shirt": "top", sweater: "top", hoodie: "top",
  bottom: "bottom", pants: "bottom", trousers: "bottom", jeans: "bottom", shorts: "bottom", skirt: "bottom",
  dress: "dress", gown: "dress",
  outerwear: "outerwear", coat: "outerwear", jacket: "outerwear", blazer: "outerwear", trench: "outerwear",
  shoes: "shoes", shoe: "shoes", sneaker: "shoes", sneakers: "shoes", boot: "shoes", boots: "shoes", sandal: "shoes",
  accessory: "accessory", bag: "accessory", handbag: "accessory", belt: "accessory", scarf: "accessory", hat: "accessory",
  one_piece: "one_piece", jumpsuit: "one_piece", romper: "one_piece",
});

const COLOR_ALIASES = Object.freeze({
  white: "Белый", black: "Чёрный", gray: "Серый", grey: "Серый", blue: "Синий", navy: "Синий",
  beige: "Бежевый", brown: "Коричневый", red: "Красный", green: "Зелёный", yellow: "Жёлтый",
  orange: "Оранжевый", pink: "Розовый", purple: "Фиолетовый", burgundy: "Бордовый",
  multicolor: "Многоцветный", "multi-color": "Многоцветный",
});

const clean = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const finiteScore = (value) => {
  const score = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
};
const confidenceBand = (score) => score == null ? "unknown" : score >= .8 ? "high" : score >= .55 ? "medium" : "low";

export function mapDetectedCategory(label) {
  const normalized = clean(label).replace(/\s+/g, "_");
  if (TAXONOMY.categories.includes(normalized)) return normalized;
  if (CATEGORY_ALIASES[normalized]) return CATEGORY_ALIASES[normalized];
  const words = clean(label).replace(/[^a-z-]+/g, " ").split(/\s+/).filter(Boolean);
  for (const word of words) if (CATEGORY_ALIASES[word]) return CATEGORY_ALIASES[word];
  return "unknown";
}

export function mapDetectedColor(label) {
  return COLOR_ALIASES[clean(label)] || "unknown";
}

function box(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x), y = Number(value.y), width = Number(value.width), height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return Object.freeze({ x, y, width, height });
}

function intersectionOverUnion(a, b) {
  if (!a || !b) return 0;
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / (a.width * a.height + b.width * b.height - area);
}

function scopeFor(source) {
  if (source?.mode === "owner") {
    if (typeof source.ownerId !== "string" || !source.ownerId.trim()) throw new TypeError("owner source requires ownerId");
    if (source.referenceId != null) throw new TypeError("owner source cannot carry referenceId");
    return Object.freeze({ source_mode: "owner", owner_scope: source.ownerId.trim(), ownership: "owner_scoped" });
  }
  if (source?.mode === "reference") {
    if (typeof source.referenceId !== "string" || !source.referenceId.trim()) throw new TypeError("reference source requires referenceId");
    if (source.ownerId != null) throw new TypeError("reference source cannot carry ownerId");
    return Object.freeze({ source_mode: "reference", reference_id: source.referenceId.trim(), ownership: "unconfirmed" });
  }
  throw new TypeError("source.mode must be owner or reference");
}

/**
 * Pure provider-neutral boundary. It consumes metadata emitted by detector and
 * segmenter adapters; image bytes, masks, URLs and hidden attributes are never
 * copied to the result.
 */
export function adaptGarmentCandidates({ photoId, source, detections = [], segmentations = [] } = {}) {
  if (typeof photoId !== "string" || !photoId.trim()) throw new TypeError("photoId is required");
  if (!Array.isArray(detections) || !Array.isArray(segmentations)) throw new TypeError("detections and segmentations must be arrays");
  const scope = scopeFor(source);
  const segments = new Map();
  for (const item of segmentations) {
    const id = String(item?.detectionId ?? item?.detection_id ?? "");
    if (id && !segments.has(id)) segments.set(id, item);
  }
  const seenIds = new Set();
  const accepted = [];
  const suppressed = [];
  for (let index = 0; index < detections.length; index += 1) {
    const detection = detections[index] || {};
    const detectorId = String(detection.id ?? detection.detection_id ?? "");
    if (!detectorId) throw new TypeError(`detections[${index}].id is required`);
    if (seenIds.has(detectorId)) throw new TypeError(`duplicate detection id: ${detectorId}`);
    seenIds.add(detectorId);
    const region = box(detection.bbox ?? detection.box);
    if (!region) throw new TypeError(`detections[${index}].bbox is invalid`);
    const segment = segments.get(detectorId);
    const category = mapDetectedCategory(detection.category ?? detection.label);
    const color = mapDetectedColor(detection.color?.label ?? detection.color);
    const categoryScore = finiteScore(detection.categoryConfidence ?? detection.confidence ?? detection.score);
    const colorScore = finiteScore(detection.color?.confidence ?? detection.colorConfidence);
    const maskScore = finiteScore(segment?.mask_confidence ?? segment?.maskConfidence);
    const edgeScore = finiteScore(segment?.edge_quality ?? segment?.edgeQuality);
    const visibility = ["full", "partial", "cropped", "occluded", "unknown"].includes(segment?.visibility) ? segment.visibility : "unknown";
    const reasons = [];
    if (category === "unknown") reasons.push("unknown_category");
    if (color === "unknown") reasons.push("unknown_color");
    if (categoryScore == null) reasons.push("unknown_category_confidence");
    if (colorScore == null) reasons.push("unknown_color_confidence");
    if (!segment) reasons.push("segmentation_missing");
    if (maskScore == null) reasons.push("unknown_mask_confidence"); else if (maskScore < .82) reasons.push("low_mask_confidence");
    if (edgeScore == null) reasons.push("unknown_edge_quality"); else if (edgeScore < .72) reasons.push("poor_edge_quality");
    if (["partial", "cropped", "occluded", "unknown"].includes(visibility)) reasons.push("visibility_review_required");
    const candidate = Object.freeze({
      id: `${photoId.trim()}:${detectorId}`, detector_id: detectorId, ...scope,
      state: "pending_confirmation", confirmation_required: true, confirmed: false,
      category: Object.freeze({ value: category, score: categoryScore, confidence: confidenceBand(categoryScore) }),
      color: Object.freeze({ value: color, score: colorScore, confidence: confidenceBand(colorScore) }),
      segmentation: Object.freeze({ matched: Boolean(segment), mask_confidence: maskScore, edge_quality: edgeScore, visibility }),
      region, review_reasons: Object.freeze([...new Set(reasons)]),
    });
    const duplicate = category !== "unknown" && color !== "unknown"
      ? accepted.find((prior) => prior.category.value === category && prior.color.value === color && intersectionOverUnion(prior.region, region) >= .9)
      : null;
    if (duplicate) suppressed.push(Object.freeze({ detector_id: detectorId, duplicate_of: duplicate.detector_id, reason: "overlapping_same_taxonomy" }));
    else accepted.push(candidate);
  }
  return Object.freeze({
    version: CV_CLASSIFICATION_ADAPTER_VERSION, photo_id: photoId.trim(), ...scope,
    confirmation_required: accepted.length > 0, candidates: Object.freeze(accepted), suppressed_duplicates: Object.freeze(suppressed),
  });
}
