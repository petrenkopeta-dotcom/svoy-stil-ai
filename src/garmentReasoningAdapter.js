export const GARMENT_REASONING_ADAPTER_VERSION = "garment-reasoning-adapter/1.0.0";

const CATEGORIES = new Set(["top", "bottom", "outerwear", "shoes"]);
const VOLUMES = new Set(["fitted", "regular", "relaxed", "oversized"]);
const LENGTHS = new Set(["cropped", "short", "midi", "maxi"]);
const SEASONS = new Set(["spring", "summer", "autumn", "winter", "all_season"]);
const TEXTURES = new Set(["smooth", "soft", "ribbed", "chunky", "fuzzy", "sheer", "structured", "glossy", "matte", "other"]);
const ROLES = new Set(["base", "support", "accent", "dominant", "supporting"]);
const FIT_TO_VOLUME = Object.freeze({ fitted: "fitted", bodycon: "fitted", straight: "regular", a_line: "regular", tapered: "regular", relaxed: "relaxed", wide: "relaxed", oversized: "oversized" });
const VOLUME_TO_ENGINE = Object.freeze({ close: "fitted", regular: "regular", relaxed: "relaxed", voluminous: "oversized", fitted: "fitted", oversized: "oversized" });
const NEUTRAL_FAMILIES = new Set(["black", "white", "gray", "grey", "beige", "brown", "navy", "cream"]);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const norm = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : null;
const validNumber = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function field(features, name) {
  const raw = features?.[name];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && own(raw, "value")) {
    return raw.confirmed === true ? { value: raw.value, provenance: raw.provenance ?? null } : null;
  }
  const confirmation = features?.confirmation?.[name];
  const confirmed = confirmation === true || confirmation?.confirmed === true || features?.confirmed_fields?.includes?.(name);
  if (!confirmed || raw == null) return null;
  return { value: raw, provenance: confirmation?.provenance ?? features?.provenance?.[name] ?? null };
}

function sourceFor(garment, featureName, explicit) {
  return explicit ?? { kind: "garment_stylist_feature", garment_id: String(garment.id ?? garment.garment_id), field: featureName, revision: garment.stylist_features?.revision ?? null };
}

function colorInput(garment, features) {
  const confirmed = field(features, "colors");
  if (!confirmed || !Array.isArray(confirmed.value)) return null;
  const color = confirmed.value.find((entry) => entry && typeof entry.name === "string");
  if (!color) return null;
  const family = norm(color.family ?? color.name);
  if (!family) return null;
  const confirmedLightness = field(features, "lightness");
  const confirmedSaturation = field(features, "saturation");
  const lightness = validNumber(color.lightness, 0, 100) ? color.lightness : validNumber(confirmedLightness?.value, 0, 1) ? confirmedLightness.value * 100 : null;
  const saturation = validNumber(color.saturation, 0, 100) ? color.saturation : validNumber(confirmedSaturation?.value, 0, 1) ? confirmedSaturation.value * 100 : null;
  const role = ROLES.has(color.role) ? ({ dominant: "base", supporting: "support" }[color.role] ?? color.role) : null;
  return { id: String(garment.id ?? garment.garment_id), confirmed: true, color: { family, neutral: color.neutral === true || NEUTRAL_FAMILIES.has(family), ...(lightness == null ? {} : { lightness }), ...(saturation == null ? {} : { saturation }), ...(role ? { role } : {}) }, provenance: { colors: sourceFor(garment, "colors", confirmed.provenance), ...(lightness == null ? {} : { lightness: sourceFor(garment, "lightness", confirmedLightness?.provenance ?? confirmed.provenance) }), ...(saturation == null ? {} : { saturation: sourceFor(garment, "saturation", confirmedSaturation?.provenance ?? confirmed.provenance) }) } };
}

function silhouetteInput(garment, features) {
  const category = norm(garment.category ?? features.category);
  if (!CATEGORIES.has(category)) return null;
  const volumeField = field(features, "volume");
  const fitField = field(features, "fit");
  const rawVolume = norm(volumeField?.value);
  const volume = VOLUMES.has(rawVolume) ? rawVolume : VOLUME_TO_ENGINE[rawVolume] ?? FIT_TO_VOLUME[norm(fitField?.value)];
  const lengthField = field(features, "length");
  const length = norm(lengthField?.value);
  if (!volume && !LENGTHS.has(length)) return null;
  return { category: category === "outerwear" ? "outer" : category, value: { confirmed: true, ...(volume ? { volume } : {}), ...(LENGTHS.has(length) ? { length } : {}), provenance: { ...(volume ? { volume: sourceFor(garment, volumeField ? "volume" : "fit", volumeField?.provenance ?? fitField?.provenance) } : {}), ...(LENGTHS.has(length) ? { length: sourceFor(garment, "length", lengthField.provenance) } : {}) } } };
}

function contextMetadata(garment, features) {
  const result = { garment_id: String(garment.id ?? garment.garment_id), provenance: {} };
  const formality = field(features, "formality");
  if (validNumber(formality?.value, 1, 5) && Number.isInteger(formality.value)) { result.formality = formality.value; result.provenance.formality = sourceFor(garment, "formality", formality.provenance); }
  const warmth = field(features, "warmth");
  if (validNumber(warmth?.value, 1, 5) && Number.isInteger(warmth.value)) { result.warmth = warmth.value; result.provenance.warmth = sourceFor(garment, "warmth", warmth.provenance); }
  const seasons = field(features, "seasons");
  if (Array.isArray(seasons?.value)) { result.seasons = [...new Set(seasons.value.map(norm).filter((value) => SEASONS.has(value)))]; if (result.seasons.length) result.provenance.seasons = sourceFor(garment, "seasons", seasons.provenance); }
  const texture = field(features, "texture");
  const normalizedTexture = norm(texture?.value);
  if (TEXTURES.has(normalizedTexture)) { result.texture = normalizedTexture; result.provenance.texture = sourceFor(garment, "texture", texture.provenance); }
  return Object.keys(result.provenance).length ? result : null;
}

/** Converts confirmed garment facts only. It performs no recognition or person inference. */
export function adaptGarmentsToReasoningInput(garments = []) {
  const items = [], silhouette = {}, garmentContext = [];
  for (const garment of Array.isArray(garments) ? garments : []) {
    const features = garment?.stylist_features;
    if (!features || typeof features !== "object") continue;
    const color = colorInput(garment, features); if (color) items.push(color);
    const shape = silhouetteInput(garment, features); if (shape && !silhouette[shape.category]) silhouette[shape.category] = shape.value;
    const metadata = contextMetadata(garment, features); if (metadata) garmentContext.push(metadata);
  }
  const formalities = garmentContext.map((entry) => entry.formality).filter((value) => value != null);
  const outfit = garmentContext.length ? { confirmed: true, garments: garmentContext, ...(formalities.length ? { formality: Math.min(...formalities), provenance: { formality: garmentContext.filter((entry) => entry.formality != null).map((entry) => entry.provenance.formality) } } : {}) } : undefined;
  return { adapter_version: GARMENT_REASONING_ADAPTER_VERSION, items, silhouette, context: outfit ? { outfit } : {}, provenance: garmentContext.map(({ garment_id, provenance }) => ({ garment_id, fields: provenance })) };
}
