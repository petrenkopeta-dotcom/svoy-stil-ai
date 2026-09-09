import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("color step combines visible paired swatches with native radio semantics", async () => {
  const source = await readFile(new URL("./onboarding/ColorComparisonStep.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/label: "/g) ?? []).length, 5);
  assert.match(source, /type="radio"/);
  assert.match(source, /color-pair-swatch/);
  assert.match(source, /Тёмно-синий \+ молочный/);
  assert.match(source, /Не знаю \/ нет предпочтения/);
  assert.match(source, /не определяет цветотип/);
  assert.match(source, /checked=\{selected\}/);
});
