import test from "node:test";
import assert from "node:assert/strict";
import { createShoppingFlowController } from "./shoppingFlowController.js";
import { SHOPPING_FLOW_STATUS } from "./shoppingFlowState.js";

const personalWardrobe = [
  { id: "top-1", name: "Рубашка", category: "top", source: "personal", status: "ready" },
  { id: "bottom-1", name: "Брюки", category: "bottom", source: "personal", status: "ready" },
  { id: "shoes-1", name: "Лоферы", category: "shoes", source: "personal", status: "ready" },
];

function setup(overrides = {}) {
  const saved = [];
  const controller = createShoppingFlowController({
    getPersonalWardrobe: () => personalWardrobe,
    savePersonalGarment: async (item) => { saved.push(item); return item; },
    createId: () => "shopping-new",
    ...overrides,
  });
  return { controller, saved };
}

test("manual garment stays temporary while it anchors matches from personal wardrobe", () => {
  const { controller, saved } = setup();
  const added = controller.addManual({ name: "Жакет", category: "outerwear", color: "beige" });
  assert.equal(added.anchor.source, "shopping_pending");
  assert.equal(added.anchor.temporary, true);

  const result = controller.findMatches();
  assert.equal(result.state.status, SHOPPING_FLOW_STATUS.MATCHED);
  assert.ok(result.state.matches.length > 0);
  assert.ok(result.state.matches.every((match) => match.itemIds.includes("shopping-new")));
  assert.equal(saved.length, 0);
});

test("photo path accepts only the local, review-required payload and performs no transport", () => {
  const { controller } = setup();
  assert.throws(() => controller.addPhoto({ category: "top" }, { network_allowed: true }), /LOCAL_PHOTO_REVIEW/);
  const state = controller.addPhoto(
    { name: "Топ", category: "top", photoRef: "photo-local-1" },
    { network_allowed: false, user_review_required: true, storage_scope: "local_device" },
  );
  assert.equal(state.anchor.intake, "photo");
  assert.equal(state.anchor.photoRef, "photo-local-1");
});

test("garment is persisted only after requestSave and an explicit true confirmation", async () => {
  const { controller, saved } = setup();
  controller.addManual({ name: "Юбка", category: "bottom" });
  assert.equal((await controller.confirmSave(true)).status, "confirmation_required");
  assert.equal(saved.length, 0);
  controller.requestSave();
  assert.equal((await controller.confirmSave(false)).status, "confirmation_required");
  assert.equal(saved.length, 0);
  const result = await controller.confirmSave(true);
  assert.equal(result.status, "saved");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, "personal");
  assert.equal(saved[0].temporary, false);
});

test("demo or mixed wardrobes are rejected before candidate generation", () => {
  let generated = false;
  const { controller } = setup({
    getPersonalWardrobe: () => [...personalWardrobe, { id: "demo-1", category: "top", source: "demo" }],
    generateCandidates: () => { generated = true; return { candidates: [] }; },
  });
  controller.addManual({ category: "shoes" });
  assert.throws(() => controller.findMatches(), /PERSONAL_WARDROBE_REQUIRED/);
  assert.equal(generated, false);
});

test("candidate boundary drops results containing demo or unknown ids", () => {
  const { controller } = setup({
    generateCandidates: () => ({
      candidates: [
        { itemIds: ["shopping-new", "top-1", "demo-1"], explanation: "bad" },
        { itemIds: ["shopping-new", "top-1"], explanation: "ok", rankingLevel: "good" },
      ],
      noCandidateReasons: [],
    }),
  });
  controller.addManual({ category: "bottom" });
  const { state } = controller.findMatches();
  assert.deepEqual(state.matches.map((match) => match.explanation), ["ok"]);
});

test("discard removes the temporary anchor without saving it", () => {
  const { controller, saved } = setup();
  controller.addManual({ category: "dress" });
  const state = controller.discard();
  assert.equal(state.status, SHOPPING_FLOW_STATUS.IDLE);
  assert.equal(state.anchor, null);
  assert.equal(saved.length, 0);
});

test("save confirmation can be cancelled without persisting or losing matches", () => {
  const { controller, saved } = setup({
    generateCandidates: () => ({ candidates: [{ itemIds: ["shopping-new", "top-1"] }], noCandidateReasons: [] }),
  });
  controller.addManual({ category: "bottom" });
  controller.findMatches();
  controller.requestSave();
  const state = controller.cancelSave();
  assert.equal(state.status, SHOPPING_FLOW_STATUS.MATCHED);
  assert.equal(state.saveRequested, false);
  assert.equal(state.matches.length, 1);
  assert.equal(saved.length, 0);
});
