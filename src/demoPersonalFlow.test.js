import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_OUTFIT_LABEL,
  confirmPersonalTransition,
  createDemoPersonalController,
  createDemoState,
  loadPersonalState,
  requestOwnItemReplacement,
  savePersonalState,
} from "./demoPersonalFlow.js";

const demoItems = [
  { id: "demo-top", name: "Рубашка", category: "top", imageUrl: "https://example.test/demo.jpg" },
  { id: "demo-bottom", name: "Брюки", category: "bottom", inferredBodyType: "forbidden" },
];

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    snapshot: () => Object.fromEntries(values),
  };
}

test("demo wardrobe is explicitly marked and privacy-minimized", () => {
  const state = createDemoState({ sessionId: "session-1", items: demoItems });
  assert.equal(state.mode, "demo");
  assert.equal(state.outfit.label, DEMO_OUTFIT_LABEL);
  assert.equal(state.outfit.kind, "demo");
  assert.ok(state.wardrobe.every((item) => item.source === "demo"));
  assert.equal(JSON.stringify(state).includes("imageUrl"), false);
  assert.equal(JSON.stringify(state).includes("inferredBodyType"), false);
});

test("demo state and demo-derived preferences are never written to localStorage", () => {
  const storage = memoryStorage();
  const demo = { ...createDemoState({ sessionId: "s", items: demoItems }), preferences: { colors: ["red"] } };
  assert.deepEqual(savePersonalState(storage, demo), { status: "skipped", reason: "demo_is_ephemeral" });
  assert.deepEqual(storage.snapshot(), {});
});

test("replacing a demo item requires an explicit transition and never creates a mixed outfit", () => {
  const demo = createDemoState({ sessionId: "s", items: demoItems });
  const requested = requestOwnItemReplacement(demo, {
    demoItemId: "demo-top",
    ownItem: { id: "own-top", name: "Моя рубашка", category: "top", photo: "private-bytes" },
  });
  assert.equal(requested.status, "transition_required");
  assert.deepEqual(requested.next.outfit.itemIds, ["demo-top", "demo-bottom"]);
  assert.equal(requested.next.pendingTransition.ownItem.photo, undefined);

  const changed = confirmPersonalTransition(requested.next, { ownerId: "user-1" });
  assert.equal(changed.status, "changed");
  assert.deepEqual(changed.state.wardrobe.map((item) => item.id), ["own-top"]);
  assert.equal(changed.state.outfit, null);
  assert.deepEqual(changed.state.preferences, {});
  assert.equal(JSON.stringify(changed.state).includes("demo-"), false);
});

test("controller persists only after confirmed personal transition", () => {
  const storage = memoryStorage();
  const controller = createDemoPersonalController({ storage });
  controller.startDemo({ sessionId: "s", items: demoItems });
  assert.deepEqual(storage.snapshot(), {});
  controller.requestReplacement({ demoItemId: "demo-top", ownItem: { id: "own-1", category: "top" } });
  assert.deepEqual(storage.snapshot(), {});
  controller.confirmPersonal({ ownerId: "user-1" });
  assert.equal(loadPersonalState(storage).wardrobe[0].id, "own-1");
});

test("storage rejects malformed, demo, and mixed persisted payloads", () => {
  const key = "ai-stylist.personal-flow.v1";
  for (const payload of [
    "not-json",
    JSON.stringify({ version: 1, mode: "demo", ownerId: "u", wardrobe: [] }),
    JSON.stringify({ version: 1, mode: "personal", ownerId: "u", wardrobe: [{ id: "d", source: "demo" }] }),
  ]) {
    assert.equal(loadPersonalState(memoryStorage({ [key]: payload })), null);
  }
});
