const confirmed = (value, referenceId) => ({ value, confirmed: true, provenance: { kind: "user_confirmation", referenceId } });
const unconfirmed = (value) => ({ value, confirmed: false, provenance: { kind: "suggestion" } });

export const completeGarmentsFixture = Object.freeze([
  { id: "top-1", category: "top", stylist_features: { revision: 3, colors: confirmed([{ name: "navy", role: "dominant" }], "top-color"), fit: confirmed("oversized", "top-fit"), volume: confirmed("oversized", "top-volume"), length: confirmed("midi", "top-length"), formality: confirmed(4, "top-formality"), seasons: confirmed(["autumn", "winter"], "top-seasons"), warmth: confirmed(4, "top-warmth"), texture: confirmed("structured", "top-texture") } },
  { id: "bottom-1", category: "bottom", stylist_features: { colors: confirmed([{ name: "red", role: "accent" }], "bottom-color"), volume: confirmed("oversized", "bottom-volume"), length: confirmed("maxi", "bottom-length"), formality: confirmed(3, "bottom-formality"), seasons: confirmed(["all_season"], "bottom-seasons"), warmth: confirmed(3, "bottom-warmth"), texture: confirmed("smooth", "bottom-texture") } },
]);

export const partialGarmentsFixture = Object.freeze([
  { id: "partial", category: "top", stylist_features: { colors: confirmed([{ name: "blue" }], "partial-color"), volume: unconfirmed("oversized"), length: confirmed("unknown", "partial-length"), warmth: confirmed(9, "partial-warmth") } },
]);

export const legacyGarmentsFixture = Object.freeze([{ id: "legacy", category: "top", color: "blue", silhouette: "oversized", formality: 4 }]);

export const invalidGarmentsFixture = Object.freeze([
  { id: "invalid", category: "top", stylist_features: { colors: confirmed("blue", "bad-color"), fit: confirmed("impossible", "bad-fit"), volume: confirmed("huge", "bad-volume"), length: confirmed("floor", "bad-length"), formality: confirmed("formal", "bad-formality"), seasons: confirmed(["monsoon"], "bad-seasons"), warmth: confirmed(NaN, "bad-warmth"), texture: confirmed("metal", "bad-texture") } },
]);
