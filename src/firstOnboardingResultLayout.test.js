import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./FirstOnboardingResult.css", import.meta.url), "utf8");

test("first onboarding result neutralizes the global sticky flex header", () => {
  assert.match(css, /\.first-result__header\{[^}]*position:static[^}]*display:block[^}]*height:auto[^}]*min-width:0[^}]*padding:0/);
});

test("first onboarding result stays bounded and readable on mobile", () => {
  assert.match(css, /\.first-result\{[^}]*width:100%[^}]*max-width:1080px[^}]*min-width:0[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.first-result__summary\{[^}]*width:100%[^}]*min-width:0/);
  assert.match(css, /@media\(max-width:640px\)\{\.first-result__summary\{grid-template-columns:1fr\}/);
});

test("first demo result shows a spacious visual wardrobe board", () => {
  assert.match(css, /\.first-result__pieces\{[^}]*display:grid[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)[^}]*gap:16px/);
  assert.match(css, /\.first-result__piece-art\{[^}]*wardrobe-grid\.png[^}]*background-size:300% 300%/);
});

test("first result actions retain 44px touch targets without forcing overflow", () => {
  assert.match(css, /\.first-result__actions button\{[^}]*min-width:44px[^}]*min-height:44px[^}]*max-width:100%[^}]*white-space:normal/);
});

test("mobile first result reserves scroll clearance above the fixed navigation", () => {
  assert.match(css, /@media\(max-width:720px\)\{\.first-result\{padding-bottom:calc\(110px \+ env\(safe-area-inset-bottom\)\)\}[\s\S]*\}/);
});
