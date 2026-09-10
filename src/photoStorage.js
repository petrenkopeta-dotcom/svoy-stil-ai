export const PHOTO_STORAGE_CODES = Object.freeze({ CONSENT_REQUIRED: "consent_required", INVALID_PHOTO: "invalid_photo", QUOTA_EXCEEDED: "quota_exceeded", STORAGE_UNAVAILABLE: "storage_unavailable", NOT_FOUND: "not_found" });
export const PHOTO_POLICY_VERSION = "local-photo-storage-v1";
export const DEFAULT_PHOTO_RETENTION_MS = 30 * 86400000;
export const MAX_PHOTO_RETENTION_MS = 365 * 86400000;

export class PhotoStorageError extends Error {
  constructor(code, message, options = {}) { super(message, options); this.name = "PhotoStorageError"; this.code = code; }
}

const clone = (value) => value == null ? value : structuredClone(value);
const classify = (error) => new PhotoStorageError(error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014 ? PHOTO_STORAGE_CODES.QUOTA_EXCEEDED : PHOTO_STORAGE_CODES.STORAGE_UNAVAILABLE, "Photo storage operation failed", { cause: error });

export class MemoryPhotoBackend {
  constructor() { this.records = new Map(); }
  async put(value) { this.records.set(value.id, clone(value)); }
  async get(id) { return clone(this.records.get(id) ?? null); }
  async getAll() { return [...this.records.values()].map(clone); }
  async delete(id) { this.records.delete(id); }
  async clear() { this.records.clear(); }
}

export class IndexedDbPhotoBackend {
  constructor({ indexedDB = globalThis.indexedDB, dbName = "ai-stylist-photos", storeName = "photos" } = {}) {
    if (!indexedDB?.open) throw new PhotoStorageError(PHOTO_STORAGE_CODES.STORAGE_UNAVAILABLE, "IndexedDB is unavailable");
    Object.assign(this, { indexedDB, dbName, storeName, database: null });
  }
  async open() {
    if (this.database) return this.database;
    this.database = await new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName, { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
    return this.database;
  }
  async request(mode, operation) {
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, mode);
        const request = operation(tx.objectStore(this.storeName));
        let result;
        request.onsuccess = () => { result = request.result; if (mode === "readonly") resolve(result); };
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
        if (mode !== "readonly") tx.oncomplete = () => resolve(result);
      });
    } catch (error) { throw error instanceof PhotoStorageError ? error : classify(error); }
  }
  put(value) { return this.request("readwrite", (store) => store.put(value)); }
  get(id) { return this.request("readonly", (store) => store.get(id)).then((value) => value ?? null); }
  getAll() { return this.request("readonly", (store) => store.getAll()); }
  delete(id) { return this.request("readwrite", (store) => store.delete(id)); }
  clear() { return this.request("readwrite", (store) => store.clear()); }
}

export function createPhotoStorage({ backend, validateCutout, indexedDB = globalThis.indexedDB, now = () => Date.now(), randomId = () => globalThis.crypto?.randomUUID?.() || `photo-${now()}-${Math.random().toString(36).slice(2)}`, retentionMs = DEFAULT_PHOTO_RETENTION_MS } = {}) {
  const durable = backend || (indexedDB?.open ? new IndexedDbPhotoBackend({ indexedDB }) : null);
  const active = durable || new MemoryPhotoBackend();
  const persisted = Boolean(durable);
  const ttl = Math.min(Math.max(1, retentionMs), MAX_PHOTO_RETENTION_MS);
  const safe = async (action) => { try { return await action(); } catch (error) { throw error instanceof PhotoStorageError ? error : classify(error); } };
  return Object.freeze({
    backend: active, persisted,
    async save(blob, consent, metadata = {}) {
      if (consent?.granted !== true || consent?.policyVersion !== PHOTO_POLICY_VERSION) throw new PhotoStorageError(PHOTO_STORAGE_CODES.CONSENT_REQUIRED, "Explicit photo storage consent is required");
      if (!(blob instanceof Blob) || blob.size < 1 || !blob.type.startsWith("image/")) throw new PhotoStorageError(PHOTO_STORAGE_CODES.INVALID_PHOTO, "A non-empty image Blob is required");
      // An application-owned validator must inspect these exact bytes. Metadata
      // and client supplied safety flags are never evidence of safe pixels.
      let verified = false;
      try { verified = typeof validateCutout === "function" && await validateCutout(blob) === true; } catch { /* fail closed */ }
      if (!verified) throw new PhotoStorageError("unsafe_photo", "Сохранение фото недоступно: проверка отсутствия людей и фона не завершена");
      const createdAt = now();
      const record = { id: randomId(), blob, createdAt, expiresAt: createdAt + ttl, consent: { policyVersion: consent.policyVersion, grantedAt: consent.grantedAt || new Date(createdAt).toISOString() }, metadata: clone(metadata) };
      await safe(() => active.put(record));
      return { id: record.id, createdAt, expiresAt: record.expiresAt, meta: { persisted } };
    },
    async get(id) {
      const record = await safe(() => active.get(id));
      if (!record) throw new PhotoStorageError(PHOTO_STORAGE_CODES.NOT_FOUND, "Photo was not found");
      if (record.expiresAt <= now()) { await safe(() => active.delete(id)); throw new PhotoStorageError(PHOTO_STORAGE_CODES.NOT_FOUND, "Photo expired and was deleted"); }
      return record;
    },
    async delete(id) { const existed = await safe(() => active.get(id)); await safe(() => active.delete(id)); return { receiptVersion: "photo-delete-receipt-v1", id, deleted: Boolean(existed), deletedAt: now() }; },
    async deleteExpired() { const records = await safe(() => active.getAll()); const expired = records.filter((record) => record.expiresAt <= now()); await Promise.all(expired.map((record) => safe(() => active.delete(record.id)))); return { deleted: expired.length }; },
    async deleteAll() { await safe(() => active.clear()); },
  });
}

export async function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl || "");
  if (!match) throw new PhotoStorageError(PHOTO_STORAGE_CODES.INVALID_PHOTO, "Unsupported legacy data URL");
  const compact = match[2].replace(/\s/g, "");
  const binary = typeof atob === "function" ? atob(compact) : Buffer.from(compact, "base64").toString("binary");
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: match[1].toLowerCase() });
}

/** Copy-first migration. Persist `items` before discarding `backup`; call rollback when that write fails. */
export async function prepareLegacyPhotoMigration(items, photoStorage, consent, { fields = ["photo", "image", "imageUrl", "photoUrl"] } = {}) {
  const migrated = clone(items); const backup = []; const createdPhotoIds = [];
  try {
    for (let index = 0; index < migrated.length; index += 1) for (const field of fields) {
      const value = migrated[index]?.[field];
      if (typeof value !== "string" || !value.startsWith("data:image/")) continue;
      const saved = await photoStorage.save(await dataUrlToBlob(value), consent, { migratedFrom: field });
      backup.push({ index, field, dataUrl: value }); createdPhotoIds.push(saved.id); migrated[index][field] = { photoId: saved.id };
    }
  } catch (error) { await Promise.allSettled(createdPhotoIds.map((id) => photoStorage.delete(id))); throw error; }
  return Object.freeze({ items: migrated, backup: clone(backup), createdPhotoIds: [...createdPhotoIds], async rollback() { await Promise.allSettled(createdPhotoIds.map((id) => photoStorage.delete(id))); return clone(items); } });
}
