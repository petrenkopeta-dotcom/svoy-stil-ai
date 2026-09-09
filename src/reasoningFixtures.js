export const unknownReasoningFixture = Object.freeze({});

export const officeWalkFixture = Object.freeze({
  context: { confirmed: true, occasion: "office", minFormality: 4, temperatureC: 8, walkingMinutes: 45, activity: "active" },
  outfit: { confirmed: true, formality: 2, minTemperatureC: 12, maxTemperatureC: 24, excludedOccasions: [], mobility: "restricted" },
  shoes: { confirmed: true, walkingComfort: "low", standingComfort: "high" },
});

export const layeredSilhouetteFixture = Object.freeze({
  top: { confirmed: true, volume: "oversized", length: "midi" },
  bottom: { confirmed: true, volume: "oversized", length: "maxi", waistline: "low" },
  outer: { confirmed: true, length: "short" },
  preference: { confirmed: true, waistline: "high", required: false },
});
