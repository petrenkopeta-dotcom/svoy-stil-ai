export const SHOPPING_FLOW_STATUS = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  MATCHED: "matched",
  SAVE_CONFIRMATION: "save_confirmation",
  SAVED: "saved",
});

const clone = (value) => value == null ? value : structuredClone(value);
const clean = (value) => String(value ?? "").trim();

export function createShoppingFlowState() {
  return { status: SHOPPING_FLOW_STATUS.IDLE, anchor: null, matches: [], saveRequested: false, savedGarment: null };
}

export function createTemporaryShoppingAnchor(input = {}, { id } = {}) {
  const anchorId = clean(id || input.id);
  const category = clean(input.category);
  if (!anchorId) throw new TypeError("shopping anchor id is required");
  if (!category) throw new TypeError("shopping anchor category is required");
  return Object.freeze({
    id: anchorId,
    name: clean(input.name || input.display_name) || "Новая вещь",
    category,
    color: clean(input.color),
    style: clean(input.style),
    status: "ready",
    source: "shopping_pending",
    intake: input.intake === "photo" ? "photo" : "manual",
    photoRef: input.intake === "photo" ? clean(input.photoRef) || null : null,
    temporary: true,
  });
}

export function setShoppingAnchor(state, anchor) {
  if (anchor?.source !== "shopping_pending" || anchor?.temporary !== true) throw new TypeError("temporary shopping anchor is required");
  return { ...createShoppingFlowState(), status: SHOPPING_FLOW_STATUS.READY, anchor: clone(anchor) };
}

export function setShoppingMatches(state, matches) {
  if (!state?.anchor) throw new Error("SHOPPING_ANCHOR_REQUIRED");
  return { ...clone(state), status: SHOPPING_FLOW_STATUS.MATCHED, matches: clone(matches || []), saveRequested: false };
}

export function requestShoppingSave(state) {
  if (!state?.anchor || state.status === SHOPPING_FLOW_STATUS.SAVED) return clone(state);
  return { ...clone(state), status: SHOPPING_FLOW_STATUS.SAVE_CONFIRMATION, saveRequested: true };
}

export function cancelShoppingSave(state) {
  if (state?.status !== SHOPPING_FLOW_STATUS.SAVE_CONFIRMATION) return clone(state);
  return { ...clone(state), status: SHOPPING_FLOW_STATUS.MATCHED, saveRequested: false };
}

export function confirmShoppingSave(state, savedGarment) {
  if (state?.status !== SHOPPING_FLOW_STATUS.SAVE_CONFIRMATION || state.saveRequested !== true) {
    return { status: "confirmation_required", state: clone(state) };
  }
  return {
    status: "saved",
    state: { ...clone(state), status: SHOPPING_FLOW_STATUS.SAVED, anchor: null, saveRequested: false, savedGarment: clone(savedGarment) },
  };
}

export function discardShoppingFlow() {
  return createShoppingFlowState();
}
