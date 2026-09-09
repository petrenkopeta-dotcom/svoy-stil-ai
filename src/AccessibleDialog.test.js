import assert from "node:assert/strict";
import test from "node:test";
import { activateDialog, handleDialogKeyDown } from "./AccessibleDialog.js";
import { readFileSync } from "node:fs";

function fixture(dialogName) {
  const listeners = new Map();
  const body = { style: { overflow: "auto" } };
  const doc = {
    activeElement: null,
    body,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  const makeElement = (name) => ({
    name,
    isConnected: true,
    focus() { doc.activeElement = this; },
    getAttribute: () => null,
  });
  const opener = makeElement(`${dialogName}-opener`);
  const first = makeElement(`${dialogName}-close`);
  const last = makeElement(`${dialogName}-last-action`);
  doc.activeElement = opener;
  const container = {
    ownerDocument: doc,
    focus() { doc.activeElement = this; },
    querySelectorAll: () => [first, last],
    querySelector: () => null,
    contains: (element) => element === first || element === last,
  };
  return { container, doc, first, last, listeners, opener };
}

test("Feedback, Learning and Add Item use the shared accessible dialog", () => {
  const source = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
  assert.match(source, /<AccessibleDialog labelledBy="feedback-title"/);
  assert.match(source, /<AccessibleDialog className="modal learning-modal" labelledBy="learning-title"/);
  assert.match(source, /as="form"[\s\S]*labelledBy="add-item-title"[\s\S]*initialFocus="input\[name='garment-name'\]"/);
  assert.match(source, /className="x" onClick=\{close\} aria-label="Закрыть"/);
});

for (const dialogName of ["Feedback", "Learning", "Add Item"]) {
  test(`${dialogName} dialog supports initial focus, focus trap, Escape, return focus and scroll lock`, () => {
    const f = fixture(dialogName);
    let closed = 0;
    const deactivate = activateDialog(f.container, () => closed++);
    assert.equal(f.doc.activeElement, f.first);
    assert.equal(f.doc.body.style.overflow, "hidden");

    f.doc.activeElement = f.last;
    const tab = { key: "Tab", shiftKey: false, preventDefault() { this.prevented = true; } };
    handleDialogKeyDown(tab, f.container, () => closed++);
    assert.equal(tab.prevented, true);
    assert.equal(f.doc.activeElement, f.first);

    const escape = { key: "Escape", preventDefault() { this.prevented = true; } };
    f.listeners.get("keydown")(escape);
    assert.equal(escape.prevented, true);
    assert.equal(closed, 1);

    deactivate();
    assert.equal(f.doc.body.style.overflow, "auto");
    assert.equal(f.doc.activeElement, f.opener);
  });
}
