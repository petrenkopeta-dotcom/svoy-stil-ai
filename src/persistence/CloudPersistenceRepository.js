import { PERSISTENCE_STATUS, persistenceResult } from "./PersistenceResult.js";

export const CLOUD_DOMAINS = Object.freeze({
  profile: { table: "profiles", key: "user_id" },
  preferences: { table: "stylist_preferences", key: "user_id" },
  consent: { table: "user_consents", key: "user_id,purpose,policy_version" },
  wardrobe: { table: "wardrobe_items", key: "id" },
  outfits: { table: "saved_outfits", key: "id" },
  feedback: { table: "feedback_events", key: "id" },
  shoppingDrafts: { table: "shopping_drafts", key: "id" },
});

const clone = (value) => value == null ? value : structuredClone(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transient = (error) => error?.code === "offline" || error?.status === 408 || error?.status === 429 || error?.status >= 500;

export class MemoryOutbox {
  constructor() { this.entries = new Map(); }
  async put(entry) { this.entries.set(entry.idempotencyKey, clone(entry)); }
  async delete(key) { this.entries.delete(key); }
  async list() { return [...this.entries.values()].map(clone); }
}

function validateMutation(domain, mutation) {
  if (!CLOUD_DOMAINS[domain]) throw new TypeError(`Unsupported cloud domain: ${domain}`);
  if (!mutation?.idempotencyKey || !mutation?.entityId || !mutation?.userId) throw new TypeError("idempotencyKey, entityId and userId are required");
  if (domain === "consent" && (!mutation.value?.purpose || !mutation.value?.policyVersion || !mutation.value?.grantedAt)) throw new TypeError("consent purpose, policyVersion and grantedAt are required");
}

export function createCloudPersistenceRepository({ port, outbox = new MemoryOutbox(), now = () => new Date().toISOString(), sleep = wait, maxAttempts = 3, baseDelayMs = 100 } = {}) {
  const available = Boolean(port && typeof port.upsert === "function" && typeof port.read === "function");

  async function mutate(domain, mutation, { queueOnFailure = true } = {}) {
    validateMutation(domain, mutation);
    const pending = { domain, ...clone(mutation), state: "pending", queuedAt: now(), attempts: 0 };
    if (!available) {
      if (queueOnFailure) await outbox.put(pending);
      return persistenceResult(PERSISTENCE_STATUS.PENDING, { code: "provider_unavailable", idempotencyKey: mutation.idempotencyKey, queued: queueOnFailure });
    }

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const acknowledgement = await port.upsert(domain, { ...clone(mutation), attempt });
        const readBack = await port.read(domain, mutation.userId, mutation.entityId, mutation.idempotencyKey);
        if (!readBack) throw Object.assign(new Error("read_back_missing"), { code: "read_back_missing" });
        if (String(readBack.user_id) !== String(mutation.userId)) throw Object.assign(new Error("owner_verification_failed"), { code: "owner_verification_failed" });
        const expectedVersion = Number(acknowledgement?.version ?? mutation.expectedVersion ?? 1);
        if (Number(readBack.version) !== expectedVersion || readBack.idempotency_key !== mutation.idempotencyKey) {
          return persistenceResult(PERSISTENCE_STATUS.CONFLICT, { code: "read_back_version_mismatch", expectedVersion, actualVersion: readBack.version, idempotencyKey: mutation.idempotencyKey, server: clone(readBack) });
        }
        await outbox.delete(mutation.idempotencyKey);
        return persistenceResult(PERSISTENCE_STATUS.ACKNOWLEDGED, { idempotencyKey: mutation.idempotencyKey, version: expectedVersion, acknowledgement: clone(acknowledgement), entity: clone(readBack), verifiedAt: now() });
      } catch (error) {
        lastError = error;
        if (!transient(error) || attempt === maxAttempts) break;
        await sleep(baseDelayMs * (2 ** (attempt - 1)));
      }
    }
    if (queueOnFailure && transient(lastError)) {
      await outbox.put({ ...pending, attempts: maxAttempts, lastError: lastError?.code || "write_failed" });
      return persistenceResult(PERSISTENCE_STATUS.PENDING, { code: lastError?.code || "write_failed", idempotencyKey: mutation.idempotencyKey, queued: true });
    }
    return persistenceResult(PERSISTENCE_STATUS.REJECTED, { code: lastError?.code || "write_failed", idempotencyKey: mutation.idempotencyKey, queued: false });
  }

  return Object.freeze({
    available,
    mutate,
    async flush() {
      const results = [];
      for (const entry of await outbox.list()) results.push(await mutate(entry.domain, entry, { queueOnFailure: true }));
      return results;
    },
    async savePhoto({ blob, consent, userId, entityId, idempotencyKey, contentType }) {
      if (consent?.granted !== true || !consent?.policyVersion) return persistenceResult(PERSISTENCE_STATUS.REJECTED, { code: "consent_required", idempotencyKey });
      if (!available || typeof port.uploadPhoto !== "function") return persistenceResult(PERSISTENCE_STATUS.PENDING, { code: "provider_unavailable", idempotencyKey, queued: false });
      const receipt = await port.uploadPhoto({ blob, userId, entityId, idempotencyKey, contentType, consent });
      if (!receipt?.bucket || !receipt?.path || !receipt?.etag || receipt?.durable !== true) return persistenceResult(PERSISTENCE_STATUS.REJECTED, { code: "invalid_object_receipt", idempotencyKey });
      return persistenceResult(PERSISTENCE_STATUS.ACKNOWLEDGED, { idempotencyKey, objectReceipt: clone(receipt), verifiedAt: now() });
    },
  });
}
