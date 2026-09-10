import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const files = ["src", "server"]
  .flatMap((root) =>
    readdirSync(root, { recursive: true })
      .filter((file) => file.endsWith(".test.js"))
      .map((file) => path.join(root, file)),
  )
  .sort();
if (!files.length) throw new Error("No tests discovered");
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  windowsHide: true,
});
process.exit(result.status ?? 1);
