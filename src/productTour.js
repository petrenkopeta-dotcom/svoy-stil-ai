export const PRODUCT_TOUR_KEY = "ai-stylist:product-tour:v1";

export function shouldShowProductTour(storage = globalThis.localStorage) {
  try { return storage?.getItem(PRODUCT_TOUR_KEY) !== "done"; } catch { return true; }
}

export function completeProductTour(storage = globalThis.localStorage) {
  try { storage?.setItem(PRODUCT_TOUR_KEY, "done"); } catch {}
}

export function navigationDecision({ destination, localPilot, onboardingComplete, hasFirstResult }) {
  if (destination === "test") {
    if (!onboardingComplete) return { type: "screen", screen: "test" };
    return { type: "screen", screen: "look" };
  }
  if (destination === "wardrobe" && localPilot) return { type: "screen", screen: "wardrobe" };
  return { type: "auth", action: destination === "history" ? "history" : "wardrobe", screen: destination };
}
