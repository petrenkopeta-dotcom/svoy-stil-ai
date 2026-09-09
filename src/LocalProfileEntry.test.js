import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("./LocalProfileEntry.jsx", import.meta.url);
const stylesUrl = new URL("./LocalProfileEntry.css", import.meta.url);

test("local profile entry stays compact and moves local-only detail into the panel", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, />Профиль</);
  assert.doesNotMatch(source, />Профиль на устройстве</);
  assert.doesNotMatch(source, />Без аккаунта</);
  assert.doesNotMatch(source, /Войти|Синхронизировать|sign[ -]?in|login/i);
});

test("local profile entry is keyboard-native and exposes the dialog relationship", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /<button/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /aria-label=\{`Открыть профиль\./);
  assert.match(source, /onClick=\{onOpen\}/);
});

test("entry uses the selected 01-09 avatar sprite", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /local-profile-avatar/);
  assert.match(source, /backgroundPosition/);
});

test("mobile entry keeps only the compact avatar", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /local-profile-entry-label/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.header-profile-entry \.local-profile-entry-label \{[\s\S]*display: none;/);
});
