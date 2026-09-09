import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const assetDirectory = join(process.cwd(), "dist", "assets");
const budgets = Object.freeze({
  maxJavaScriptFileBytes: 450_000,
  maxJavaScriptFileGzipBytes: 150_000,
  maxTotalJavaScriptBytes: 650_000,
  maxCssFileBytes: 100_000,
});

let names;
try {
  names = readdirSync(assetDirectory);
} catch {
  console.error("Bundle budget check requires a completed `npm run build`.");
  process.exit(2);
}

const assets = names.map((name) => {
  const path = join(assetDirectory, name);
  const bytes = statSync(path).size;
  return { name, path, bytes, gzipBytes: gzipSync(readFileSync(path)).length };
});
const scripts = assets.filter(({ name }) => name.endsWith(".js"));
const styles = assets.filter(({ name }) => name.endsWith(".css"));
const violations = [];

for (const asset of scripts) {
  if (asset.bytes > budgets.maxJavaScriptFileBytes)
    violations.push(`${asset.name}: ${asset.bytes} B > JS file budget`);
  if (asset.gzipBytes > budgets.maxJavaScriptFileGzipBytes)
    violations.push(
      `${asset.name}: ${asset.gzipBytes} B gzip > JS gzip budget`,
    );
}
for (const asset of styles)
  if (asset.bytes > budgets.maxCssFileBytes)
    violations.push(`${asset.name}: ${asset.bytes} B > CSS file budget`);
const totalJavaScript = scripts.reduce(
  (total, asset) => total + asset.bytes,
  0,
);
if (totalJavaScript > budgets.maxTotalJavaScriptBytes)
  violations.push(`total JavaScript: ${totalJavaScript} B > total budget`);

if (violations.length) {
  console.error("Bundle budget failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Bundle budget passed: ${scripts.length} JS chunks, ${totalJavaScript} B total.`,
);
