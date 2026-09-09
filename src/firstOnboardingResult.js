export const FIRST_RESULT_SCREEN = "first-demo-look";
export const FIRST_RESULT_ACTIONS = Object.freeze({
  ADD_FIRST_ITEM: "add-first-item",
  PHOTO_IN_STORE: "photo-in-store",
  OPEN_DEMO_WARDROBE: "open-demo-wardrobe",
});

const text = (value) => String(value ?? "").trim();
const clone = (value) => structuredClone(value);

const SUMMARY_FIELDS = Object.freeze([
  { key: "occasion", fallbacks: ["goal"], label: "Ситуация" },
  { key: "fit", fallbacks: [], label: "Посадка" },
  { key: "colorComparison", fallbacks: ["color"], label: "Сочетание цветов" },
]);

function readAnswer(preferences, field) {
  for (const key of [field.key, ...field.fallbacks]) {
    if (text(preferences?.[key])) return text(preferences[key]);
  }
  throw new TypeError(`onboarding answer is required: ${field.key}`);
}

function demoItem(item) {
  if (!text(item?.id)) throw new TypeError("demo outfit item id is required");
  return {
    id: text(item.id),
    name: text(item.name || item.display_name) || "Вещь",
    category: text(item.category || item.type) || "unknown",
    source: "demo",
  };
}

/** Builds the only valid product state immediately after the three-step onboarding. */
export function createFirstOnboardingResult({ preferences, outfit, explanation = "", decisionLinks = [], limitations = [] } = {}) {
  const items = (outfit?.items || outfit?.wardrobe || []).map(demoItem);
  if (!text(outfit?.id)) throw new TypeError("demo outfit id is required");
  if (items.length === 0) throw new TypeError("demo outfit must contain items");

  return {
    screen: FIRST_RESULT_SCREEN,
    summary: SUMMARY_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      value: readAnswer(preferences, field),
    })),
    outfit: {
      id: text(outfit.id),
      kind: "demo",
      source: "demo",
      label: "Демо-образ",
      items,
      explanation: text(explanation),
      decisionLinks: decisionLinks.slice(0, 3).map((link) => ({ answer: text(link.answer), decision: text(link.decision) })).filter((link) => link.answer && link.decision),
      limitations: limitations.map(text).filter(Boolean),
    },
    actions: [
      { id: FIRST_RESULT_ACTIONS.ADD_FIRST_ITEM, label: "Добавить первую вещь" },
      { id: FIRST_RESULT_ACTIONS.PHOTO_IN_STORE, label: "Сфотографировать в магазине" },
      { id: FIRST_RESULT_ACTIONS.OPEN_DEMO_WARDROBE, label: "Открыть демо-гардероб" },
    ],
    canSaveAsPersonal: false,
  };
}

export function guardFirstResultSave(result) {
  if (result?.outfit?.source === "demo" || result?.outfit?.kind === "demo") {
    return { status: "blocked", reason: "demo_cannot_be_saved_as_personal" };
  }
  return { status: "allowed" };
}

export function createFirstOnboardingResultController({ onAction } = {}) {
  if (typeof onAction !== "function") throw new TypeError("onAction is required");
  let current = null;
  return {
    start(input) {
      current = createFirstOnboardingResult(input);
      return clone(current);
    },
    getState: () => clone(current),
    dispatch(actionId) {
      const action = current?.actions.find(({ id }) => id === actionId);
      if (!action) return { status: "ignored", reason: "unknown_action" };
      onAction(action.id, clone(current));
      return { status: "dispatched", action: action.id };
    },
    requestPersonalSave() {
      return guardFirstResultSave(current);
    },
  };
}
