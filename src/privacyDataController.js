import {
  clearPersistedContext,
  loadConsentedContext,
} from "./contextAdapter.js";
import { createOnboardingPreferencesPersistence } from "./onboardingPreferencesPersistence.js";
import { PROFILE_AVATAR_KEY } from "./profileAvatar.js";
import { RETURNING_USER_SESSION_KEY, RETURNING_USER_STORAGE_KEY } from "./returningUserActivation.js";
import { DEMO_PERSONAL_STORAGE_KEY } from "./demoPersonalFlow.js";
import { TELEMETRY_STORAGE_KEYS } from "./telemetry/localCollector.js";
import { PRODUCT_TOUR_KEY } from "./productTour.js";

export const PRIVACY_DELETION_RESULT_KEY = "ai-stylist:privacy-deletion-result:v1";

function scrubTransientUrls(value) {
  if (typeof value === "string") return value.startsWith("blob:") ? null : value;
  if (Array.isArray(value)) return value.map(scrubTransientUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubTransientUrls(item)]));
}

function safeSessionRead(sessionStorage, key) {
  try { return sessionStorage?.getItem(key) ?? null; } catch { return null; }
}

export function createPrivacyDataController({
  repositories,
  storage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage,
  onboardingPersistence = createOnboardingPreferencesPersistence({ storage, sessionStorage }),
  objectUrlRegistry,
  photoStorage,
  now = () => new Date().toISOString(),
} = {}) {
  if (!repositories || !storage) throw new TypeError("repositories and storage are required");

  return {
    exportData() {
      const repositoryExport = repositories.exportAll();
      return scrubTransientUrls({
        ...repositoryExport,
        exportedAt: now(),
        data: {
          ...repositoryExport.data,
          preferences: onboardingPersistence.export(),
          context: loadConsentedContext(storage),
          avatarIndex: storage?.getItem?.(PROFILE_AVATAR_KEY) || null,
        },
      });
    },
    exportHref() {
      return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(this.exportData(), null, 2))}`;
    },
    resetProfile() {
      repositories.outfits.reset();
      repositories.learningProfile.reset();
      onboardingPersistence.delete();
      return { ok: true };
    },
    async deleteAll() {
      let photoError = null;
      try { await photoStorage?.deleteAll?.(); } catch (error) { photoError = error; }
      repositories.deleteAll();
      onboardingPersistence.delete();
      clearPersistedContext(storage);
      try { storage?.removeItem?.(PROFILE_AVATAR_KEY); } catch { /* deletion continues */ }
      for (const key of [RETURNING_USER_STORAGE_KEY, DEMO_PERSONAL_STORAGE_KEY, PRODUCT_TOUR_KEY, ...Object.values(TELEMETRY_STORAGE_KEYS)]) {
        try { storage?.removeItem?.(key); } catch { /* deletion continues */ }
        try { sessionStorage?.removeItem?.(key); } catch { /* deletion continues */ }
      }
      try { sessionStorage?.removeItem?.(RETURNING_USER_SESSION_KEY); } catch { /* deletion continues */ }
      objectUrlRegistry?.dispose?.();
      const result = { ok: true, completedAt: now() };
      try { sessionStorage?.setItem(PRIVACY_DELETION_RESULT_KEY, JSON.stringify(result)); } catch { /* deletion still succeeded */ }
      if (photoError) throw photoError;
      return result;
    },
    consumeDeletionResult() {
      const raw = safeSessionRead(sessionStorage, PRIVACY_DELETION_RESULT_KEY);
      if (!raw) return null;
      try { sessionStorage?.removeItem(PRIVACY_DELETION_RESULT_KEY); } catch { /* one-time notice is best effort */ }
      try {
        const result = JSON.parse(raw);
        return result?.ok === true ? result : null;
      } catch { return null; }
    },
  };
}
