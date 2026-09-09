import { spawnSync } from "node:child_process";

const blockedRoots = ["qa-evidence/", "GARMENT-REAL-", "eval-data/"];
const blockedNames = new Set([".env", ".env.local", "id_rsa", "id_ed25519"]);
const blockedExtensions = [".pem", ".p12", ".pfx", ".key"];

const git = spawnSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  windowsHide: true,
});

if (git.status !== 0) {
  console.error("Repository boundary check requires a Git worktree.");
  process.exit(2);
}

const tracked = git.stdout.split("\0").filter(Boolean);
const violations = tracked.filter((file) => {
  const normalized = file.replaceAll("\\", "/");
  const name = normalized.split("/").at(-1).toLowerCase();
  return blockedRoots.some((root) => normalized.startsWith(root))
    || blockedNames.has(name)
    || blockedExtensions.some((extension) => name.endsWith(extension));
});

if (violations.length) {
  console.error("Repository publication boundary failed. Tracked files requiring review:");
  for (const file of violations) console.error(`- ${file}`);
  console.error("Move approved datasets to a separately governed store or explicitly redesign this policy.");
  process.exit(1);
}

console.log(`Repository publication boundary passed for ${tracked.length} tracked files.`);
