import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function discoverTests() {
  return ["src", "server", "scripts"]
    .flatMap((root) =>
      readdirSync(root, { recursive: true })
        .filter((file) => file.endsWith(".test.js"))
        .map((file) => path.join(root, file)),
    )
    .sort();
}

export function testPhases(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  if (new Set(normalized).size !== files.length)
    throw new Error("Duplicate test files");
  const perf = "src/stylistCandidateEngine.test.js";
  const index = normalized.indexOf(perf);
  if (index === -1) throw new Error("Performance test file missing");
  const regular = files.filter((_, position) => position !== index);
  if (!regular.length) throw new Error("Regular test files missing");
  return [regular, [files[index]]];
}

// Synchronous phases ensure the entire performance file runs after all other
// test-file processes have exited. Neither phase can mask the other's failure.
export function runTests(files, spawn = spawnSync) {
  const phases = testPhases(files);
  let failed = false;
  for (const [index, phase] of phases.entries()) {
    try {
      const result = spawn(
        process.execPath,
        ["--test", `--test-concurrency=${index === 0 ? 2 : 1}`, ...phase],
        { stdio: "inherit", windowsHide: true },
      );
      if (result.status !== 0 || result.error || result.signal) failed = true;
    } catch {
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = runTests(discoverTests());
