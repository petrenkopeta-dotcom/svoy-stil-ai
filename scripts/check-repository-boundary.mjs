import { spawnSync } from "node:child_process";

const blockedRoots = [
  "qa-evidence/",
  "GARMENT-REAL-",
  "eval-data/",
  "docs/ab-test-visuals/",
  "docs/audit/",
];
const blockedNames = new Set([".env", ".env.local", "id_rsa", "id_ed25519"]);
const blockedExtensions = [
  ".pem",
  ".p12",
  ".pfx",
  ".key",
  ".sqlite",
  ".sqlite-wal",
  ".sqlite-shm",
  ".db",
  ".db-wal",
  ".db-shm",
];
const allowedReviewDocs = new Set([
  "docs/eval-metrics.md",
  "docs/stylist-reasoning-qa-v1.md",
  "docs/qa/BACKLOG-06-photo-privacy-browser-smoke.md",
  "docs/qa/BACKLOG-08-mobile-browser-matrix.md",
  "docs/qa/NEXT-04-RC2-SHA256.txt",
  "docs/qa/NEXT-05-BASELINE-ALLOWLIST.txt",
]);
const localArtifactName =
  /(?:qa|eval|regression|evidence|notion-sync|(?:^|-)report)(?:[-_.]|$)/i;

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
  return (
    blockedRoots.some((root) => normalized.startsWith(root)) ||
    (normalized.startsWith("docs/qa/") && !allowedReviewDocs.has(normalized)) ||
    (normalized.startsWith("docs/") &&
      localArtifactName.test(name) &&
      !allowedReviewDocs.has(normalized)) ||
    blockedNames.has(name) ||
    blockedExtensions.some((extension) => name.endsWith(extension))
  );
});

if (violations.length) {
  console.error(
    "Repository publication boundary failed. Tracked files requiring review:",
  );
  for (const file of violations) console.error(`- ${file}`);
  console.error(
    "Move approved datasets to a separately governed store or explicitly redesign this policy.",
  );
  process.exit(1);
}

console.log(
  `Repository publication boundary passed for ${tracked.length} tracked files.`,
);
