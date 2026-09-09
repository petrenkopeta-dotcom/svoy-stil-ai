export const CAPSULE_SCHEMA_VERSION = "capsule-result/0.1";
export const CAPSULE_ENGINE_VERSION = "capsule-engine/0.1";

export const CAPSULE_CATEGORIES = Object.freeze([
  "top", "bottom", "dress", "one_piece", "outerwear", "shoes", "accessory",
]);

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === "string" ? value.trim() : "";

export function garmentId(item) {
  return text(item?.garment_id ?? item?.id);
}

export function garmentCategory(item) {
  const value = text(item?.category).toLowerCase();
  return CAPSULE_CATEGORIES.includes(value) ? value : "unknown";
}

export function garmentScope(item) {
  return {
    mode: text(item?.mode ?? item?.dataMode),
    ownerScope: text(item?.ownerScope ?? item?.owner_scope),
  };
}

export function canonicalSignature(itemIds) {
  return [...new Set(asArray(itemIds).map(String))].sort().join("|");
}

export function validateCapsuleRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return ["invalid_request"];
  if (request.schemaVersion != null && request.schemaVersion !== "capsule-request/0.1") return ["unsupported_schema_version"];
  if (!Number.isInteger(request.itemTarget) || request.itemTarget < 8 || request.itemTarget > 12) return ["invalid_item_target"];
  if (!text(request.requestId) || !["demo", "personal"].includes(request.mode) || !text(request.ownerScope)) return ["invalid_request"];
  if (!Array.isArray(request.wardrobe) || !Array.isArray(request.anchors) || !request.anchors.length || !Array.isArray(request.scenarios) || !request.scenarios.length) return ["invalid_request"];
  const scenarioIds = request.scenarios.map((scenario) => text(scenario?.scenarioId));
  const anchorIds = request.anchors.map((anchor) => text(anchor?.itemId));
  if (scenarioIds.some((id) => !id) || new Set(scenarioIds).size !== scenarioIds.length) return ["invalid_request"];
  if (anchorIds.some((id) => !id) || new Set(anchorIds).size !== anchorIds.length) return ["invalid_request"];
  if (request.scenarios.some((scenario) => !["core", "support"].includes(scenario.importance) || !Number.isInteger(scenario.requiredLooks) || scenario.requiredLooks < 1)) return ["invalid_request"];
  if (request.anchors.some((anchor) => anchor.required !== true || !Number.isInteger(anchor.minimumOutfitUses) || anchor.minimumOutfitUses < 1 || anchor.minimumOutfitUses > request.scenarios.length)) return ["invalid_request"];
  return [];
}

export function emptyCapsuleResult(request, reasons) {
  return {
    schemaVersion: CAPSULE_SCHEMA_VERSION,
    engineVersion: CAPSULE_ENGINE_VERSION,
    requestId: text(request?.requestId),
    mode: ["demo", "personal"].includes(request?.mode) ? request.mode : "personal",
    status: "hold",
    itemIds: [], looks: [], coverage: [], anchorCoverage: [],
    strengths: [], tradeoffs: [], missingPieces: [],
    noResultReasons: [...new Set(reasons)].sort(),
  };
}
