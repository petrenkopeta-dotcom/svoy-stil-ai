import { PERSISTENCE_STATUS } from "./PersistenceResult.js";
import { PERSISTENCE_STATES, saveLocally } from "../persistenceState.js";

const stateResult = (state, evidence = {}, error = null) => Object.freeze({ state, evidence: Object.freeze(evidence), error });

export function stateFromCloudResult(cloud, local) {
  if (cloud?.status === PERSISTENCE_STATUS.ACKNOWLEDGED && cloud.durable && cloud.entity) return stateResult(PERSISTENCE_STATES.SAVED_CLOUD_VERIFIED, { durable: true, scope: "account", local: local?.evidence, version: cloud.version, ack: true, readBack: true });
  if (cloud?.status === PERSISTENCE_STATUS.PENDING) return stateResult(PERSISTENCE_STATES.OFFLINE_QUEUED, { durable: Boolean(local?.evidence?.durable), scope: "device", queued: cloud.queued === true }, cloud.code || "cloud_pending");
  if (cloud?.status === PERSISTENCE_STATUS.CONFLICT) return stateResult(PERSISTENCE_STATES.CONFLICT, { durable: Boolean(local?.evidence?.durable), scope: "device", serverVersion: cloud.actualVersion }, cloud.code || "cloud_conflict");
  return stateResult(PERSISTENCE_STATES.RETRYABLE_ERROR, { durable: Boolean(local?.evidence?.durable), scope: "device" }, cloud?.code || "cloud_save_failed");
}

export function createRuntimePersistence({ cloudRepository, getAuthState, onResult = () => {}, onOutcome = () => {}, now = () => Date.now() } = {}) {
  async function persist({ domain, localRepository, value, entityId, expectedVersion = 1, idempotencyKey = `${domain}:${entityId}:${now()}` }) {
    const local = saveLocally(localRepository, value);
    if (!local.evidence.durable) { onResult(local); onOutcome(domain, local); return local; }
    const auth = getAuthState?.();
    if (auth?.status !== "authenticated" || !auth?.session?.userId) { onResult(local); onOutcome(domain, local); return local; }
    onResult(stateResult(PERSISTENCE_STATES.SYNCING, { durable: true, scope: "device" }));
    const cloud = await cloudRepository.mutate(domain, { userId: auth.session.userId, entityId: String(entityId), value, expectedVersion, idempotencyKey });
    const result = stateFromCloudResult(cloud, local);
    onResult(result); onOutcome(domain, result);
    return result;
  }
  return Object.freeze({ persist, flush: () => cloudRepository.flush(), available: cloudRepository.available });
}
