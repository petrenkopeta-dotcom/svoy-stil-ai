import { itemKind } from "./outfitEngine.js";

export const ACTIVATION_SLOTS = [
  { id: "top", label: "Верх или платье", accepts: ["top", "dress"], defaultType: "Верх" },
  { id: "bottom", label: "Низ", accepts: ["bottom"], defaultType: "Низ" },
  { id: "shoes", label: "Обувь", accepts: ["shoes"], defaultType: "Обувь" },
];

export function activationProgress(items = []) {
  const kinds = new Set(items.map(itemKind));
  const slots = ACTIVATION_SLOTS.map((slot) => ({
    ...slot,
    complete: slot.accepts.some((kind) => kinds.has(kind)),
  }));
  const completed = slots.filter((slot) => slot.complete).length;
  return { slots, completed, total: slots.length, ready: completed === slots.length };
}

export function answersComplete(answers = {}) {
  return ["goal", "style", "mood"].every((key) => Boolean(answers[key]?.trim()));
}
