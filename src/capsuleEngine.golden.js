const garment = (id, category, mode = "personal", ownerScope = "owner-a", overrides = {}) => ({
  id, category, mode, ownerScope, status: "ready", confirmed: true,
  occasions: ["work"], colors: [{ name: "black" }], fit: "straight", ...overrides,
});

export function goldenWardrobe(mode = "personal", ownerScope = "owner-a") {
  return [
    garment("top-1", "top", mode, ownerScope), garment("top-2", "top", mode, ownerScope),
    garment("bottom-1", "bottom", mode, ownerScope), garment("bottom-2", "bottom", mode, ownerScope),
    garment("shoes-1", "shoes", mode, ownerScope, { waterproof: true }), garment("shoes-2", "shoes", mode, ownerScope, { waterproof: true }),
    garment("outer-1", "outerwear", mode, ownerScope), garment("accessory-1", "accessory", mode, ownerScope),
    garment("dress-1", "dress", mode, ownerScope), garment("dress-2", "dress", mode, ownerScope),
    garment("one-piece-1", "one_piece", mode, ownerScope), garment("accessory-2", "accessory", mode, ownerScope),
  ];
}

const core = (overrides = {}) => ({ scenarioId: "work", occasion: "work", importance: "core", requiredLooks: 2, weather: {}, ...overrides });

export function materializeGoldenCase(definition) {
  const mode = definition.mode ?? "personal";
  const ownerScope = mode === "demo" ? "demo-session" : "owner-a";
  let wardrobe = goldenWardrobe(mode, ownerScope);
  let itemTarget = definition.target ?? 8;
  let anchors = [{ itemId: "top-1", required: true, minimumOutfitUses: 1 }];
  let scenarios = [core()];
  let constraints;

  switch (definition.variant) {
    case "unknown": wardrobe = wardrobe.map((item) => ({ ...item, occasions: [], colors: [], fit: "unknown" })); break;
    case "mixed_mode": wardrobe[1] = { ...wardrobe[1], mode: mode === "demo" ? "personal" : "demo" }; break;
    case "cross_owner": wardrobe[1] = { ...wardrobe[1], ownerScope: "owner-b" }; break;
    case "missing_anchor": anchors = [{ itemId: "absent", required: true, minimumOutfitUses: 1 }]; break;
    case "excluded_anchor": constraints = { excludedItemIds: ["top-1"] }; break;
    case "unready_anchor": wardrobe[0] = { ...wardrobe[0], status: "draft" }; break;
    case "unconfirmed_anchor": wardrobe[0] = { ...wardrobe[0], confirmed: false }; break;
    case "small": wardrobe = wardrobe.slice(0, 7); break;
    case "rain_ready": scenarios = [core({ scenarioId: "rain", requiredLooks: 1, weather: { precipitation: "rain", waterproofShoesRequired: true } })]; break;
    case "rain_hold":
      wardrobe = wardrobe.map((item) => item.category === "shoes" ? { ...item, waterproof: false } : item);
      scenarios = [core({ scenarioId: "rain", requiredLooks: 1, weather: { precipitation: "rain", waterproofShoesRequired: true } })];
      break;
    case "outerwear": scenarios = [core({ scenarioId: "cold", requiredLooks: 1, weather: { temperatureBand: "cold", outerwearRequired: true } })]; break;
    case "missing_outerwear":
      wardrobe = wardrobe.filter((item) => item.category !== "outerwear");
      scenarios = [core({ scenarioId: "cold", requiredLooks: 1, weather: { temperatureBand: "cold", outerwearRequired: true } })];
      break;
    case "dress_path":
      wardrobe = goldenWardrobe(mode, ownerScope).filter((item) => ["dress", "one_piece", "shoes", "accessory", "outerwear"].includes(item.category));
      anchors = [{ itemId: "dress-1", required: true, minimumOutfitUses: 1 }];
      itemTarget = 8;
      break;
    case "separates_path": wardrobe = wardrobe.filter((item) => !["dress", "one_piece"].includes(item.category)); break;
    case "support_partial": scenarios = [core({ requiredLooks: 1 }), core({ scenarioId: "travel", occasion: "travel", importance: "support", requiredLooks: 1 })]; break;
    case "multi_scenario": scenarios = [core({ requiredLooks: 1 }), core({ scenarioId: "work-rain", requiredLooks: 1, weather: { precipitation: "rain", waterproofShoesRequired: true } })]; break;
    case "recent": constraints = { recentOutfitSignatures: ["bottom-1|shoes-1|top-1"] }; break;
    case "max_accessories": constraints = { maxAccessories: 0 }; break;
    case "duplicate_item": wardrobe[1] = { ...wardrobe[1], id: "top-1" }; break;
    case "duplicate_scenario": scenarios = [core(), core()]; break;
    case "unsupported_schema": break;
    default: break;
  }

  return {
    schemaVersion: definition.variant === "unsupported_schema" ? "capsule-request/9" : "capsule-request/0.1",
    requestId: `golden-${definition.id}`, mode, ownerScope, itemTarget, wardrobe, anchors, scenarios, constraints,
  };
}

// Authored contract corpus. Expected fields are intentionally compact and stable;
// complete DTO snapshots are checked through the closed validator and repeat tests.
export const CAPSULE_GOLDEN_CASES = Object.freeze([
  { id: "ready-8", target: 8, status: "ready" },
  { id: "ready-9", target: 9, status: "ready" },
  { id: "ready-10", target: 10, status: "ready" },
  { id: "ready-11", target: 11, status: "ready" },
  { id: "ready-12", target: 12, status: "ready" },
  { id: "demo-8", mode: "demo", target: 8, status: "ready" },
  { id: "demo-10", mode: "demo", target: 10, status: "ready" },
  { id: "demo-12", mode: "demo", target: 12, status: "ready" },
  { id: "unknown-8", variant: "unknown", target: 8, status: "ready", tradeoff: "occasion_data_insufficient" },
  { id: "unknown-10", variant: "unknown", target: 10, status: "ready", tradeoff: "color_data_insufficient" },
  { id: "unknown-12", variant: "unknown", target: 12, status: "ready", tradeoff: "silhouette_data_insufficient" },
  { id: "mixed-personal", variant: "mixed_mode", status: "hold", reason: "demo_personal_mix_forbidden" },
  { id: "mixed-demo", variant: "mixed_mode", mode: "demo", status: "hold", reason: "demo_personal_mix_forbidden" },
  { id: "cross-owner-personal", variant: "cross_owner", status: "hold", reason: "scope_mismatch" },
  { id: "cross-owner-demo", variant: "cross_owner", mode: "demo", status: "hold", reason: "scope_mismatch" },
  { id: "target-7", target: 7, status: "hold", reason: "invalid_item_target" },
  { id: "target-13", target: 13, status: "hold", reason: "invalid_item_target" },
  { id: "target-zero", target: 0, status: "hold", reason: "invalid_item_target" },
  { id: "small-wardrobe", variant: "small", status: "hold", reason: "target_size_insufficient" },
  { id: "anchor-missing", variant: "missing_anchor", status: "hold", reason: "anchor_not_found" },
  { id: "anchor-excluded", variant: "excluded_anchor", status: "hold", reason: "anchor_excluded" },
  { id: "anchor-unready", variant: "unready_anchor", status: "hold", reason: "anchor_not_ready" },
  { id: "anchor-unconfirmed", variant: "unconfirmed_anchor", status: "hold", reason: "anchor_not_ready" },
  { id: "rain-ready", variant: "rain_ready", status: "ready" },
  { id: "rain-hold", variant: "rain_hold", status: "hold", reason: "core_scenario_uncovered", missing: "shoes" },
  { id: "outerwear-ready", variant: "outerwear", status: "ready" },
  { id: "outerwear-missing", variant: "missing_outerwear", status: "hold", reason: "core_scenario_uncovered", missing: "outerwear" },
  { id: "dress-path", variant: "dress_path", status: "ready" },
  { id: "separates-path", variant: "separates_path", status: "ready" },
  { id: "support-partial", variant: "support_partial", status: "partial", reason: "support_scenario_partial" },
  { id: "multi-scenario", variant: "multi_scenario", status: "ready" },
  { id: "recent-signature", variant: "recent", status: "ready" },
  { id: "no-accessories", variant: "max_accessories", status: "ready" },
  { id: "duplicate-item", variant: "duplicate_item", status: "hold", reason: "invalid_request" },
  { id: "duplicate-scenario", variant: "duplicate_scenario", status: "hold", reason: "invalid_request" },
  { id: "unsupported-schema", variant: "unsupported_schema", status: "hold", reason: "unsupported_schema_version" },
]);
