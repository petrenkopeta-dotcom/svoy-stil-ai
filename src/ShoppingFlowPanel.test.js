import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ShoppingFlowPanel.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("dialog DOM contract exposes labelled modal, local-only copy and safe cancellation", () => {
  assert.match(source, /<AccessibleDialog[\s\S]*labelledBy=\{titleId\}[\s\S]*describedBy=\{descriptionId\}/);
  assert.match(source, /initialFocus="\[data-shopping-cancel\]"/);
  assert.match(source, /<h2 id=\{titleId\}>В магазине<\/h2>/);
  assert.match(source, /Ничего не отправляется в сеть и не сохраняется без подтверждения/);
  assert.match(source, /data-shopping-cancel/);
  assert.match(source, /Отменить и не сохранять/);
});

test("intake DOM contract offers manual and photo paths for a temporary garment", () => {
  assert.match(source, /<form onSubmit=\{addTemporary\} aria-label="Новая временная вещь">/);
  assert.match(source, /aria-pressed=\{method === "manual"\}/);
  assert.match(source, /aria-pressed=\{method === "photo"\}/);
  assert.match(source, /<PhotoIntake controller=\{photoController\} onReady=\{setPhotoReview\}/);
  assert.match(source, /<select name="shopping-category" required/);
  assert.match(source, /Использовать временно/);
});

test("matches DOM contract shows personal results before a non-final save request", () => {
  assert.match(source, /flow\.status === SHOPPING_FLOW_STATUS\.MATCHED/);
  assert.match(source, /<h3 id=\{`\$\{titleId\}-matches`\}>С чем сочетается<\/h3>/);
  assert.match(source, /match\.items\.map/);
  assert.match(source, /Сохранить эту вещь…/);
});

test("confirmation DOM contract requires a second explicit action and supports back", () => {
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-labelledby=\{`\$\{titleId\}-confirm`\}/);
  assert.match(source, /Только после подтверждения она попадёт в личный гардероб/);
  assert.match(source, /controller\.cancelSave\(\)/);
  assert.match(source, /controller\.confirmSave\(true\)/);
  assert.match(source, /Да, сохранить/);
});

test("UI delegates domain transitions and contains no network or QR implementation", () => {
  for (const call of ["addManual", "addPhoto", "findMatches", "requestSave", "cancelSave", "confirmSave", "discard"]) {
    assert.match(source, new RegExp(`controller\\.${call}\\(`));
  }
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|qr/i);
  assert.match(css, /\.shopping-flow-panel button,[\s\S]*min-height:44px/);
});
