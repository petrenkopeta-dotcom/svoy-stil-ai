import { CLOUD_DOMAINS } from "./CloudPersistenceRepository.js";

const encode = encodeURIComponent;
const payloadFor = (domain, mutation) => ({
  ...(domain === "profile" || domain === "preferences" ? {} : { id: mutation.entityId }),
  user_id: mutation.userId,
  payload: mutation.value,
  version: Number(mutation.expectedVersion ?? 1),
  idempotency_key: mutation.idempotencyKey,
  ...(domain === "profile" && mutation.value?.avatarIndex != null ? { avatar_index: mutation.value.avatarIndex } : {}),
  ...(domain === "preferences" ? { preferences: mutation.value } : {}),
  ...(domain === "consent" ? { purpose: mutation.value.purpose, policy_version: mutation.value.policyVersion, granted_at: mutation.value.grantedAt, revoked_at: mutation.value.revokedAt ?? null } : {}),
});

export function createSupabaseDataPort({ request } = {}) {
  if (typeof request !== "function") return null;
  return Object.freeze({
    async upsert(domain, mutation) {
      const spec = CLOUD_DOMAINS[domain];
      if (!spec) throw new TypeError(`Unsupported cloud domain: ${domain}`);
      const rows = await request({ method: "POST", path: `/rest/v1/${spec.table}?on_conflict=${spec.key}`, headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: payloadFor(domain, mutation) });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw Object.assign(new Error("server_acknowledgement_missing"), { code: "server_acknowledgement_missing" });
      return { version: row.version, idempotencyKey: row.idempotency_key, row };
    },
    async read(domain, userId, entityId, idempotencyKey) {
      const spec = CLOUD_DOMAINS[domain];
      const entityFilter = domain === "profile" || domain === "preferences" ? `&idempotency_key=eq.${encode(idempotencyKey)}` : domain === "consent" ? `&idempotency_key=eq.${encode(idempotencyKey)}` : `&id=eq.${encode(entityId)}`;
      const rows = await request({ method: "GET", path: `/rest/v1/${spec.table}?select=*&user_id=eq.${encode(userId)}${entityFilter}&limit=1` });
      return Array.isArray(rows) ? rows[0] ?? null : rows ?? null;
    },
    async uploadPhoto({ blob, userId, entityId, idempotencyKey, contentType }) {
      const path = `${encode(userId)}/${encode(entityId)}/${encode(idempotencyKey)}`;
      const response = await request({ method: "POST", path: `/storage/v1/object/wardrobe-photos/${path}`, headers: { "Content-Type": contentType || blob.type, "x-upsert": "true" }, body: blob, rawBody: true, returnResponse: true });
      const etag = response?.headers?.get?.("etag");
      if (!response?.ok || !etag) throw Object.assign(new Error("object_receipt_missing"), { code: "object_receipt_missing" });
      return { durable: true, bucket: "wardrobe-photos", path: `${userId}/${entityId}/${idempotencyKey}`, etag };
    },
  });
}
