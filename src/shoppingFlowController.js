import { generateAndRankCandidates } from "./stylistCandidateEngine.js";
import {
  confirmShoppingSave,
  cancelShoppingSave,
  createShoppingFlowState,
  createTemporaryShoppingAnchor,
  discardShoppingFlow,
  requestShoppingSave,
  setShoppingAnchor,
  setShoppingMatches,
} from "./shoppingFlowState.js";

const clone = (value) => value == null ? value : structuredClone(value);
const clean = (value) => String(value ?? "").trim();

function personalOnly(items = []) {
  if (!Array.isArray(items) || items.some((item) => item?.source !== "personal")) {
    throw new Error("SHOPPING_PERSONAL_WARDROBE_REQUIRED");
  }
  return items.map(clone);
}

function safeMatches(result, anchorId, allowedItems) {
  const allowedIds = new Set(allowedItems.keys());
  return (result?.candidates || []).filter((candidate) => {
    const ids = candidate.itemIds?.map(String) || [];
    return ids.includes(anchorId) && ids.every((id) => allowedIds.has(id));
  }).map((candidate) => ({
    itemIds: candidate.itemIds.map(String),
    items: candidate.itemIds.map(String).map((id) => clone(allowedItems.get(id))),
    explanation: candidate.explanation,
    rankingLevel: candidate.rankingLevel,
  }));
}

/**
 * Isolated BACKLOG-04 orchestration boundary. BACKLOG-09 may wire this factory
 * to UI and repositories without importing or editing src/main.jsx here.
 */
export function createShoppingFlowController({
  getPersonalWardrobe,
  savePersonalGarment,
  generateCandidates = generateAndRankCandidates,
  createId = () => `shopping-${Date.now()}`,
} = {}) {
  if (typeof getPersonalWardrobe !== "function") throw new TypeError("getPersonalWardrobe is required");
  if (typeof savePersonalGarment !== "function") throw new TypeError("savePersonalGarment is required");
  let state = createShoppingFlowState();

  const add = (input) => {
    state = setShoppingAnchor(state, createTemporaryShoppingAnchor(input, { id: createId() }));
    return clone(state);
  };

  return Object.freeze({
    getState: () => clone(state),
    addManual(input) { return add({ ...input, intake: "manual" }); },
    addPhoto(input, localReviewPayload) {
      if (localReviewPayload?.network_allowed !== false || localReviewPayload?.user_review_required !== true || localReviewPayload?.storage_scope !== "local_device") {
        throw new Error("SHOPPING_LOCAL_PHOTO_REVIEW_REQUIRED");
      }
      return add({ ...input, intake: "photo" });
    },
    findMatches(request = {}) {
      if (!state.anchor) throw new Error("SHOPPING_ANCHOR_REQUIRED");
      const wardrobe = personalOnly(getPersonalWardrobe());
      const pool = [...wardrobe, clone(state.anchor)];
      const result = generateCandidates(pool, { ...request, anchorId: state.anchor.id });
      const allowedItems = new Map(pool.map((item) => [String(item.id), item]));
      state = setShoppingMatches(state, safeMatches(result, String(state.anchor.id), allowedItems));
      return { state: clone(state), noCandidateReasons: clone(result?.noCandidateReasons || []) };
    },
    requestSave() {
      state = requestShoppingSave(state);
      return clone(state);
    },
    cancelSave() {
      state = cancelShoppingSave(state);
      return clone(state);
    },
    async confirmSave(confirmed) {
      if (confirmed !== true || state.saveRequested !== true) return { status: "confirmation_required", state: clone(state) };
      const garment = { ...clone(state.anchor), source: "personal", temporary: false };
      const persisted = await savePersonalGarment(garment);
      const result = confirmShoppingSave(state, persisted ?? garment);
      state = result.state;
      return clone(result);
    },
    discard() {
      state = discardShoppingFlow();
      return clone(state);
    },
  });
}
