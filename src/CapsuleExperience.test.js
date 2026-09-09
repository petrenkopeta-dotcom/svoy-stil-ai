import test from "node:test";
import assert from "node:assert/strict";
import { capsuleGarments, makeCapsuleRequest } from "./capsuleAppAdapter.js";
import { buildCapsule } from "./capsuleEngine.js";

const items = [
  { id: 1, type: "Верх", source: "demo" }, { id: 2, type: "Низ", source: "demo" },
  { id: 3, type: "Обувь", source: "demo" }, { id: 4, type: "Верх", source: "personal" },
  { id: 5, type: "Низ", source: "personal", confirmed: true },
];

test("capsule adapter never mixes demo and personal owner scopes", () => {
  assert.deepEqual(capsuleGarments(items, "demo", "demo-session").map((x) => x.id), ["1", "2", "3"]);
  assert.deepEqual(capsuleGarments(items, "personal", "owner-a").map((x) => x.id), ["4", "5"]);
  assert.ok(capsuleGarments(items, "personal", "owner-a").every((x) => x.ownerScope === "owner-a"));
  assert.deepEqual(capsuleGarments(items, "personal", "owner-a").map(({ id, confirmed, status }) => ({ id, confirmed, status })), [
    { id: "4", confirmed: false, status: "unready" },
    { id: "5", confirmed: true, status: "ready" },
  ]);
});

test("insufficient personal wardrobe fails closed without inventing items", () => {
  const output = buildCapsule(makeCapsuleRequest({ items, mode: "personal", ownerScope: "owner-a" }));
  assert.equal(output.result.status, "hold");
  assert.deepEqual(output.result.itemIds, []);
});
