import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
// Prevent accidental VITE_* secrets/settings from entering the staging bundle.
if (
  Object.keys(process.env).some(
    (key) => key.startsWith("VITE_") && key !== "VITE_VK_STAGING",
  )
) {
  process.stderr.write("staging_build_environment_rejected\n");
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "build",
      "--outDir",
      "artifacts/staging-build/dist-staging",
    ],
    {
      cwd: root,
      env: { ...process.env, VITE_VK_STAGING: "true" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  process.exitCode = result.status === 0 && !result.error ? 0 : 1;
  if (process.exitCode === 0) {
    // Unique local directory: never overwrite an earlier release or its database.
    const target = path.join(
      root,
      "artifacts",
      `staging-package-${Date.now()}`,
    );
    mkdirSync(target, { recursive: true });
    cpSync(
      path.join(root, "artifacts/staging-build/dist-staging"),
      path.join(target, "dist-staging"),
      {
        recursive: true,
      },
    );
    const files = [
      ...readdirSync(path.join(root, "server"))
        .filter((name) => name.endsWith(".mjs"))
        .map((name) => `server/${name}`),
      "src/vkProfileContract.js",
      "src/vkWardrobeMetadataContract.js",
      "scripts/server-start.mjs",
      "scripts/server-preflight.mjs",
      "deploy/nginx-staging.conf",
      "deploy/staging.service",
      "deploy/staging.env.example",
    ];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      cpSync(path.join(root, file), path.join(target, file));
    }
    writeFileSync(
      path.join(target, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    const runtime = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "await import('./scripts/server-start.mjs')",
      ],
      {
        cwd: target,
        stdio: "pipe",
        windowsHide: true,
      },
    );
    if (runtime.status !== 0) throw new Error("staging_package_import_failed");
    const commit = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    if (commit.status !== 0) throw new Error("staging_package_commit_missing");
    const inventory = readdirSync(target, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolute = path.join(entry.parentPath, entry.name);
        const bytes = readFileSync(absolute);
        return {
          path: path.relative(target, absolute).replaceAll("\\", "/"),
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    writeFileSync(
      path.join(target, "manifest.json"),
      JSON.stringify(
        {
          commit: commit.stdout.trim(),
          deploymentReady: false,
          files: inventory,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Staging package: ${target}`);
  }
}
