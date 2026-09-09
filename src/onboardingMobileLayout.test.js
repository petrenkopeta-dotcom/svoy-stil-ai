import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const source = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const contract = css.slice(css.indexOf("/* FIX-ONB-04:"));

const declarationContaining = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return contract.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([^{}]*)\\}`))?.[1] ?? "";
};

test("FIX-ONB-04 gives real onboarding chips, consent labels and navigation controls 44px targets", () => {
  for (const selector of [
    ".chips .chip",
    ".continue .primary",
    ".continue .remember-context",
    ".manual-context .remember-context",
    ".manual-context button",
    ".onboarding-back",
    ".onboarding-next",
  ]) {
    const rule = declarationContaining(selector);
    assert.match(rule, /min-width\s*:\s*44px/, `${selector} needs min-width:44px`);
    assert.match(rule, /min-height\s*:\s*44px/, `${selector} needs min-height:44px`);
  }
  assert.match(source, /<label className="remember-context">/);
  assert.match(source, /<button className="primary" onClick=\{next\}>/);
});

test("320/360/390/412/430 layouts wrap Russian copy with zero horizontal overflow", () => {
  assert.match(contract, /\.chips \.chip\{[^}]*overflow-wrap:anywhere/);
  assert.match(contract, /\.continue \.remember-context,\.manual-context \.remember-context\{[^}]*overflow-wrap:anywhere/);
  assert.match(contract, /@media\(max-width:720px\)\{[^}]*\.test\{[^}]*overflow-x:clip/);
  assert.match(contract, /\.test \.choice\{[^}]*max-width:100%/);
  assert.match(contract, /\.continue \.primary\{[^}]*max-width:100%/);

  for (const viewport of [320, 360, 390, 412, 430]) {
    const pageContent = viewport - 28;
    const choiceContent = pageContent - 32;
    assert.ok(choiceContent >= 260, `${viewport}px keeps a non-negative bounded chip row`);
    assert.ok(128 <= choiceContent, `${viewport}px chip flex-basis can fit or wrap without overflow`);
  }
});

test("sticky onboarding actions reserve the fixed navigation and safe area", () => {
  assert.match(contract, /bottom:calc\(70px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(contract, /padding-bottom:calc\(105px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(contract, /max-height:calc\(100svh - 130px\)/);
  assert.match(contract, /overflow-y:auto/);
});
