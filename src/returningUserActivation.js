import {
  ONBOARDING_PREFERENCES_CONSENT_VERSION,
  ONBOARDING_PREFERENCES_STORAGE_KEY,
} from "./onboardingPreferencesPersistence.js";

export const RETURNING_USER_SCHEMA_VERSION = 2;
export const RETURNING_USER_STORAGE_KEY = "ai-stylist:returning-user:v2";
export const RETURNING_USER_SESSION_KEY = "ai-stylist:returning-user-session:v2";

const clone = (value) => value == null ? value : structuredClone(value);
const safe = (operation, fallback = null) => {
  try { return operation(); } catch { return fallback; }
};
const browserStorage = (name) => safe(() => globalThis[name], null);

const validProgress = (value) => value
  && typeof value.started === "boolean"
  && typeof value.screen === "string";

const currentDurableRecord = (value) => value
  && value.schemaVersion === RETURNING_USER_SCHEMA_VERSION
  && value.completed === true
  && value.consent?.granted === true
  && value.preferences && typeof value.preferences === "object";

const legacyConsentedRecord = (value) => value
  && value.schemaVersion === 1
  && value.consent?.granted === true
  && value.consent.version === ONBOARDING_PREFERENCES_CONSENT_VERSION
  && value.preferences && typeof value.preferences === "object";

/**
 * Local-first returning-user controller. It performs no network requests.
 * Durable writes happen only after explicit preference-storage consent.
 */
export function createReturningUserActivation({
  storage = browserStorage("localStorage"),
  sessionStorage = browserStorage("sessionStorage"),
  now = () => new Date().toISOString(),
} = {}) {
  let state;

  const remove = (target, key) => safe(() => target?.removeItem(key));
  const parse = (target, key) => {
    const raw = safe(() => target?.getItem(key));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { remove(target, key); return null; }
  };
  const writeSession = () => safe(() => sessionStorage?.setItem(RETURNING_USER_SESSION_KEY, JSON.stringify({
    schemaVersion: RETURNING_USER_SCHEMA_VERSION,
    completed: state.completed,
    progress: state.progress,
    preferences: state.preferences,
  })));

  const loadDurable = () => {
    const record = parse(storage, RETURNING_USER_STORAGE_KEY);
    if (currentDurableRecord(record)) return record;
    // Unknown future schemas are preserved so an older client cannot destroy them.
    if (record && Number(record.schemaVersion) > RETURNING_USER_SCHEMA_VERSION) return null;
    if (record) remove(storage, RETURNING_USER_STORAGE_KEY);

    const legacy = parse(storage, ONBOARDING_PREFERENCES_STORAGE_KEY);
    if (!legacyConsentedRecord(legacy)) return null;
    const migrated = {
      schemaVersion: RETURNING_USER_SCHEMA_VERSION,
      completed: true,
      consent: clone(legacy.consent),
      preferences: clone(legacy.preferences),
      updatedAt: legacy.updatedAt ?? now(),
      migratedFrom: 1,
    };
    safe(() => storage?.setItem(RETURNING_USER_STORAGE_KEY, JSON.stringify(migrated)));
    return migrated;
  };

  return {
    bootstrap({ preferences = {}, progress = { started: false, screen: "test" } } = {}) {
      const durable = loadDurable();
      const session = parse(sessionStorage, RETURNING_USER_SESSION_KEY);
      const validSession = session?.schemaVersion === RETURNING_USER_SCHEMA_VERSION
        && typeof session.completed === "boolean"
        && validProgress(session.progress);
      if (session && !validSession && Number(session.schemaVersion) <= RETURNING_USER_SCHEMA_VERSION) {
        remove(sessionStorage, RETURNING_USER_SESSION_KEY);
      }
      state = {
        completed: Boolean(durable?.completed || (validSession && session.completed)),
        preferences: clone(durable?.preferences ?? (validSession ? session.preferences : null) ?? preferences),
        progress: clone(durable?.completed
          ? { started: true, screen: "wardrobe" }
          : validSession ? session.progress : progress),
        consented: Boolean(durable),
      };
      return clone(state);
    },

    updateProgress(next) {
      if (!state) throw new Error("bootstrap must be called first");
      state.progress = { ...state.progress, ...clone(next) };
      writeSession();
      return clone(state);
    },

    complete({ preferences = state?.preferences ?? {}, rememberPreferences = false } = {}) {
      if (!state) throw new Error("bootstrap must be called first");
      state = {
        completed: true,
        preferences: clone(preferences),
        progress: { started: true, screen: "wardrobe" },
        consented: Boolean(rememberPreferences),
      };
      writeSession();
      if (rememberPreferences) {
        const timestamp = now();
        safe(() => storage?.setItem(RETURNING_USER_STORAGE_KEY, JSON.stringify({
          schemaVersion: RETURNING_USER_SCHEMA_VERSION,
          completed: true,
          consent: { granted: true, version: ONBOARDING_PREFERENCES_CONSENT_VERSION, grantedAt: timestamp },
          preferences: clone(preferences),
          updatedAt: timestamp,
        })));
      } else {
        remove(storage, RETURNING_USER_STORAGE_KEY);
        remove(storage, ONBOARDING_PREFERENCES_STORAGE_KEY);
      }
      return clone(state);
    },

    clear() {
      state = null;
      remove(storage, RETURNING_USER_STORAGE_KEY);
      remove(storage, ONBOARDING_PREFERENCES_STORAGE_KEY);
      remove(sessionStorage, RETURNING_USER_SESSION_KEY);
    },
  };
}
