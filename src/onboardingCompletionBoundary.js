const clone = (value) => value == null ? value : structuredClone(value);
const storageCode = (error) => error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014
  ? "quota_exceeded"
  : "storage_unavailable";

/** Offline-first completion. The optional Profile API is injected; this module makes no network calls. */
export function createOnboardingCompletionBoundary({ preferencesPersistence, profileApi = null } = {}) {
  if (!preferencesPersistence) throw new TypeError("preferencesPersistence is required");
  const completed = new Map();
  const pending = new Map();

  async function execute({ idempotencyKey, preferences, rememberPreferences = false }) {
    let persistence;
    try {
      const response = rememberPreferences
        ? preferencesPersistence.grant(preferences)
        : preferencesPersistence.decline(preferences);
      persistence = response?.persisted === false
        ? { persisted: false, code: response.code ?? "storage_unavailable", response: clone(response) }
        : { persisted: rememberPreferences, response: clone(response) };
    } catch (error) {
      persistence = { persisted: false, code: storageCode(error), message: "Не сохранено на устройстве" };
    }

    const result = {
      ok: true,
      localCompleted: true,
      idempotencyKey,
      persistence,
      profileSync: { synced: false, code: "profile_api_unavailable" },
    };
    if (profileApi?.completeOnboarding) {
      try {
        const remote = await profileApi.completeOnboarding({ idempotencyKey, preferences: clone(preferences) });
        result.profileSync = remote?.ok === false
          ? { synced: false, code: remote.code ?? "profile_api_failed" }
          : { synced: true };
      } catch { /* local completion remains successful */ }
    }
    completed.set(idempotencyKey, clone(result));
    return result;
  }

  return {
    complete(command = {}) {
      const key = command.idempotencyKey;
      if (!key) return Promise.resolve({ ok: false, localCompleted: false, code: "idempotency_key_required" });
      if (completed.has(key)) return Promise.resolve({ ...clone(completed.get(key)), replayed: true });
      if (pending.has(key)) return pending.get(key);
      const operation = execute(command).finally(() => pending.delete(key));
      pending.set(key, operation);
      return operation;
    },
  };
}
