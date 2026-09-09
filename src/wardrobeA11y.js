export const WARDROBE_TABS = ["personal", "demo"];

export function nextTabForKey(current, key) {
  const index = WARDROBE_TABS.indexOf(current);
  if (key === "Home") return WARDROBE_TABS[0];
  if (key === "End") return WARDROBE_TABS.at(-1);
  if (key === "ArrowRight" || key === "ArrowDown") {
    return WARDROBE_TABS[(index + 1) % WARDROBE_TABS.length];
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return WARDROBE_TABS[(index - 1 + WARDROBE_TABS.length) % WARDROBE_TABS.length];
  }
  return null;
}
