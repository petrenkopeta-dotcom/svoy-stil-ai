const CATEGORY = Object.freeze({
  "верх": "top", "низ": "bottom", "платье": "dress", "юбка": "bottom",
  "обувь": "shoes", "верхний слой": "outerwear", "аксессуар": "accessory",
});

export function capsuleGarments(items, mode, ownerScope) {
  return items.filter((item) => (mode === "demo" ? item.source === "demo" : item.source === "personal")).map((item) => {
    const explicitlyConfirmed = mode === "demo" || item.confirmed === true;
    return ({
    id: String(item.id), category: CATEGORY[String(item.type || "").toLowerCase()] || "unknown",
    mode, ownerScope, status: explicitlyConfirmed ? "ready" : "unready", confirmed: explicitlyConfirmed, occasions: [],
    colors: item.color ? [{ name: item.color }] : [], fit: "unknown", name: item.name, image: item.photo || "",
  }); });
}

export function makeCapsuleRequest({ items, mode, ownerScope, occasion = "work" }) {
  const wardrobe = capsuleGarments(items, mode, ownerScope);
  return {
    schemaVersion: "capsule-request/0.1", requestId: `local-${mode}-capsule-v1`, mode, ownerScope,
    itemTarget: Math.min(12, Math.max(8, wardrobe.length)), wardrobe,
    anchors: wardrobe.length ? [{ itemId: wardrobe[0].id, required: true, minimumOutfitUses: 1 }] : [],
    scenarios: [{ scenarioId: "primary", occasion, importance: "core", requiredLooks: 2, weather: {} }],
  };
}
