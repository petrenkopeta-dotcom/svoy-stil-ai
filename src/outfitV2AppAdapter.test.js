import test from "node:test";
import assert from "node:assert/strict";
import { composePersonalLooksV2 } from "./outfitV2AppAdapter.js";

const item = (id, type, confirmed = true) => ({ id, type, name: id, source: "personal", confirmed, status: "ready" });

test("personal app seam returns honest 1-3 variants and excludes unconfirmed items", () => {
  const result = composePersonalLooksV2({ items: [item("t", "Верх"), item("b", "Низ"), item("s", "Обувь"), item("draft", "Низ", false)], ownerScope: "local-owner", anchorId: "t", occasion: "work" });
  assert.equal(result.status, "limited");
  assert.equal(result.looks.length, 1);
  assert.deepEqual(result.looks[0].items.map(({ id }) => id), ["b", "s", "t"]);
  assert.equal(result.looks[0].explanationV2.source, "personal");
  assert.deepEqual(result.limitations, ["only_one_variant_available"]);
});

test("demo and cross-owner fields cannot enter the personal app seam", () => {
  const result = composePersonalLooksV2({ items: [{ ...item("t", "Верх"), source: "demo" }, item("b", "Низ"), item("s", "Обувь")], ownerScope: "local-owner", anchorId: "t" });
  assert.equal(result.status, "hold");
  assert.deepEqual(result.noResultReasons, ["anchor_not_found"]);
});
