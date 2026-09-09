import { TELEMETRY_EVENTS, TELEMETRY_SCHEMA_VERSION } from "./eventDictionary.js";

export const TELEMETRY_STORAGE_KEYS = Object.freeze({
  queue: "atelier.telemetry.queue.v1",
  consent: "atelier.telemetry.consent.v1",
  installation: "atelier.telemetry.installation.v1",
  session: "atelier.telemetry.session.v1",
});
export const DEFAULT_RETENTION_DAYS = 30;
const FORBIDDEN_KEY = /(email|e-mail|otp|code|token|secret|password|photo|image|path|file|free.?text|body|weight|height|bust|waist|hip|phone|name)/i;
const FORBIDDEN_VALUE = /(?:@|bearer\s|blob:|data:image|[a-z]:\\|\/users\/|\b\d{4,8}\b)/i;

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const safeStorage = (storage) => storage && typeof storage.getItem === "function" ? storage : memoryStorage();
const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const id = (cryptoImpl) => cryptoImpl?.randomUUID?.() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const hash = (value) => {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0).toString(36);
};
const latencyBucket = (ms) => ms < 100 ? "lt_100ms" : ms < 500 ? "100_499ms" : ms < 2000 ? "500_1999ms" : ms < 10000 ? "2_9s" : "gte_10s";

function validateProperties(definition, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return { ok: false, reason: "properties_invalid" };
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEY.test(key) || FORBIDDEN_VALUE.test(String(value))) return { ok: false, reason: "privacy_rejected" };
    const rule = definition.properties[key];
    if (!rule) return { ok: false, reason: "property_not_allowlisted" };
    if (rule.type === "boolean" && typeof value !== "boolean") return { ok: false, reason: "property_type" };
    if (rule.type === "integer" && (!Number.isInteger(value) || value < rule.min || value > rule.max)) return { ok: false, reason: "property_type" };
    if (rule.type === "enum" && !rule.values.includes(value)) return { ok: false, reason: "property_value" };
  }
  return { ok: true };
}

export function createLocalTelemetryCollector({ storage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage, cryptoImpl = globalThis.crypto, now = () => Date.now(), environment = "dev", retentionDays = DEFAULT_RETENTION_DAYS, maxEvents = 5000 } = {}) {
  const durable = safeStorage(storage);
  const sessionStore = safeStorage(sessionStorage);
  const env = environment === "pilot" ? "pilot" : "dev";
  let installationId = durable.getItem(TELEMETRY_STORAGE_KEYS.installation);
  let sessionId = sessionStore.getItem(TELEMETRY_STORAGE_KEYS.session);
  let consent = parse(durable.getItem(TELEMETRY_STORAGE_KEYS.consent), null);

  const ensureIdentifiers = () => {
    installationId ||= id(cryptoImpl);
    sessionId ||= id(cryptoImpl);
    durable.setItem(TELEMETRY_STORAGE_KEYS.installation, installationId);
    sessionStore.setItem(TELEMETRY_STORAGE_KEYS.session, sessionId);
  };
  if (consent?.granted) ensureIdentifiers();

  const readQueue = () => parse(durable.getItem(TELEMETRY_STORAGE_KEYS.queue), []).filter((event) => event.environment === env);
  const writeQueue = (events) => durable.setItem(TELEMETRY_STORAGE_KEYS.queue, JSON.stringify(events.slice(-maxEvents)));
  const purgeExpired = () => {
    const cutoff = now() - retentionDays * 86400000;
    const raw = durable.getItem(TELEMETRY_STORAGE_KEYS.queue);
    const all = parse(raw, []);
    const kept = all.filter((event) => Date.parse(event.timestamp) >= cutoff);
    if (raw !== null || kept.length) writeQueue(kept);
    return all.length - kept.length;
  };
  purgeExpired();

  const setConsent = (granted) => {
    consent = granted ? { granted: true, policy_version: TELEMETRY_SCHEMA_VERSION, granted_at: new Date(now()).toISOString() } : null;
    if (consent) { ensureIdentifiers(); durable.setItem(TELEMETRY_STORAGE_KEYS.consent, JSON.stringify(consent)); }
    else durable.removeItem(TELEMETRY_STORAGE_KEYS.consent);
    return Boolean(consent);
  };
  const emit = (name, properties = {}, options = {}) => {
    if (!consent?.granted) return { ok: false, reason: "consent_required" };
    const definition = TELEMETRY_EVENTS[name];
    if (!definition) return { ok: false, reason: "event_not_allowlisted" };
    const validation = validateProperties(definition, properties);
    if (!validation.ok) return validation;
    const timestamp = new Date(now()).toISOString();
    const correlationId = options.correlationId || id(cryptoImpl);
    const traceId = options.traceId || correlationId;
    const dedupeKey = options.idempotencyKey || `${sessionId}:${name}:${timestamp}:${hash(JSON.stringify(properties))}`;
    const all = parse(durable.getItem(TELEMETRY_STORAGE_KEYS.queue), []);
    if (all.some((event) => event.dedupe_key === dedupeKey)) return { ok: true, deduped: true };
    const event = { event_id: id(cryptoImpl), schema_version: TELEMETRY_SCHEMA_VERSION, name, category: definition.category, timestamp, environment: env, installation_id: hash(installationId), session_id: hash(sessionId), correlation_id: hash(correlationId), trace_id: hash(traceId), dedupe_key: dedupeKey, properties };
    writeQueue([...all, event]);
    return { ok: true, event };
  };
  const measure = async (stage, operation, options = {}) => {
    const startedAt = now();
    try {
      const result = await operation();
      emit("stage_completed", { stage, latency_bucket: latencyBucket(now() - startedAt) }, options);
      return result;
    } catch (error) {
      emit("stage_error", { stage, error_code: error?.code === "quota_exceeded" ? "quota" : "unknown" }, options);
      throw error;
    }
  };
  const exportJson = () => JSON.stringify({ export_version: TELEMETRY_SCHEMA_VERSION, exported_at: new Date(now()).toISOString(), environment: env, events: readQueue() }, null, 2);
  const returnBucket = () => {
    if (!consent?.granted || !sessionId) return null;
    const currentSession = hash(sessionId);
    const previousStart = readQueue()
      .filter((event) => event.name === "app_started" && event.session_id !== currentSession)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
    if (!previousStart) return null;
    const elapsedDays = Math.floor(now() / 86400000) - Math.floor(Date.parse(previousStart.timestamp) / 86400000);
    if (elapsedDays === 1) return "d1";
    if (elapsedDays >= 2 && elapsedDays <= 7) return "d7";
    return "other";
  };
  const deleteEvents = () => { const all = parse(durable.getItem(TELEMETRY_STORAGE_KEYS.queue), []); writeQueue(all.filter((event) => event.environment !== env)); };
  const reset = () => { deleteEvents(); setConsent(false); durable.removeItem(TELEMETRY_STORAGE_KEYS.installation); sessionStore.removeItem(TELEMETRY_STORAGE_KEYS.session); installationId = null; sessionId = null; };
  return { emit, measure, setConsent, hasConsent: () => Boolean(consent?.granted), list: readQueue, purgeExpired, returnBucket, exportJson, deleteEvents, reset, environment: env, networkEgress: false };
}
