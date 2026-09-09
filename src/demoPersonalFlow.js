export const DEMO_PERSONAL_STORAGE_KEY = "ai-stylist.personal-flow.v1";
export const DEMO_OUTFIT_LABEL = "Демонстрационный";

const clone = (value) => structuredClone(value);
const text = (value) => String(value ?? "").trim();

function publicGarment(item, source) {
  if (!item || !text(item.id)) throw new TypeError("garment id is required");
  return {
    id: text(item.id),
    source,
    name: text(item.name || item.display_name) || "Вещь",
    category: text(item.category) || "unknown",
  };
}

export function createDemoState({ sessionId, items = [], outfitId = "demo-outfit" } = {}) {
  if (!text(sessionId)) throw new TypeError("sessionId is required");
  const demoItems = items.map((item) => publicGarment(item, "demo"));
  return {
    mode: "demo",
    sessionId: text(sessionId),
    wardrobe: demoItems,
    outfit: {
      id: text(outfitId),
      kind: "demo",
      label: DEMO_OUTFIT_LABEL,
      itemIds: demoItems.map((item) => item.id),
    },
    pendingTransition: null,
  };
}

export function requestOwnItemReplacement(state, { demoItemId, ownItem } = {}) {
  if (state?.mode !== "demo") return { status: "invalid_transition", reason: "not_in_demo" };
  if (!state.wardrobe.some((item) => item.id === text(demoItemId))) {
    return { status: "invalid_transition", reason: "demo_item_not_found" };
  }
  const safeOwnItem = publicGarment(ownItem, "personal");
  return {
    status: "transition_required",
    reason: "demo_and_personal_must_not_mix",
    next: {
      ...clone(state),
      pendingTransition: {
        kind: "start_personal_with_own_item",
        replacedDemoItemId: text(demoItemId),
        ownItem: safeOwnItem,
      },
    },
  };
}

export function confirmPersonalTransition(state, { ownerId } = {}) {
  if (state?.mode !== "demo" || state.pendingTransition?.kind !== "start_personal_with_own_item") {
    return { status: "invalid_transition", reason: "transition_not_requested" };
  }
  if (!text(ownerId)) return { status: "invalid_transition", reason: "owner_required" };
  const ownItem = clone(state.pendingTransition.ownItem);
  return {
    status: "changed",
    state: {
      mode: "personal",
      ownerId: text(ownerId),
      wardrobe: [ownItem],
      outfit: null,
      preferences: {},
    },
  };
}

export function cancelPersonalTransition(state) {
  if (state?.mode !== "demo") return clone(state);
  return { ...clone(state), pendingTransition: null };
}

export function serializePersonalState(state) {
  if (state?.mode !== "personal") return null;
  return JSON.stringify({
    version: 1,
    mode: "personal",
    ownerId: text(state.ownerId),
    wardrobe: (state.wardrobe || []).map((item) => publicGarment(item, "personal")),
    outfit: state.outfit ?? null,
    preferences: clone(state.preferences || {}),
  });
}

export function savePersonalState(storage, state, key = DEMO_PERSONAL_STORAGE_KEY) {
  const payload = serializePersonalState(state);
  if (payload === null) return { status: "skipped", reason: "demo_is_ephemeral" };
  storage.setItem(key, payload);
  return { status: "saved" };
}

export function loadPersonalState(storage, key = DEMO_PERSONAL_STORAGE_KEY) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || parsed?.mode !== "personal" || !text(parsed.ownerId)) return null;
    if ((parsed.wardrobe || []).some((item) => item.source !== "personal")) return null;
    return {
      mode: "personal",
      ownerId: text(parsed.ownerId),
      wardrobe: (parsed.wardrobe || []).map((item) => publicGarment(item, "personal")),
      outfit: parsed.outfit ?? null,
      preferences: clone(parsed.preferences || {}),
    };
  } catch {
    return null;
  }
}

export function createDemoPersonalController({ storage = null, storageKey = DEMO_PERSONAL_STORAGE_KEY } = {}) {
  let current = null;
  return {
    getState: () => clone(current),
    startDemo(input) {
      current = createDemoState(input);
      return clone(current);
    },
    requestReplacement(input) {
      const result = requestOwnItemReplacement(current, input);
      if (result.next) current = result.next;
      return clone(result);
    },
    confirmPersonal(input) {
      const result = confirmPersonalTransition(current, input);
      if (result.state) {
        current = result.state;
        if (storage) savePersonalState(storage, current, storageKey);
      }
      return clone(result);
    },
    cancelTransition() {
      current = cancelPersonalTransition(current);
      return clone(current);
    },
    restorePersonal() {
      current = storage ? loadPersonalState(storage, storageKey) : null;
      return clone(current);
    },
  };
}
