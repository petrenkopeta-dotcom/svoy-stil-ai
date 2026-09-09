import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextTabForKey } from "./wardrobeA11y.js";

test("wardrobe tabs implement wrapping arrows plus Home and End", () => {
  assert.equal(nextTabForKey("personal", "ArrowRight"), "demo");
  assert.equal(nextTabForKey("demo", "ArrowRight"), "personal");
  assert.equal(nextTabForKey("personal", "ArrowLeft"), "demo");
  assert.equal(nextTabForKey("demo", "Home"), "personal");
  assert.equal(nextTabForKey("personal", "End"), "demo");
  assert.equal(nextTabForKey("personal", "Enter"), null);
});

test("wardrobe accessibility module wires tabs, panel and named delete dialog", () => {
const source = readFileSync(new URL("./WardrobeAccessibility.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /aria-labelledby=/);
  assert.match(source, /tabIndex=\{activeTab === name \? 0 : -1\}/);
  assert.match(source, /hidden=\{activeTab !== name\}/);
  assert.match(source, /<AccessibleDialog[\s\S]*labelledBy=\{titleId\}[\s\S]*describedBy=\{descriptionId\}/);
  assert.match(source, /initialFocus="\[data-delete-cancel\]"/);
  assert.match(css, /\.closet-tabs button\{min-width:44px;min-height:44px\}/);
  assert.match(css, /\.delete-garment-dialog \.confirm-actions button\{min-width:44px;min-height:44px/);
});
