import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSION,
  coverageReport,
  importedDisposition,
  validateAnnotation,
} from "./annotation-core.js";

const base = {
  contract_version: CONTRACT_VERSION,
  id: "001",
  source_scope: "openverse",
  category: "top",
  category_ru: "Топ",
  primary_color: "burgundy",
  additional_colors: ["beige"],
  pattern_ru: "Без принта",
  texture_ru: "Трикотаж",
  trim_ru: "Контрастная окантовка",
  edge_visibility: "full",
  background_match_risk: "low",
  suitability: "allowlist",
  quarantine_reasons: [],
  bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  boundary: null,
  exclusion_polygons: null,
  mask: null,
  annotator_id: "ann-1",
  annotated_at: "2026-08-24T12:00:00.000Z",
  notes: "",
};

test("validates a complete manual allowlist annotation", () => {
  assert.equal(
    validateAnnotation(base, {
      manifestIds: new Set(["001"]),
      ownerIds: new Set(),
    }).valid,
    true,
  );
});

test("fails closed on incomplete or contradictory annotations", () => {
  const invalid = validateAnnotation(
    {
      ...base,
      category: "unknown",
      bbox: null,
      suitability: "quarantine",
      quarantine_reasons: [],
    },
    { manifestIds: new Set(["001"]), ownerIds: new Set() },
  );
  assert.deepEqual(
    invalid.errors.sort(),
    ["quarantine_reason_required"].sort(),
  );
  const allowInvalid = validateAnnotation(
    { ...base, category: "unknown", bbox: null },
    { manifestIds: new Set(["001"]), ownerIds: new Set() },
  );
  assert.ok(allowInvalid.errors.includes("allowlist_category_unknown"));
  assert.ok(allowInvalid.errors.includes("allowlist_bbox_required"));
});

test("detects allowlist quarantine overlap", () => {
  assert.deepEqual(
    importedDisposition(["001", "002"], { ids: ["002", "003"] }).overlap,
    ["002"],
  );
});

test("coverage excludes owner-provided from headline and never declares 8/10", () => {
  const owner = { ...base, id: "owner.png", source_scope: "owner-provided" };
  const report = coverageReport({
    manifest: [{ id: "001" }],
    ownerManifest: { files: [{ file: "owner.png" }] },
    annotations: [base, owner],
  });
  assert.equal(report.status, "READY_FOR_INDEPENDENT_REGATE");
  assert.equal(report.headline.valid_annotated, 1);
  assert.equal(report.owner_provided_excluded_from_headline.valid_annotated, 1);
  assert.doesNotMatch(JSON.stringify(report), /8\/10 result achieved/i);
});
