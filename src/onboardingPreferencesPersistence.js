export const ONBOARDING_PREFERENCES_SCHEMA_VERSION = 1;
export const ONBOARDING_PREFERENCES_CONSENT_VERSION = "onboarding-preferences-v1";
export const ONBOARDING_PREFERENCES_STORAGE_KEY = "ai-stylist:onboarding-preferences:v1";
export const ONBOARDING_PREFERENCES_TRANSACTION_KEY = `${ONBOARDING_PREFERENCES_STORAGE_KEY}:transaction`;
export const LEGACY_ONBOARDING_PREFERENCE_KEYS = Object.freeze(["as-prefs"]);
export const ONBOARDING_PROGRESS_SESSION_KEY = "ai-stylist:onboarding-progress:v1";
export const LEGACY_DURABLE_ONBOARDING_PROGRESS_KEYS = Object.freeze(["as-started", "as-screen"]);

const clone = (value) => value == null ? value : structuredClone(value);
const getBrowserStorage = (name) => {
  try { return globalThis[name] ?? null; } catch { return null; }
};
const safely = (operation, fallback = null) => {
  try { return operation(); } catch { return fallback; }
};
const storageFailureCode = (error) => error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014
  ? "quota_exceeded"
  : "storage_unavailable";

function isCurrentRecord(record) {
  return record?.schemaVersion === ONBOARDING_PREFERENCES_SCHEMA_VERSION
    && record?.consent?.granted === true
    && record.consent.version === ONBOARDING_PREFERENCES_CONSENT_VERSION
    && record.preferences && typeof record.preferences === "object";
}

const recordVersion = (record) => Number.isSafeInteger(record?.version) && record.version >= 0 ? record.version : 0;
const sameRaw = (left, right) => left === right;

export function createOnboardingPreferencesPersistence({
  storage = getBrowserStorage("localStorage"),
  sessionStorage = getBrowserStorage("sessionStorage"),
  storageKey = ONBOARDING_PREFERENCES_STORAGE_KEY,
  now = () => new Date().toISOString(),
} = {}) {
  storage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  let draft = null;
  let progress = null;
  let durableVersion = null;
  let durableRaw = null;
  let recoveryRequired = false;
  const readRaw = (key = storageKey) => storage.getItem(key);
  const writeRaw = (key, value) => value == null ? storage.removeItem(key) : storage.setItem(key, value);
  const verifyRaw = (key, expected) => sameRaw(readRaw(key), expected);
  const transactionKey = `${storageKey}:transaction`;
  const clearTransaction = () => {
    storage.removeItem(transactionKey);
    return readRaw(transactionKey) == null;
  };
  const restoreSnapshot = (transaction, { republishPrevious = false } = {}) => {
    const current = readRaw(storageKey);
    if (sameRaw(current, transaction.previousRaw)) {
      if (republishPrevious) writeRaw(storageKey, transaction.previousRaw);
      return { restored: true, restoreVerified: verifyRaw(storageKey, transaction.previousRaw) };
    }
    if (!sameRaw(current, transaction.candidateRaw)) return { restored: false, restoreVerified: false, conflict: true };
    writeRaw(storageKey, transaction.previousRaw);
    return { restored: true, restoreVerified: verifyRaw(storageKey, transaction.previousRaw) };
  };
  const recoverPending = () => {
    let raw;
    try { raw = readRaw(transactionKey); } catch { recoveryRequired = true; return { recovered: false, recoveryRequired: true }; }
    if (!raw) { recoveryRequired = false; return { recovered: false, recoveryRequired: false }; }
    try {
      const transaction = JSON.parse(raw);
      if (transaction?.storageKey !== storageKey || typeof transaction.candidateRaw !== "string") throw new Error("invalid_transaction");
      const restored = restoreSnapshot(transaction);
      if (!restored.restoreVerified) {
        if (restored.conflict) clearTransaction();
        recoveryRequired = !restored.conflict;
        return { recovered: false, recoveryRequired, conflict: restored.conflict === true };
      }
      if (!clearTransaction()) throw new Error("transaction_cleanup_failed");
      recoveryRequired = false;
      return { recovered: true, recoveryRequired: false };
    } catch {
      recoveryRequired = true;
      return { recovered: false, recoveryRequired: true };
    }
  };
  const clearLegacyDurableProgress = () => {
    LEGACY_DURABLE_ONBOARDING_PROGRESS_KEYS.forEach((key) => safely(() => storage.removeItem(key)));
  };
  const clearDurable = () => {
    safely(() => storage.removeItem(storageKey));
    safely(() => storage.removeItem(transactionKey));
    LEGACY_ONBOARDING_PREFERENCE_KEYS.forEach((key) => safely(() => storage.removeItem(key)));
  };
  const loadRecord = () => {
    recoverPending();
    const raw = safely(() => storage.getItem(storageKey));
    if (!raw) return null;
    try {
      const record = JSON.parse(raw);
      if (isCurrentRecord(record)) {
        if (durableVersion == null) { durableVersion = recordVersion(record); durableRaw = raw; }
        return record;
      }
    } catch { /* invalid durable state is removed below */ }
    clearDurable();
    durableRaw = null;
    return null;
  };
  return {
    begin(defaults) {
      LEGACY_ONBOARDING_PREFERENCE_KEYS.forEach((key) => safely(() => storage.removeItem(key)));
      clearLegacyDurableProgress();
      const record = loadRecord();
      durableVersion = recordVersion(record);
      draft = clone(record?.preferences ?? defaults);
      return { preferences: clone(draft), consented: Boolean(record), reloadBehavior: record ? "restored" : "session_only" };
    },
    beginProgress(defaults = { started: false, screen: "test" }) {
      clearLegacyDurableProgress();
      let restored = null;
      if (sessionStorage) {
        try {
          const parsed = JSON.parse(sessionStorage.getItem(ONBOARDING_PROGRESS_SESSION_KEY));
          if (parsed?.schemaVersion === ONBOARDING_PREFERENCES_SCHEMA_VERSION
            && typeof parsed.started === "boolean" && typeof parsed.screen === "string") restored = parsed;
        } catch { /* session state is optional and fail-safe */ }
      }
      progress = clone(restored ? { started: restored.started, screen: restored.screen } : defaults);
      return { ...clone(progress), reloadBehavior: restored ? "restored_in_tab" : "reset_for_new_session" };
    },
    updateProgress(next) {
      progress = clone({ ...(progress || {}), ...next });
      if (sessionStorage) {
        safely(() => sessionStorage.setItem(ONBOARDING_PROGRESS_SESSION_KEY, JSON.stringify({
          schemaVersion: ONBOARDING_PREFERENCES_SCHEMA_VERSION,
          ...progress,
        })));
      }
      clearLegacyDurableProgress();
      return clone(progress);
    },
    update(preferences) { draft = clone(preferences); return clone(draft); },
    grant(preferences = draft, { expectedVersion = durableVersion } = {}) {
      const previousDraft = clone(draft);
      const candidate = clone(preferences);
      const grantedAt = now();
      const transactionId = `${grantedAt}:${Math.random().toString(36).slice(2)}`;
      let previousRaw = null;
      let previousRecord = null;
      try {
        const recovery = recoverPending();
        if (recovery.recoveryRequired) return { ok: true, persisted: false, state: "recovery_required", code: "storage_unavailable", restored: false, restoreVerified: false };
        previousRaw = durableVersion == null ? readRaw(storageKey) : durableRaw;
        previousRecord = previousRaw ? JSON.parse(previousRaw) : null;
      } catch (error) {
        return { ok: true, persisted: false, state: "failed", code: storageFailureCode(error), restored: false, restoreVerified: false };
      }
      const actualVersion = recordVersion(previousRecord);
      if (expectedVersion != null && actualVersion !== expectedVersion) {
        durableVersion = actualVersion;
        return { ok: false, persisted: false, state: "conflict", code: "version_conflict", expectedVersion, actualVersion, restored: false, restoreVerified: false };
      }
      const record = {
        schemaVersion: ONBOARDING_PREFERENCES_SCHEMA_VERSION,
        version: actualVersion + 1,
        transactionId,
        consent: { granted: true, version: ONBOARDING_PREFERENCES_CONSENT_VERSION, grantedAt },
        preferences: clone(candidate),
        updatedAt: grantedAt,
      };
      let persisted = false;
      let persistenceError = null;
      let restored = false;
      let restoreVerified = false;
      let published = false;
      try {
        const candidateRaw = JSON.stringify(record);
        const transaction = { schemaVersion: 1, storageKey, transactionId, previousRaw, previousVersion: actualVersion, candidateRaw, candidateVersion: record.version };
        const transactionRaw = JSON.stringify(transaction);
        writeRaw(transactionKey, transactionRaw);
        if (!verifyRaw(transactionKey, transactionRaw)) throw new Error("transaction_stage_mismatch");
        if (!verifyRaw(storageKey, previousRaw)) {
          clearTransaction();
          durableVersion = recordVersion(safely(() => JSON.parse(readRaw(storageKey)), null));
          return { ok: false, persisted: false, state: "conflict", code: "version_conflict", expectedVersion, actualVersion: durableVersion, restored: false, restoreVerified: false };
        }
        writeRaw(storageKey, candidateRaw);
        published = true;
        const readBack = readRaw(storageKey);
        const verified = readBack ? JSON.parse(readBack) : null;
        if (!isCurrentRecord(verified)
          || JSON.stringify(verified.preferences) !== JSON.stringify(candidate)
          || verified.updatedAt !== record.updatedAt
          || verified.version !== record.version
          || verified.transactionId !== transactionId) throw new Error("preference_read_back_mismatch");
        if (!clearTransaction()) throw new Error("transaction_cleanup_failed");
        persisted = true;
        durableVersion = record.version;
        durableRaw = candidateRaw;
        recoveryRequired = false;
      } catch (error) {
        persistenceError = error;
        try {
          const raw = readRaw(transactionKey);
          const transaction = raw ? JSON.parse(raw) : null;
          if (transaction?.transactionId === transactionId) {
            const restoration = restoreSnapshot(transaction, { republishPrevious: published });
            restored = restoration.restored;
            restoreVerified = restoration.restoreVerified;
            if (restoreVerified) clearTransaction();
          }
        } catch { /* retained transaction is recovered on next load */ }
        recoveryRequired = published && !restoreVerified;
      }
      draft = persisted ? candidate : previousDraft;
      LEGACY_ONBOARDING_PREFERENCE_KEYS.forEach((key) => safely(() => storage.removeItem(key)));
      const state = persisted ? "saved_local" : recoveryRequired ? "recovery_required" : "failed";
      return { ok: true, persisted, state, restored, restoreVerified, ...(!persisted ? { code: recoveryRequired ? "recovery_required" : storageFailureCode(persistenceError) } : {}), record: clone(record) };
    },
    decline(preferences = draft) {
      draft = clone(preferences);
      clearDurable();
      return { ok: true, preferences: clone(draft), reloadBehavior: "answers_reset_on_reload" };
    },
    revoke() { clearDurable(); return { ok: true }; },
    export() { return clone(loadRecord()); },
    delete() {
      draft = null;
      progress = null;
      clearDurable();
      clearLegacyDurableProgress();
      safely(() => sessionStorage?.removeItem(ONBOARDING_PROGRESS_SESSION_KEY));
      return { ok: true };
    },
    hasDurablePreferences() { return Boolean(loadRecord()); },
    recoveryStatus() { const recovery = recoverPending(); return { ...recovery, recoveryRequired }; },
  };
}
