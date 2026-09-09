import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CapsuleUI.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./CapsuleUI.css", import.meta.url), "utf8");

test("isolated capsule UI exports the requested surfaces without app wiring", () => {
  for (const name of ["CapsuleEntry", "CapsuleCard", "CapsuleDetail", "OutfitMatrix", "CapsuleLoading", "CapsuleEmpty", "CapsuleError"]) assert.match(source, new RegExp(`export function ${name}`));
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|supabase|auth|paywall/i);
});

test("demo and personal modes remain explicit and never claim demo persistence", () => {
  assert.match(source, /Демо · не сохраняется/);
  assert.match(source, /Личная/);
  assert.match(source, /Перейти в мой гардероб/);
  assert.doesNotMatch(source, /идеальн|процент|совместимост|499|999/i);
});

test("semantic states expose busy, polite and alert behavior", () => {
  assert.match(source, /aria-busy="true" aria-live="polite"/);
  assert.match(source, /aria-live="polite">Найдено образов/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Ваши данные не изменены/);
});

test("mobile and accessibility rules prevent narrow overflow", () => {
  assert.match(css, /@media\(max-width:719px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /outline:3px solid/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
