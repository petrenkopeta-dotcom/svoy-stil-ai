import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function configurationChecks(env) {
  let origin = false;
  try {
    const url = new URL(env.STAGING_ORIGIN);
    origin =
      url.protocol === "https:" &&
      url.origin === env.STAGING_ORIGIN &&
      !url.username &&
      !url.password;
  } catch {
    /* Fail closed without echoing input. */
  }
  return {
    origin,
    appId: /^[1-9]\d*$/.test(env.VK_APP_ID || ""),
    secretPresent:
      typeof env.VK_APP_SECRET === "string" && env.VK_APP_SECRET.length >= 16,
    dataDirectory: env.STAGING_DATA_DIR === "/var/lib/stylist",
    port: !env.PORT || env.PORT === "8788",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const checks = configurationChecks(process.env);
  checks.linux = process.platform === "linux";
  checks.node = process.versions.node === "24.17.0";
  checks.sqlite = false;
  try {
    await import("node:sqlite");
    checks.sqlite = true;
  } catch {
    /* Fixed boolean only. */
  }
  checks.noHostSwap = false;
  if (checks.linux) {
    try {
      checks.noHostSwap =
        readFileSync("/proc/swaps", "utf8").trim().split("\n").length === 1;
    } catch {
      /* Unknown is failure. */
    }
  }
  const baselinePassed = Object.values(checks).every((value) => value === true);
  console.log(
    JSON.stringify({
      checks,
      baselinePassed,
      deploymentReady: false,
      blockers: [
        "host_isolation_unverified",
        "tls_and_log_policy_unverified",
        "tester_access_unapproved",
        "finite_retention_unapproved",
        "billing_controller_unconnected",
        "release_evidence_missing",
      ],
    }),
  );
  // Baseline is not release approval. Deployment preflight always blocks this revision.
  process.exitCode = 2;
}
