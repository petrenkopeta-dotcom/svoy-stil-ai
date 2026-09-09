export const PERSISTENCE_STATUS = Object.freeze({
  ACKNOWLEDGED: "acknowledged",
  PENDING: "pending",
  CONFLICT: "conflict",
  REJECTED: "rejected",
});
export const persistenceResult = (status, fields = {}) => Object.freeze({
  ok: status === PERSISTENCE_STATUS.ACKNOWLEDGED,
  durable: status === PERSISTENCE_STATUS.ACKNOWLEDGED,
  status,
  ...fields,
});
