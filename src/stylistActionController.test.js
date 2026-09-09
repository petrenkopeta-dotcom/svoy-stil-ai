import test from "node:test";
import assert from "node:assert/strict";
import { createStylistActionController, regenerateForStylistAction } from "./stylistActionController.js";
import { readFileSync } from "node:fs";

const item = (id, category, extra = {}) => ({ id, category, status: "ready", display_name: id, colors: [{ name: "black" }], formality: 3, ...extra });
const wardrobe = [item("t1", "top"), item("t2", "top", { colors: [{ name: "red" }], formality: 5 }), item("b1", "bottom"), item("b2", "bottom", { comfort_tags: ["soft"] }), item("s1", "shoes"), item("s2", "shoes", { formality: 5 })];
const current = { signature: "b1|s1|t1", items: [wardrobe[0], wardrobe[2], wardrobe[4]] };

for (const action of ["calmer", "brighter", "more_formal", "more_comfortable"]) test(`${action} regenerates while preserving anchor and constraints`, () => {
  const result = regenerateForStylistAction({ action, wardrobe, request: { anchorId: "b1", excludedItemIds: ["s2"] }, currentCandidate: current });
  assert.equal(result.status, "changed");
  assert.ok(result.candidate.itemIds.includes("b1"));
  assert.ok(!result.candidate.itemIds.includes("s2"));
  assert.deepEqual(result.preserved, { anchorId: "b1", hardConstraints: true });
  assert.ok(result.change.categories.length > 0);
  assert.ok(result.why);
});

test("replace shoes only keeps every non-shoe item", () => {
  const result = regenerateForStylistAction({ action: "replace_shoes_only", wardrobe, request: { anchorId: "t1" }, currentCandidate: current });
  assert.equal(result.status, "changed");
  assert.deepEqual(result.change.categories, ["shoes"]);
  assert.deepEqual(result.candidate.itemIds.filter((id) => id !== "s2").sort(), ["b1", "t1"]);
});

test("absence of an alternative is explicit", () => {
  const result = regenerateForStylistAction({ action: "replace_shoes_only", wardrobe: wardrobe.filter((x) => x.id !== "s2"), request: {}, currentCandidate: current });
  assert.equal(result.status, "no_alternative");
  assert.equal(result.reason, "no_other_shoes");
});

test("double click is ignored while the first action is loading and repeated action works later", async () => {
  let release;
  const controller = createStylistActionController(() => new Promise((resolve) => { release = resolve; }));
  const first = controller.dispatch({ action: "calmer" });
  await Promise.resolve();
  assert.equal(controller.loading, true);
  assert.deepEqual(await controller.dispatch({ action: "calmer" }), { status: "ignored", reason: "action_in_progress", action: "calmer" });
  release({ status: "changed" });
  await first;
  assert.equal(controller.loading, false);
  const again = controller.dispatch({ action: "calmer" });
  await Promise.resolve();
  release({ status: "changed" });
  assert.equal((await again).status, "changed");
});

test("UI actions dispatch directly and never trigger profile learning", () => {
  const source = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
  assert.match(source, /stylistAction=\{runStylistAction\}/);
  assert.doesNotMatch(source, /stylistAction=\{[^\n]*startLearning/);
});
