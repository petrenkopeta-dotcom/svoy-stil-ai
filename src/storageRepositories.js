/**
 * Local persistence boundary for the closed alpha.
 *
 * Repositories deliberately expose no transport details. A future server adapter
 * must implement the same load/save/delete contract; this module never uploads
 * photos (or anything else) and does not pretend that a backend exists.
 */

export const LOCAL_OWNER_ID = "local-warm-mvp-user";
export const STORAGE_SCHEMA_VERSION = 1;
export const REPOSITORY_RESULT_CODES = Object.freeze({
  QUOTA_EXCEEDED: "quota_exceeded",
  STORAGE_UNAVAILABLE: "storage_unavailable",
  SERIALIZATION_FAILED: "serialization_failed",
  CORRUPT_DATA: "corrupt_data",
});

export class RepositoryError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "RepositoryError";
    this.code = code;
  }
}

const DOMAINS = Object.freeze({
  wardrobe: { empty: () => [], legacyKey: "as-wardrobe" },
  outfits: { empty: () => [], legacyKey: "as-saved" },
  learningProfile: { empty: () => null, legacyKey: "as-stylist-learning-v1" },
  consent: { empty: () => ({ granted: false, policyVersion: null, grantedAt: null }) },
});

const clone = (value) => value == null ? value : structuredClone(value);
const storageKey = (namespace, ownerId, domain) => `${namespace}:v${STORAGE_SCHEMA_VERSION}:${encodeURIComponent(ownerId)}:${domain}`;

function classifyStorageError(error) {
  if (error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014) {
    return new RepositoryError(REPOSITORY_RESULT_CODES.QUOTA_EXCEEDED, "Local storage quota was exceeded", { cause: error });
  }
  return new RepositoryError(REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE, "Local storage is unavailable", { cause: error });
}

function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new RepositoryError(REPOSITORY_RESULT_CODES.SERIALIZATION_FAILED, "Repository data is not serializable", { cause: error });
  }
}

function parseEnvelope(raw) {
  const envelope = JSON.parse(raw);
  if (!envelope || typeof envelope !== "object" || envelope.schemaVersion !== STORAGE_SCHEMA_VERSION || !("data" in envelope)) {
    throw new TypeError("Unsupported repository envelope");
  }
  return envelope;
}

function scrubTransientUrls(value) {
  if (typeof value === "string") return value.startsWith("blob:") ? null : value;
  if (Array.isArray(value)) return value.map(scrubTransientUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubTransientUrls(item)]));
}

export class LocalRepository {
  constructor({ storage, namespace, ownerId, domain, now }) {
    if (!DOMAINS[domain]) throw new TypeError(`Unsupported repository domain: ${domain}`);
    this.storage = storage;
    this.namespace = namespace;
    this.ownerId = ownerId;
    this.domain = domain;
    this.now = now;
    this.key = storageKey(namespace, ownerId, domain);
  }

  load() {
    let raw;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      throw classifyStorageError(error);
    }
    if (raw != null) {
      try {
        const envelope = parseEnvelope(raw);
        return { data: clone(envelope.data), meta: { schemaVersion: envelope.schemaVersion, migrated: false, recovered: false } };
      } catch {
        this.#quarantine(raw);
        return { data: DOMAINS[this.domain].empty(), meta: { schemaVersion: STORAGE_SCHEMA_VERSION, migrated: false, recovered: true, warning: "corrupt_data" } };
      }
    }
    return this.#migrateLegacy();
  }

  save(data) {
    const envelope = { schemaVersion: STORAGE_SCHEMA_VERSION, domain: this.domain, ownerId: this.ownerId, updatedAt: this.now(), data: clone(data) };
    const raw = serialize(envelope);
    try {
      this.storage.setItem(this.key, raw);
    } catch (error) {
      throw classifyStorageError(error);
    }
    return { data: clone(data), meta: { schemaVersion: STORAGE_SCHEMA_VERSION } };
  }

  delete() {
    try {
      this.storage.removeItem(this.key);
      if (this.ownerId === LOCAL_OWNER_ID && DOMAINS[this.domain].legacyKey) {
        this.storage.removeItem(DOMAINS[this.domain].legacyKey);
      }
    } catch (error) {
      throw classifyStorageError(error);
    }
  }

  reset() {
    const empty = DOMAINS[this.domain].empty();
    this.save(empty);
    return clone(empty);
  }

  export() {
    return scrubTransientUrls(this.load().data);
  }

  #migrateLegacy() {
    const legacyKey = this.ownerId === LOCAL_OWNER_ID ? DOMAINS[this.domain].legacyKey : null;
    if (!legacyKey) return { data: DOMAINS[this.domain].empty(), meta: { schemaVersion: STORAGE_SCHEMA_VERSION, migrated: false, recovered: false } };
    let raw;
    try {
      raw = this.storage.getItem(legacyKey);
    } catch (error) {
      throw classifyStorageError(error);
    }
    if (raw == null) return { data: DOMAINS[this.domain].empty(), meta: { schemaVersion: STORAGE_SCHEMA_VERSION, migrated: false, recovered: false } };
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      this.#quarantine(raw, legacyKey);
      return { data: DOMAINS[this.domain].empty(), meta: { schemaVersion: STORAGE_SCHEMA_VERSION, migrated: false, recovered: true, warning: "corrupt_legacy_data" } };
    }
    this.save(data); // legacy is retained if the new atomic write fails
    try { this.storage.removeItem(legacyKey); } catch { /* duplicate is safer than data loss */ }
    return { data: clone(data), meta: { schemaVersion: STORAGE_SCHEMA_VERSION, migrated: true, recovered: false, from: legacyKey } };
  }

  #quarantine(raw, sourceKey = this.key) {
    const quarantineKey = `${sourceKey}:corrupt:${this.now()}`;
    try { this.storage.setItem(quarantineKey, raw); } catch { /* best effort under quota/unavailable storage */ }
    try { this.storage.removeItem(sourceKey); } catch { /* recovery can still continue in memory */ }
  }
}

export function createLocalRepositories({
  storage = globalThis.localStorage,
  ownerId = LOCAL_OWNER_ID,
  namespace = "ai-stylist",
  now = () => new Date().toISOString(),
} = {}) {
  if (!storage) throw new RepositoryError("storage_unavailable", "A Storage-compatible adapter is required");
  const make = (domain) => new LocalRepository({ storage, namespace, ownerId, domain, now });
  const repositories = {
    wardrobe: make("wardrobe"),
    outfits: make("outfits"),
    learningProfile: make("learningProfile"),
    consent: make("consent"),
  };
  return {
    ...repositories,
    exportAll() {
      return {
        format: "ai-stylist-local-export",
        schemaVersion: STORAGE_SCHEMA_VERSION,
        ownerId,
        exportedAt: now(),
        data: Object.fromEntries(Object.entries(repositories).map(([name, repository]) => [name, repository.export()])),
      };
    },
    deleteAll() { Object.values(repositories).forEach((repository) => repository.delete()); },
    resetAll() { Object.values(repositories).forEach((repository) => repository.reset()); },
  };
}

/** Owns browser object URLs without persisting them. */
export function createObjectUrlRegistry(urlApi = globalThis.URL) {
  const urls = new Map();
  const release = (id) => {
    const url = urls.get(id);
    if (url) urlApi.revokeObjectURL(url);
    urls.delete(id);
  };
  return {
    create(id, blob) {
      release(id);
      const url = urlApi.createObjectURL(blob);
      urls.set(id, url);
      return url;
    },
    release,
    dispose() {
      [...urls.keys()].forEach(release);
    },
    get size() { return urls.size; },
  };
}
