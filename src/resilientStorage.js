import {
  createLocalRepositories,
  REPOSITORY_RESULT_CODES,
  RepositoryError,
  STORAGE_SCHEMA_VERSION,
} from "./storageRepositories.js";

export const DEVICE_NOT_SAVED_MESSAGE = "Не сохранено на устройстве";

const clone = (value) => value == null ? value : structuredClone(value);

function resultCode(error) {
  return error instanceof RepositoryError
    ? error.code
    : REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE;
}

/** JSON key/value boundary for onboarding and UI preferences. */
export function createResilientStorageFacade(storage) {
  const memory = new Map();
  const statuses = new Map();

  return {
    read(key, fallback) {
      if (memory.has(key)) return { data: clone(memory.get(key)), meta: { ...statuses.get(key), source: "memory" } };
      try {
        const raw = storage?.getItem?.(key);
        if (raw == null) return { data: clone(fallback), meta: { persisted: true, source: "device" } };
        const data = JSON.parse(raw);
        memory.set(key, data);
        statuses.set(key, { persisted: true });
        return { data: clone(data), meta: { persisted: true, source: "device" } };
      } catch (error) {
        const code = error instanceof SyntaxError
          ? REPOSITORY_RESULT_CODES.CORRUPT_DATA
          : REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE;
        memory.set(key, clone(fallback));
        const meta = { persisted: false, code, message: DEVICE_NOT_SAVED_MESSAGE };
        statuses.set(key, meta);
        return { data: clone(fallback), meta: { ...meta, source: "memory" } };
      }
    },

    write(key, value) {
      memory.set(key, clone(value));
      let raw;
      try {
        raw = JSON.stringify(value);
      } catch {
        const meta = { persisted: false, code: REPOSITORY_RESULT_CODES.SERIALIZATION_FAILED, message: DEVICE_NOT_SAVED_MESSAGE };
        statuses.set(key, meta);
        return { data: clone(value), meta: { ...meta, source: "memory" } };
      }
      try {
        if (!storage?.setItem) throw new RepositoryError(REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE, "Storage is unavailable");
        storage.setItem(key, raw);
        statuses.set(key, { persisted: true });
        return { data: clone(value), meta: { persisted: true, source: "device" } };
      } catch (error) {
        const code = error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014
          ? REPOSITORY_RESULT_CODES.QUOTA_EXCEEDED
          : resultCode(error);
        const meta = { persisted: false, code, message: DEVICE_NOT_SAVED_MESSAGE };
        statuses.set(key, meta);
        return { data: clone(value), meta: { ...meta, source: "memory" } };
      }
    },
  };
}

const EMPTY = Object.freeze({
  wardrobe: () => [],
  outfits: () => [],
  learningProfile: () => null,
  consent: () => ({ granted: false, policyVersion: null, grantedAt: null }),
});

function resilientRepository(repository, empty) {
  let memory = empty();
  let initialized = false;
  let lastMeta = { schemaVersion: STORAGE_SCHEMA_VERSION, persisted: false };
  return {
    load() {
      if (initialized) return { data: clone(memory), meta: { ...lastMeta, source: "memory" } };
      try {
        const result = repository.load();
        memory = clone(result.data);
        initialized = true;
        const corrupt = result.meta.warning?.startsWith("corrupt");
        lastMeta = { ...result.meta, persisted: !corrupt, ...(corrupt ? { code: REPOSITORY_RESULT_CODES.CORRUPT_DATA, message: DEVICE_NOT_SAVED_MESSAGE } : {}) };
        return { ...result, meta: { ...lastMeta, source: corrupt ? "memory" : "device" } };
      } catch (error) {
        initialized = true;
        lastMeta = { schemaVersion: STORAGE_SCHEMA_VERSION, persisted: false, code: resultCode(error), message: DEVICE_NOT_SAVED_MESSAGE };
        return { data: clone(memory), meta: { ...lastMeta, source: "memory" } };
      }
    },
    save(data) {
      memory = clone(data);
      initialized = true;
      try {
        const result = repository.save(data);
        lastMeta = { ...result.meta, persisted: true };
        return { ...result, meta: { ...lastMeta, source: "device" } };
      } catch (error) {
        lastMeta = { schemaVersion: STORAGE_SCHEMA_VERSION, persisted: false, code: resultCode(error), message: DEVICE_NOT_SAVED_MESSAGE };
        return { data: clone(memory), meta: { ...lastMeta, source: "memory" } };
      }
    },
    export() { return clone(memory); },
  };
}

/** Minimal integration adapter: use this in App instead of direct localStorage calls. */
export function createOfflineFirstStorage(options = {}) {
  const { storage: suppliedStorage, ...repositoryOptions } = options;
  let storage = suppliedStorage;
  if (!("storage" in options)) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  let strictRepositories;
  try {
    strictRepositories = createLocalRepositories({ storage, ...repositoryOptions });
  } catch {
    const unavailable = { load() { throw new RepositoryError(REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE, "Storage is unavailable"); }, save() { throw new RepositoryError(REPOSITORY_RESULT_CODES.STORAGE_UNAVAILABLE, "Storage is unavailable"); } };
    strictRepositories = Object.fromEntries(Object.keys(EMPTY).map((domain) => [domain, unavailable]));
  }
  const repositories = Object.fromEntries(Object.entries(EMPTY).map(([domain, empty]) => [domain, resilientRepository(strictRepositories[domain], empty)]));
  return { preferences: createResilientStorageFacade(storage), repositories };
}
