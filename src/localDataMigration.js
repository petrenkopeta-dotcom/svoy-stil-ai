const clone = (value) => structuredClone(value);
const keyOf = (domain, record) => `${domain}:${record.id ?? record.localId}`;

export function createMigrationPreview(local) {
  return { wardrobe: local.wardrobe?.length || 0, outfits: local.outfits?.length || 0, learning: local.learningProfile ? 1 : 0, photos: (local.wardrobe || []).filter((x) => x.photoId || x.photo).length };
}

export async function migrateLocalData({ local, remote, upload, includePhotos = false, photoConsent = false, idempotencyKey }) {
  if (!idempotencyKey) throw new TypeError("idempotencyKey required");
  if (includePhotos && !photoConsent) return { status: "photo_consent_required", localPreserved: true };
  const existing = await remote.listMigrationKeys(idempotencyKey);
  const completed = new Set(existing || []); const migrated = []; const conflicts = [];
  for (const domain of ["wardrobe", "outfits"]) for (const record of local[domain] || []) {
    const key = keyOf(domain, record); if (completed.has(key)) continue;
    const result = await remote.upsert(domain, clone(record), { idempotencyKey: `${idempotencyKey}:${key}`, conflict: "newer_updated_at_wins" });
    if (result?.conflict) conflicts.push({ key, resolution: result.resolution || "remote_preserved" });
    if (includePhotos && (record.photoId || record.photo)) await upload(record, { idempotencyKey: `${idempotencyKey}:photo:${record.id}` });
    migrated.push(key);
  }
  if (local.learningProfile && !completed.has("learning:profile")) { await remote.upsert("learningProfile", clone(local.learningProfile), { idempotencyKey: `${idempotencyKey}:learning:profile` }); migrated.push("learning:profile"); }
  return { status: "migrated", migrated, conflicts, localPreserved: true };
}
