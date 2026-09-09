export const PROFILE_SYNC_STATES = Object.freeze({ LOCAL_SAVED: "local_saved", SYNC_PENDING: "sync_pending", SYNC_FAILED: "sync_failed" });

export function createLocalProfileSyncController({ adapter = null, profileRevision = 0, onStateChange = () => {} } = {}) {
  const idempotencyKey = `local-warm-profile-${profileRevision}`;
  let state = PROFILE_SYNC_STATES.LOCAL_SAVED;
  let inFlight = null;
  const publish = (next) => { state = next; onStateChange(next); return next; };
  const retry = () => {
    if (!adapter?.syncProfile) return Promise.resolve(publish(PROFILE_SYNC_STATES.LOCAL_SAVED));
    if (inFlight) return inFlight;
    publish(PROFILE_SYNC_STATES.SYNC_PENDING);
    inFlight = Promise.resolve().then(() => adapter.syncProfile({ profileRevision, idempotencyKey }))
      .then(() => publish(PROFILE_SYNC_STATES.LOCAL_SAVED)).catch(() => publish(PROFILE_SYNC_STATES.SYNC_FAILED)).finally(() => { inFlight = null; });
    return inFlight;
  };
  return { getState: () => state, getIdempotencyKey: () => idempotencyKey, retry };
}
