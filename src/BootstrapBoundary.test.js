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
