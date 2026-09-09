import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");

test("opening the demo wardrobe preserves personal items instead of replacing the wardrobe", () => {
  assert.match(source, /setWardrobe\(\(current\) => \[\s*\.\.\.current\.filter\(\(item\) => !isDemoGarment\(item\)\)/);
  assert.doesNotMatch(source, /load=\{\(\) => \{\s*setWardrobe\(demo\.map/);
});

test("demo look copy and CTA do not claim personal ownership or enter learning", () => {
  assert.match(source, /demoLook \? "ДЕМОНСТРАЦИОННЫЙ ОБРАЗ" : "СОБРАНО ИЗ ТВОИХ ВЕЩЕЙ"/);
  assert.match(source, /demoLook \? <button className="primary" onClick=\{addGarment\}>/);
  assert.match(source, /outfit\.some\(isDemoGarment\) \? setVariant/);
  assert.match(source, /\{!demoLook && <div className="rate">/);
});

test("wardrobe CTA builds strictly from the active demo or personal tab", () => {
  assert.match(source, /items=\{localPilotPhoto \? wardrobe : selected\}/);
  assert.match(source, /const localCatalog = catalogMode === "demo"/);
  assert.match(source, /wardrobe\.filter\(\(item\) => !isDemoGarment\(item\)\)/);
  assert.match(source, /onClick=\{\(\) => next\(tab\)\}/);
  assert.match(source, /next=\{\(mode\) => \{\s*setCatalogMode\(mode\)/);
});
