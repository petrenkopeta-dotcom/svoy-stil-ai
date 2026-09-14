import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(
  new URL("./bootstrap.jsx", import.meta.url),
  "utf8",
);
const application = readFileSync(
  new URL("./main.jsx", import.meta.url),
  "utf8",
);
const legacy = readFileSync(
  new URL("./LegacyApp.jsx", import.meta.url),
  "utf8",
);

test("HTML mounts only the explicit bootstrap module", () => {
  assert.match(html, /src="\/src\/bootstrap\.jsx"/);
  assert.doesNotMatch(html, /src="\/src\/main\.jsx"/);
});

test("bootstrap owns DOM mounting while the application exports the UI root", () => {
  assert.match(bootstrap, /createRoot\(rootElement\)\.render/);
  assert.match(bootstrap, /if \(!rootElement\) throw new Error/);
  assert.match(application, /export function App\(\)/);
  assert.doesNotMatch(application, /createRoot|document\.getElementById/);
});

test("VK entry does not eagerly load local-prototype styles or persistence", () => {
  assert.ok(
    bootstrap.indexOf('import "./vkLaunchEntry.js"') <
      bootstrap.indexOf("import React"),
  );
  assert.match(bootstrap, /import\("\.\/LegacyApp\.jsx"\)/);
  assert.match(bootstrap, /import\("\.\/VkStagingApp\.jsx"\)/);
  assert.doesNotMatch(
    bootstrap,
    /import\s+[^;]+from\s+["']\.\/(?:main|ContextProvider)/,
  );
  assert.doesNotMatch(
    bootstrap,
    /<ContextProvider|localStorage|sessionStorage/,
  );
  assert.match(
    bootstrap,
    /isVkStaging\s*\?\s*<VkStagingApp\s*\/>\s*:\s*<LegacyApp\s*\/>/,
  );
  assert.match(legacy, /<ContextProvider>\s*<App\s*\/>\s*<\/ContextProvider>/);
  assert.match(html, /<title>Надеть есть что<\/title>/);
});
