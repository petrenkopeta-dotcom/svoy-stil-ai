import { createHash } from "node:crypto";
import {
  canonicalProfile,
  profileEtag,
  validProfileMutation,
  validStoredProfile,
} from "../src/vkProfileContract.js";

// Resource defaults for the gated contour, not an approved data-retention policy.
export const PROFILE_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
export const PROFILE_RECEIPTS_PER_OWNER = 128;
export const PROFILE_RECEIPTS_TOTAL = 4096;
const fail = (code, status) => Object.assign(new Error(code), { code, status });
const protocolErrors = new Set([
  "profile_precondition_required",
  "profile_stale",
  "profile_mutation_conflict",
  "profile_receipts_full",
  "invalid_profile",
]);
export function createVkProfileStore({
  db,
  enabled = false,
  now = Date.now,
  receiptTtlMs = PROFILE_RECEIPT_TTL_MS,
  maxReceiptsPerOwner = PROFILE_RECEIPTS_PER_OWNER,
  maxReceiptsTotal = PROFILE_RECEIPTS_TOTAL,
} = {}) {
  if (enabled !== true) throw fail("profile_release_unapproved", 503);
  if (
    ![receiptTtlMs, maxReceiptsPerOwner, maxReceiptsTotal].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    receiptTtlMs > PROFILE_RECEIPT_TTL_MS ||
    maxReceiptsPerOwner > PROFILE_RECEIPTS_PER_OWNER ||
    maxReceiptsTotal > PROFILE_RECEIPTS_TOTAL
  )
    throw new Error("profile_store_configuration_invalid");
  db.exec(
    "CREATE TABLE IF NOT EXISTS staging_profiles (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS staging_profile_receipts (owner TEXT NOT NULL, mutation TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(owner, mutation)); CREATE INDEX IF NOT EXISTS staging_profile_receipts_expiry ON staging_profile_receipts(expires)",
  );
  const read = (owner) => {
    const row = db
      .prepare("SELECT revision,value FROM staging_profiles WHERE owner=?")
      .get(owner);
    if (!row) return { profile: null, etag: profileEtag(0) };
    const profile = JSON.parse(row.value);
    if (!validStoredProfile(profile) || profile.revision !== row.revision)
      throw new Error("corrupt_profile");
    return { profile, etag: profileEtag(profile.revision) };
  };
  const guard = (action) => {
    try {
      return action();
    } catch (error) {
      if (protocolErrors.has(error.code)) throw error;
      throw fail("storage_unavailable", 503);
    }
  };
  return Object.freeze({
    read: (owner) => guard(() => read(owner)),
    write(owner, mutation, ifMatch) {
      if (!validProfileMutation(mutation)) throw fail("invalid_profile", 422);
      if (
        !/^"profile-(0|[1-9]\d*)"$/.test(ifMatch || "") ||
        !Number.isSafeInteger(Number(ifMatch.slice(9, -1)))
      )
        throw fail("profile_precondition_required", 428);
      return guard(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const time = now();
          const content = canonicalProfile(mutation);
          const hash = createHash("sha256").update(content).digest("hex");
          db.prepare(
            "DELETE FROM staging_profile_receipts WHERE expires<=?",
          ).run(time);
          const receipt = db
            .prepare(
              "SELECT hash,result FROM staging_profile_receipts WHERE owner=? AND mutation=?",
            )
            .get(owner, mutation.mutationId);
          const current = read(owner);
          if (receipt) {
            if (receipt.hash !== hash)
              throw fail("profile_mutation_conflict", 409);
            const profile = JSON.parse(receipt.result);
            if (
              !validStoredProfile(profile) ||
              profile.lastMutationId !== mutation.mutationId ||
              createHash("sha256")
                .update(canonicalProfile(profile))
                .digest("hex") !== receipt.hash ||
              !current.profile ||
              current.profile.revision < profile.revision
            )
              throw new Error("corrupt_receipt");
            db.exec("COMMIT");
            return { profile, etag: profileEtag(profile.revision) };
          }
          if (current.etag !== ifMatch) throw fail("profile_stale", 412);
          if (
            db
              .prepare(
                "SELECT count(*) n FROM staging_profile_receipts WHERE owner=?",
              )
              .get(owner).n >= maxReceiptsPerOwner ||
            db.prepare("SELECT count(*) n FROM staging_profile_receipts").get()
              .n >= maxReceiptsTotal
          )
            throw fail("profile_receipts_full", 429);
          const profile = {
            ...JSON.parse(content),
            revision: (current.profile?.revision || 0) + 1,
            updatedAt: time,
            lastMutationId: mutation.mutationId,
          };
          if (!validStoredProfile(profile))
            throw new Error("profile_revision_invalid");
          db.prepare(
            "INSERT INTO staging_profiles VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,value=excluded.value",
          ).run(owner, profile.revision, JSON.stringify(profile));
          db.prepare(
            "INSERT INTO staging_profile_receipts VALUES (?,?,?,?,?)",
          ).run(
            owner,
            mutation.mutationId,
            hash,
            JSON.stringify(profile),
            time + receiptTtlMs,
          );
          db.exec("COMMIT");
          return { profile, etag: profileEtag(profile.revision) };
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      });
    },
  });
}
