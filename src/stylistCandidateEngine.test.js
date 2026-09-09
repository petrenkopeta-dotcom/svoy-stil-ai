import test from "node:test";
import assert from "node:assert/strict";
import { generateAndRankCandidates, CANDIDATE_ENGINE_VERSION } from "./stylistCandidateEngine.js";
import { createGarmentStyleFeatures, createStylistRequest } from "./stylistReasoningSchemas.js";

const item = (id, category, overrides = {}) => ({ id, status: "ready", display_name: id, category, colors: [{ name: "black", hex: "#000000", share: 1 }], style_tags: ["minimal"], seasons: ["all_season"], occasions: ["work"], formality: 3, warmth: 3, silhouette: "straight", ...overrides });
const wardrobe = [item("t1", "top"), item("t2", "top", { style_tags: ["casual"] }), item("b1", "bottom"), item("b2", "bottom", { silhouette: "wide" }), item("s1", "shoes"), item("s2", "shoes"), item("a1", "accessory")];

test("stable sorting is independent of wardrobe input order", () => {
  const request = { occasion: "work", limit: 20, preferences: { styleTags: ["minimal"] } };
  const a = generateAndRankCandidates(wardrobe, request).candidates.map((x) => x.signature);
  const b = generateAndRankCandidates([...wardrobe].reverse(), request).candidates.map((x) => x.signature);
  assert.deepEqual(a, b);
});

test("anchor invariant holds for every candidate", () => {
  const result = generateAndRankCandidates(wardrobe, { anchorId: "b2", limit: 20 });
  assert.ok(result.candidates.length > 1);
  assert.ok(result.candidates.every((candidate) => candidate.itemIds.includes("b2")));
});

test("hard constraints exclude unavailable and structurally invalid combinations", () => {
  const result = generateAndRankCandidates([...wardrobe, item("bad", "top", { status: "archived" })], { excludedItemIds: ["s2"] });
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => !candidate.itemIds.includes("bad") && !candidate.itemIds.includes("s2")));
  assert.ok(result.candidates.every((candidate) => candidate.itemIds.includes("t1") || candidate.itemIds.includes("t2")));
});

test("returns stable no-candidate reason codes", () => {
  assert.deepEqual(generateAndRankCandidates([item("t", "top")]).noCandidateReasons, ["missing_shoes", "missing_outfit_base"]);
  assert.deepEqual(generateAndRankCandidates(wardrobe, { anchorId: "absent" }).noCandidateReasons, ["anchor_not_found"]);
});

test("public candidates contain no numeric score and expose versioned explanations", () => {
  const candidate = generateAndRankCandidates(wardrobe, { weightProfile: "comfort-first-v1" }).candidates[0];
  assert.equal(candidate.generatorVersion, CANDIDATE_ENGINE_VERSION);
  assert.equal(candidate.weightProfile, "comfort-first-v1");
  assert.equal("score" in candidate, false);
  assert.ok(Object.values(candidate.scoreBreakdown).every((value) => typeof value === "string"));
  assert.ok(!JSON.stringify(candidate).match(/"total"|"scores"/));
});

test("diversity introduces alternatives before near duplicates", () => {
  const candidates = generateAndRankCandidates(wardrobe, { limit: 6 }).candidates;
  assert.ok(new Set(candidates.slice(0, 4).flatMap((x) => x.itemIds.filter((id) => id.startsWith("t")))).size > 1);
  assert.ok(new Set(candidates.slice(0, 4).flatMap((x) => x.itemIds.filter((id) => id.startsWith("b")))).size > 1);
});

test("generation p95 stays within the stage performance budget", () => {
  const large = [];
  for (const category of ["top", "bottom", "shoes", "outerwear", "accessory"]) for (let i = 0; i < 12; i += 1) large.push(item(`${category}-${i}`, category));
  const measure = () => {
    const started = process.cpuUsage();
    const result = generateAndRankCandidates(large, { limit: 30 });
    const usage = process.cpuUsage(started);
    return { elapsedMs: (usage.user + usage.system) / 1000, signatures: result.candidates.map((candidate) => candidate.signature) };
  };

  // Warm JIT and measure consumed CPU rather than scheduler delay. A single
  // cold wall-clock observation was the source of the 1547ms flake.
  measure();
  const samples = Array.from({ length: 15 }, measure);
  const expected = samples[0].signatures;
  assert.equal(expected.length, 30);
  for (const sample of samples) assert.deepEqual(sample.signatures, expected, "benchmark runs must not change selection");

  const elapsed = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
  const percentile = (value) => elapsed[Math.ceil(value * elapsed.length) - 1];
  const p50 = percentile(0.5);
  const p95 = percentile(0.95);
  assert.ok(p95 < 1500, `expected p95 <1500ms; p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms samples=${elapsed.map((ms) => ms.toFixed(1)).join(",")}`);
});

test("consumes stage-1 contracts and emits a CandidateOutfit contract", () => {
  const features = [
    createGarmentStyleFeatures({ garment_id: "ct", category: "top" }),
    createGarmentStyleFeatures({ garment_id: "cb", category: "bottom" }),
    createGarmentStyleFeatures({ garment_id: "cs", category: "shoes" }),
  ];
  const request = createStylistRequest({ request_id: "request-1", garment_ids: ["ct", "cb", "cs"], anchor_garment_id: "ct" });
  const result = generateAndRankCandidates(features, request);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].candidate.kind, "CandidateOutfit");
  assert.equal(result.candidates[0].candidate.request_id, "request-1");
  assert.ok(result.candidates[0].candidate.garment_ids.includes("ct"));
});
