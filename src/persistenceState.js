export const PERSISTENCE_STATES = Object.freeze({
  UNSAVED: "unsaved", SAVING: "saving", SAVED_LOCAL: "saved_local", SYNCING: "syncing",
  SAVED_CLOUD_VERIFIED: "saved_cloud_verified", OFFLINE_QUEUED: "offline_queued",
  CONFLICT: "conflict", RETRYABLE_ERROR: "retryable_error", FAILED: "failed", RECOVERY_REQUIRED: "recovery_required",
});

export const persistenceCopy = Object.freeze({
  unsaved: "Есть несохранённые изменения",
  saving: "Сохраняем…",
  saved_local: "Сохранено на этом устройстве",
  syncing: "Синхронизируем…",
  saved_cloud_verified: "Сохранено в аккаунте",
  offline_queued: "Синхронизируем при подключении",
  conflict: "Изменения конфликтуют с версией в аккаунте",
  retryable_error: "Не удалось сохранить. Повторить",
  failed: "Не удалось сохранить изменения",
  recovery_required: "Сохранение прервано. Предыдущее значение не подтверждено — экспорт и удаление данных доступны ниже.",
});

const result = (state, evidence = {}, error = null) => Object.freeze({ state, evidence: Object.freeze({ ...evidence }), error });

export function saveLocally(repository, value) {
  if (!repository?.save || !repository?.load) throw new TypeError("A save/load repository is required");
  try {
    const saved = repository.save(value);
    const readBack = repository.load();
    if (JSON.stringify(readBack.data) !== JSON.stringify(value)) return result(PERSISTENCE_STATES.FAILED, { durable: false }, "local_read_back_mismatch");
    return result(PERSISTENCE_STATES.SAVED_LOCAL, { durable: true, scope: "device", version: saved.meta?.version ?? saved.meta?.schemaVersion });
  } catch (error) {
    const retryable = ["quota_exceeded", "storage_unavailable"].includes(error?.code);
    return result(retryable ? PERSISTENCE_STATES.RETRYABLE_ERROR : PERSISTENCE_STATES.FAILED, { durable: false }, error?.code || "local_save_failed");
  }
}

export async function saveWithVerification(provider, value, { expectedVersion, online = true } = {}) {
  if (!online) return result(PERSISTENCE_STATES.OFFLINE_QUEUED, { durable: false, queued: true });
  try {
    const ack = await provider.save(value, { expectedVersion });
    if (ack?.conflict) return result(PERSISTENCE_STATES.CONFLICT, { durable: false, serverVersion: ack.version });
    if (!ack?.acknowledged || ack.version == null) return result(PERSISTENCE_STATES.FAILED, { durable: false }, "missing_server_ack");
    const readBack = await provider.load();
    if (readBack?.version !== ack.version || JSON.stringify(readBack?.data) !== JSON.stringify(value)) {
      return result(PERSISTENCE_STATES.CONFLICT, { durable: false, ackVersion: ack.version, readBackVersion: readBack?.version }, "cloud_verification_failed");
    }
    return result(PERSISTENCE_STATES.SAVED_CLOUD_VERIFIED, { durable: true, scope: "account", ack: true, readBack: true, version: ack.version });
  } catch (error) {
    return result(error?.retryable === false ? PERSISTENCE_STATES.FAILED : PERSISTENCE_STATES.RETRYABLE_ERROR, { durable: false }, error?.code || "cloud_save_failed");
  }
}
