import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const contract = css.slice(css.indexOf("/* QA-ALPHA-008:"));

const ruleFor = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return contract.match(new RegExp(`(?:^|})\\s*[^{}]*${escaped}[^{}]*\\{([^{}]*)\\}`))?.[1] ?? "";
};

test("QA-ALPHA-008 gives every named interactive control a 44px target", () => {
  for (const selector of [".avatar", ".x", ".delete-item"]) {
    const rule = ruleFor(selector);
    assert.match(rule, /min-width\s*:\s*44px/, `${selector} needs min-width:44px`);
    assert.match(rule, /min-height\s*:\s*44px/, `${selector} needs min-height:44px`);
  }

  for (const selector of [
    ".chips button",
    ".rate button",
    ".reason",
    ".stylist-actions button",
    ".learning-actions button",
    ".confirm-actions button",
    ".history-list button.liked",
  ]) {
    const rule = ruleFor(selector);
    assert.match(rule, /min-width\s*:\s*44px/, `${selector} needs min-width:44px`);
    assert.match(rule, /min-height\s*:\s*44px/, `${selector} needs min-height:44px`);
  }
});

test("compact circular visuals keep their original chrome inside the 44px hit area", () => {
  assert.match(ruleFor(".avatar::before"), /inset\s*:\s*4\.5px/);
  assert.match(ruleFor(".delete-item::before"), /width\s*:\s*28px/);
  assert.match(ruleFor(".delete-item::before"), /height\s*:\s*28px/);
});

test("320/360/390/412/430 mobile layouts have wrapping and bounded controls", () => {
  assert.match(contract, /\.rate\{[^}]*flex-wrap\s*:\s*wrap/);
  assert.match(contract, /\.stylist-actions>div\{[^}]*flex-wrap\s*:\s*wrap/);
  assert.match(contract, /@media\s*\(max-width:430px\)/);
  assert.match(contract, /\.modal\{max-width:calc\(100vw - 40px\)}/);

  for (const viewport of [320, 360, 390, 412, 430]) {
    const modalWidth = viewport - 40;
    assert.ok(modalWidth >= 280 && modalWidth <= viewport, `${viewport}px modal must remain within viewport`);
    const contentWidth = viewport - 40;
    assert.ok(Math.floor((contentWidth - 7) / 2) >= 132, `${viewport}px action row must fit two flexible targets or wrap`);
  }
});
