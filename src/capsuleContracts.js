import { CAPSULE_CATEGORIES, CAPSULE_ENGINE_VERSION, CAPSULE_SCHEMA_VERSION, canonicalSignature } from "./capsuleDomain.js";

const RESULT_KEYS = ["schemaVersion", "engineVersion", "requestId", "mode", "status", "itemIds", "looks", "coverage", "anchorCoverage", "strengths", "tradeoffs", "missingPieces", "noResultReasons"];
const TRACE_KEYS = ["engineVersion", "poolLimit", "poolTruncated", "poolSizes", "selectedSignatures", "ruleFacts"];
const LOOK_KEYS = ["scenarioId", "itemIds", "rankingLevel", "reasonCodes"];
const COVERAGE_KEYS = ["scenarioId", "requiredLooks", "availableLooks", "state"];
const ANCHOR_KEYS = ["itemId", "requiredUses", "actualUses", "state"];
const MISSING_KEYS = ["slot", "requirement", "unlocks", "reasonCodes"];
const UNLOCK_KEYS = ["scenarioId", "additionalLooks"];
const RULE_FACT_KEYS = ["code", "outcome"];
const REQUIREMENT_KEYS = ["occasion", "temperatureBand", "precipitation", "colorRole", "silhouetteRole"];

export const CAPSULE_REASON_CODES = Object.freeze([
  "invalid_request", "unsupported_schema_version", "invalid_item_target", "scope_mismatch", "demo_personal_mix_forbidden",
  "anchor_not_found", "anchor_not_ready", "anchor_excluded", "anchor_coverage_impossible", "anchors_incompatible_for_required_coverage",
  "missing_shoes", "missing_outfit_base", "missing_required_outerwear", "core_scenario_uncovered", "support_scenario_partial",
  "occasion_data_insufficient", "weather_not_evaluated", "color_data_insufficient", "silhouette_data_insufficient",
  "target_size_insufficient", "target_size_exceeded_by_requirements", "candidate_pool_truncated", "only_low_quality_candidates",
  "recent_repeat_avoided", "diversity_limited_by_wardrobe",
]);

const enums = Object.freeze({
  mode: ["demo", "personal"], status: ["ready", "partial", "hold"],
  rankingLevel: ["excellent", "good", "needs_change"],
  coverageState: ["covered", "partial", "uncovered", "not_evaluated"],
  anchorState: ["covered", "partial", "uncovered"], traceOutcome: ["pass", "fail", "not_evaluated", "insufficient_data"],
});

export const CAPSULE_RESULT_SCHEMA = Object.freeze({
  $id: CAPSULE_SCHEMA_VERSION, type: "object", additionalProperties: false, required: RESULT_KEYS,
  properties: {
    schemaVersion: { const: CAPSULE_SCHEMA_VERSION }, engineVersion: { const: CAPSULE_ENGINE_VERSION },
    requestId: { type: "string", minLength: 1 }, mode: { enum: enums.mode }, status: { enum: enums.status },
    itemIds: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
    looks: { type: "array" }, coverage: { type: "array" }, anchorCoverage: { type: "array" },
    strengths: { type: "array", items: { type: "string" } }, tradeoffs: { type: "array", items: { type: "string" } },
    missingPieces: { type: "array", maxItems: 3 }, noResultReasons: { type: "array", items: { type: "string" } },
  },
});

export const CAPSULE_TRACE_SCHEMA = Object.freeze({
  $id: "capsule-trace/0.1", type: "object", additionalProperties: false, required: TRACE_KEYS,
  description: "Internal-only evidence boundary. It is not a public DTO or telemetry payload.",
});

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key)) && allowed.every((key) => key in value);
const allowedKeys = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const strings = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
const integer = (value, min = 0) => Number.isInteger(value) && value >= min;
const uniqueStrings = (value) => strings(value) && new Set(value).size === value.length;
const push = (errors, condition, path, message) => { if (!condition) errors.push({ path, message }); };

function validateResult(result) {
  const errors = [];
  push(errors, exactKeys(result, RESULT_KEYS), "$", "must be a closed CapsuleResult object");
  if (!object(result)) return errors;
  push(errors, result.schemaVersion === CAPSULE_SCHEMA_VERSION, "$.schemaVersion", "unsupported version");
  push(errors, result.engineVersion === CAPSULE_ENGINE_VERSION, "$.engineVersion", "unsupported engine");
  push(errors, typeof result.requestId === "string" && result.requestId.length > 0, "$.requestId", "must be non-empty");
  push(errors, enums.mode.includes(result.mode), "$.mode", "unsupported mode");
  push(errors, enums.status.includes(result.status), "$.status", "unsupported status");
  push(errors, uniqueStrings(result.itemIds), "$.itemIds", "must contain unique string IDs");
  if (result.status === "hold") push(errors, result.itemIds?.length === 0 && result.looks?.length === 0, "$", "hold must not expose a ready capsule");
  else push(errors, result.itemIds?.length >= 8 && result.itemIds?.length <= 12, "$.itemIds", "ready/partial requires 8–12 items");
  push(errors, Array.isArray(result.looks), "$.looks", "must be an array");
  for (const [index, look] of (result.looks ?? []).entries()) {
    push(errors, exactKeys(look, LOOK_KEYS), `$.looks[${index}]`, "must be closed");
    push(errors, typeof look?.scenarioId === "string" && look.scenarioId.length > 0, `$.looks[${index}].scenarioId`, "must be non-empty");
    push(errors, uniqueStrings(look?.itemIds), `$.looks[${index}].itemIds`, "must contain unique IDs");
    push(errors, enums.rankingLevel.includes(look?.rankingLevel), `$.looks[${index}].rankingLevel`, "unsupported level");
    push(errors, strings(look?.reasonCodes) && look.reasonCodes.every((code) => CAPSULE_REASON_CODES.includes(code)), `$.looks[${index}].reasonCodes`, "must contain allowlisted reason codes");
    push(errors, look?.itemIds?.every((id) => result.itemIds.includes(id)), `$.looks[${index}].itemIds`, "must be within capsule items");
  }
  push(errors, new Set((result.looks ?? []).map((look) => canonicalSignature(look.itemIds))).size === (result.looks ?? []).length, "$.looks", "signatures must be unique");
  push(errors, Array.isArray(result.coverage), "$.coverage", "must be an array");
  for (const [index, entry] of (result.coverage ?? []).entries()) {
    push(errors, exactKeys(entry, COVERAGE_KEYS), `$.coverage[${index}]`, "must be closed");
    push(errors, typeof entry?.scenarioId === "string" && entry.scenarioId.length > 0, `$.coverage[${index}].scenarioId`, "must be non-empty");
    push(errors, integer(entry?.requiredLooks, 1) && integer(entry?.availableLooks), `$.coverage[${index}]`, "look counts must be integers");
    push(errors, enums.coverageState.includes(entry?.state), `$.coverage[${index}].state`, "unsupported state");
  }
  push(errors, Array.isArray(result.anchorCoverage), "$.anchorCoverage", "must be an array");
  for (const [index, entry] of (result.anchorCoverage ?? []).entries()) {
    push(errors, exactKeys(entry, ANCHOR_KEYS), `$.anchorCoverage[${index}]`, "must be closed");
    push(errors, typeof entry?.itemId === "string" && entry.itemId.length > 0, `$.anchorCoverage[${index}].itemId`, "must be non-empty");
    push(errors, integer(entry?.requiredUses, 1) && integer(entry?.actualUses), `$.anchorCoverage[${index}]`, "use counts must be integers");
    push(errors, enums.anchorState.includes(entry?.state), `$.anchorCoverage[${index}].state`, "unsupported state");
  }
  push(errors, strings(result.strengths) && result.strengths.every((key) => key === "capsule_core_coverage_complete"), "$.strengths", "must contain allowlisted message keys");
  for (const key of ["tradeoffs", "noResultReasons"]) push(errors, strings(result[key]) && result[key].every((code) => CAPSULE_REASON_CODES.includes(code)), `$.${key}`, "must contain allowlisted reason codes");
  push(errors, Array.isArray(result.missingPieces) && result.missingPieces.length <= 3, "$.missingPieces", "must be bounded to three");
  for (const [index, entry] of (result.missingPieces ?? []).entries()) {
    push(errors, exactKeys(entry, MISSING_KEYS), `$.missingPieces[${index}]`, "must be closed");
    push(errors, CAPSULE_CATEGORIES.includes(entry?.slot), `$.missingPieces[${index}].slot`, "unsupported slot");
    push(errors, allowedKeys(entry?.requirement, REQUIREMENT_KEYS), `$.missingPieces[${index}].requirement`, "must be a closed requirement object");
    push(errors, Array.isArray(entry?.unlocks) && entry.unlocks.length > 0, `$.missingPieces[${index}].unlocks`, "must have positive evidence");
    for (const [unlockIndex, unlock] of (entry?.unlocks ?? []).entries()) {
      push(errors, exactKeys(unlock, UNLOCK_KEYS), `$.missingPieces[${index}].unlocks[${unlockIndex}]`, "must be closed");
      push(errors, typeof unlock?.scenarioId === "string" && integer(unlock?.additionalLooks, 1), `$.missingPieces[${index}].unlocks[${unlockIndex}]`, "must have positive integer delta");
    }
    push(errors, strings(entry?.reasonCodes) && entry.reasonCodes.every((code) => CAPSULE_REASON_CODES.includes(code)), `$.missingPieces[${index}].reasonCodes`, "must contain allowlisted reason codes");
  }
  push(errors, !/(?:score|utility|weight|percent)/i.test(Object.keys(result).join(" ")), "$", "numeric ranking fields are forbidden");
  return errors;
}

function validateTrace(trace) {
  const errors = [];
  push(errors, exactKeys(trace, TRACE_KEYS), "$trace", "must be a closed CapsuleTrace object");
  if (!object(trace)) return errors;
  push(errors, trace.engineVersion === CAPSULE_ENGINE_VERSION, "$trace.engineVersion", "unsupported engine");
  push(errors, integer(trace.poolLimit, 1), "$trace.poolLimit", "must be a positive integer");
  push(errors, typeof trace.poolTruncated === "boolean", "$trace.poolTruncated", "must be boolean");
  push(errors, object(trace.poolSizes) && Object.values(trace.poolSizes).every((value) => integer(value)), "$trace.poolSizes", "must contain integer counts");
  push(errors, strings(trace.selectedSignatures), "$trace.selectedSignatures", "must contain signatures");
  push(errors, Array.isArray(trace.ruleFacts), "$trace.ruleFacts", "must be an array");
  for (const [index, fact] of (trace.ruleFacts ?? []).entries()) {
    push(errors, exactKeys(fact, RULE_FACT_KEYS), `$trace.ruleFacts[${index}]`, "must be closed");
    push(errors, CAPSULE_REASON_CODES.includes(fact?.code) && enums.traceOutcome.includes(fact?.outcome), `$trace.ruleFacts[${index}]`, "invalid fact");
  }
  const serialized = JSON.stringify(trace);
  push(errors, !/(ownerScope|owner_scope|email|city|gps|latitude|longitude|filename|image|wardrobe)/i.test(serialized), "$trace", "contains forbidden identity/location/image data");
  return errors;
}

export function validateCapsuleOutput(output) {
  const resultErrors = validateResult(output?.result);
  const traceErrors = validateTrace(output?.trace);
  return { valid: resultErrors.length === 0 && traceErrors.length === 0, resultErrors, traceErrors };
}

export function assertCapsuleOutput(output) {
  const validation = validateCapsuleOutput(output);
  if (!validation.valid) throw new TypeError(`Invalid capsule output: ${JSON.stringify(validation)}`);
  return output;
}
