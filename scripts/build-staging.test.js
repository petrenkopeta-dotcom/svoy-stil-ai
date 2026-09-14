import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sentinel = "synthetic_dotenv_gate_sentinel";
async function fixture(t, filename) {
  const root = await mkdtemp(path.join(tmpdir(), "staging-build-input-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "node_modules/vite/bin"), { recursive: true });
  await copyFile(
    new URL("./build-staging.mjs", import.meta.url),
    path.join(root, "scripts/build-staging.mjs"),
  );
  // Detect invocation before any bundler/loader can ingest the synthetic file.
  await writeFile(
    path.join(root, "node_modules/vite/bin/vite.js"),
    "require('node:fs').writeFileSync('vite-invoked', 'yes'); process.exit(7);\n",
  );
  for (const args of [
    ["init", "--quiet"],
    [
      "-c",
      "user.name=Synthetic",
      "-c",
      "user.email=synthetic@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "synthetic fixture",
    ],
  ]) {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, "synthetic Git fixture must initialize");
  }
  await writeFile(
    path.join(root, filename),
    `VITE_REVIEW_SENTINEL=${sentinel}\n`,
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("VITE_")) delete env[key];
  const result = spawnSync(process.execPath, ["scripts/build-staging.mjs"], {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  return { root, result };
}

for (const filename of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]) {
  test(`staging refuses ${filename} before invoking Vite without exposing contents`, async (t) => {
    const { root, result } = await fixture(t, filename);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), "staging_build_dotenv_rejected");
    assert.equal((result.stdout + result.stderr).includes(sentinel), false);
    await assert.rejects(access(path.join(root, "vite-invoked")), {
      code: "ENOENT",
    });
    await assert.rejects(access(path.join(root, "artifacts")), {
      code: "ENOENT",
    });
  });
}

test("nonloaded .env.example template does not block the bundler", async (t) => {
  const { root, result } = await fixture(t, ".env.example");
  assert.equal(result.status, 1); // Intentional fake bundler exit7 is propagated as failure.
  assert.equal(result.stderr, "");
  await access(path.join(root, "vite-invoked"));
});
