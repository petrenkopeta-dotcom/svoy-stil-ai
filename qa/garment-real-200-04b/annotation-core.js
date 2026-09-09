export const CONTRACT_VERSION = "garment-real-200-02b-gt-v1";

export const CATEGORIES = Object.freeze([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "one_piece",
  "unknown",
]);
export const COLORS = Object.freeze([
  "black",
  "white",
  "gray",
  "beige",
  "brown",
  "burgundy",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "multicolor",
  "metallic",
  "unknown",
]);
export const SUITABILITY = Object.freeze(["allowlist", "quarantine", "reject"]);
export const QUARANTINE_REASONS = Object.freeze([
  "license_unclear",
  "source_page_unverified",
  "person_present",
  "multiple_items",
  "not_garment",
  "garment_not_primary",
  "cropped",
  "occluded",
  "low_quality",
  "ambiguous_category",
  "other",
]);
export const EDGE_VISIBILITY = Object.freeze(["full", "partial", "uncertain"]);
export const BACKGROUND_RISK = Object.freeze(["low", "medium", "high"]);

const finite01 = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const plainId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(value);

export function normalizeIdList(input) {
  const values = Array.isArray(input)
    ? input
    : Array.isArray(input?.ids)
      ? input.ids
      : [];
  return [...new Set(values.map(String).filter(plainId))].sort();
}

export function importedDisposition(allowlist, quarantine) {
  const allowed = new Set(normalizeIdList(allowlist));
  const held = new Set(normalizeIdList(quarantine));
  const overlap = [...allowed].filter((id) => held.has(id));
  return { allowed, held, overlap };
}

export function validateAnnotation(
  row,
  { manifestIds, ownerIds = new Set() } = {},
) {
  const errors = [];
  const warnings = [];
  if (!row || typeof row !== "object" || Array.isArray(row))
    return { valid: false, errors: ["row_not_object"], warnings };
  if (row.contract_version !== CONTRACT_VERSION)
    errors.push("contract_version_invalid");
  if (!plainId(row.id)) errors.push("id_invalid");
  if (manifestIds && !manifestIds.has(row.id) && !ownerIds.has(row.id))
    errors.push("id_not_in_manifest");
  if (!CATEGORIES.includes(row.category)) errors.push("category_invalid");
  if (typeof row.category_ru !== "string" || row.category_ru.trim().length < 2)
    errors.push("category_ru_required");
  if (!COLORS.includes(row.primary_color)) errors.push("primary_color_invalid");
  if (
    !Array.isArray(row.additional_colors) ||
    row.additional_colors.some(
      (color) => !COLORS.includes(color) || color === row.primary_color,
    )
  )
    errors.push("additional_colors_invalid");
  if (typeof row.pattern_ru !== "string" || !row.pattern_ru.trim())
    errors.push("pattern_ru_required");
  if (typeof row.texture_ru !== "string" || !row.texture_ru.trim())
    errors.push("texture_ru_required");
  if (typeof row.trim_ru !== "string" || !row.trim_ru.trim())
    errors.push("trim_ru_required");
  if (!EDGE_VISIBILITY.includes(row.edge_visibility))
    errors.push("edge_visibility_invalid");
  if (!BACKGROUND_RISK.includes(row.background_match_risk))
    errors.push("background_match_risk_invalid");
  if (!SUITABILITY.includes(row.suitability))
    errors.push("suitability_invalid");
  if (
    typeof row.annotator_id !== "string" ||
    row.annotator_id.trim().length < 2
  )
    errors.push("annotator_id_required");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(row.annotated_at || ""))
    errors.push("annotated_at_invalid");
  if (
    row.source_scope !== (ownerIds.has(row.id) ? "owner-provided" : "openverse")
  )
    errors.push("source_scope_mismatch");

  const reasons = Array.isArray(row.quarantine_reasons)
    ? row.quarantine_reasons
    : [];
  if (row.suitability === "quarantine" && reasons.length === 0)
    errors.push("quarantine_reason_required");
  if (row.suitability !== "quarantine" && reasons.length)
    errors.push("quarantine_reason_for_non_quarantine");
  if (reasons.some((reason) => !QUARANTINE_REASONS.includes(reason)))
    errors.push("quarantine_reason_invalid");

  if (row.suitability === "allowlist") {
    if (row.category === "unknown") errors.push("allowlist_category_unknown");
    if (row.primary_color === "unknown") errors.push("allowlist_color_unknown");
    if (!row.bbox) errors.push("allowlist_bbox_required");
  }
  if (row.bbox != null) {
    const b = row.bbox;
    if (
      ![b.x, b.y, b.width, b.height].every(finite01) ||
      b.width <= 0 ||
      b.height <= 0 ||
      b.x + b.width > 1.000001 ||
      b.y + b.height > 1.000001
    )
      errors.push("bbox_invalid");
  }
  if (row.boundary != null) {
    if (
      !Array.isArray(row.boundary) ||
      row.boundary.length < 3 ||
      row.boundary.some(
        (p) => !Array.isArray(p) || p.length !== 2 || !p.every(finite01),
      )
    )
      errors.push("boundary_invalid");
    if (!row.bbox) errors.push("boundary_requires_bbox");
  }
  if (row.exclusion_polygons != null) {
    if (
      !Array.isArray(row.exclusion_polygons) ||
      row.exclusion_polygons.some(
        (polygon) =>
          !Array.isArray(polygon) ||
          polygon.length < 3 ||
          polygon.some(
            (p) => !Array.isArray(p) || p.length !== 2 || !p.every(finite01),
          ),
      )
    )
      errors.push("exclusion_polygons_invalid");
    if (!row.boundary) errors.push("exclusions_require_boundary");
  }
  if (row.mask != null) {
    if (
      typeof row.mask !== "object" ||
      row.mask.kind !== "local_file" ||
      typeof row.mask.file !== "string" ||
      !/\.(png|svg)$/i.test(row.mask.file)
    )
      errors.push("mask_reference_invalid");
    warnings.push("mask_bytes_not_verified_by_json_validator");
  }
  if (row.source_scope === "owner-provided")
    warnings.push("owner_excluded_from_headline");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function coverageReport({
  manifest = [],
  ownerManifest = [],
  annotations = [],
  allowlist = [],
  quarantine = [],
} = {}) {
  const manifestIds = new Set(manifest.map((row) => String(row.id)));
  const ownerIds = new Set(
    (ownerManifest.files || ownerManifest || []).map((row) =>
      String(row.id || row.file),
    ),
  );
  const imported = importedDisposition(allowlist, quarantine);
  const duplicateIds = annotations
    .map((row) => row?.id)
    .filter((id, index, ids) => id && ids.indexOf(id) !== index);
  const results = annotations.map((row) => ({
    id: row?.id,
    ...validateAnnotation(row, { manifestIds, ownerIds }),
  }));
  const validRows = annotations.filter((_, index) => results[index].valid);
  const headline = validRows.filter((row) => row.source_scope === "openverse");
  const owner = validRows.filter(
    (row) => row.source_scope === "owner-provided",
  );
  const count = (rows, field, value) =>
    rows.filter((row) => row[field] === value).length;
  const expectedHeadline = manifestIds.size;
  const completeHeadline = new Set(headline.map((row) => row.id)).size;
  return {
    contract_version: CONTRACT_VERSION,
    status:
      completeHeadline === expectedHeadline &&
      results.every((row) => row.valid) &&
      duplicateIds.length === 0 &&
      imported.overlap.length === 0
        ? "READY_FOR_INDEPENDENT_REGATE"
        : "HOLD",
    headline: {
      expected: expectedHeadline,
      valid_annotated: completeHeadline,
      coverage: expectedHeadline ? completeHeadline / expectedHeadline : 0,
      allowlist: count(headline, "suitability", "allowlist"),
      quarantine: count(headline, "suitability", "quarantine"),
      reject: count(headline, "suitability", "reject"),
      bbox: headline.filter((row) => row.bbox).length,
      boundary: headline.filter((row) => row.boundary).length,
      mask: headline.filter((row) => row.mask).length,
    },
    owner_provided_excluded_from_headline: {
      expected: ownerIds.size,
      valid_annotated: new Set(owner.map((row) => row.id)).size,
      bbox: owner.filter((row) => row.bbox).length,
      boundary: owner.filter((row) => row.boundary).length,
      mask: owner.filter((row) => row.mask).length,
    },
    imported_lists: {
      allowlist: imported.allowed.size,
      quarantine: imported.held.size,
      overlap: imported.overlap,
    },
    validation: {
      total_rows: annotations.length,
      valid_rows: validRows.length,
      invalid_rows: results.filter((row) => !row.valid),
      duplicate_ids: [...new Set(duplicateIds)],
    },
    declaration:
      "Ground truth is manual. READY_FOR_INDEPENDENT_REGATE is not an 8/10 result and does not evaluate product recognition.",
  };
}
