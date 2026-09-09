export const CAPSULE_METRICS_VERSION = "capsule-metrics/1.0.0";

const DEFINITIONS = Object.freeze({
  personal_outfit_shown: { result_kind: ["personal"], sequence: [1, 2, 3] },
  would_wear_recorded: { result_kind: ["personal"], sequence: [1, 2, 3] },
  explanation_rated: { result_kind: ["demo", "personal"], useful: [true, false] },
  feedback_undone: { feedback_kind: ["would_wear", "explanation"] },
});
const FORBIDDEN = /(email|phone|name|photo|image|file|path|token|cookie|auth|city|location|latitude|longitude|free.?text|body|weight|height|vk.?id|url|referrer|utm)/i;

const validate = (name, properties) => {
  const definition = DEFINITIONS[name];
  if (!definition) return "event_not_allowlisted";
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return "properties_invalid";
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN.test(key) || FORBIDDEN.test(String(value))) return "privacy_rejected";
    if (!definition[key]) return "property_not_allowlisted";
    if (!definition[key].includes(value)) return "property_value";
  }
  if (Object.keys(definition).some((key) => !(key in properties))) return "property_required";
  return null;
};

export function createCapsuleMetricsCollector({ consent = false, now = () => Date.now() } = {}) {
  let granted = consent === true;
  const events = [];
  return Object.freeze({
    networkEgress: false,
    setConsent(value) { granted = value === true; if (!granted) events.length = 0; },
    emit(name, properties) {
      if (!granted) return { ok: false, reason: "consent_required" };
      const reason = validate(name, properties);
      if (reason) return { ok: false, reason };
      const event = Object.freeze({ schema_version: CAPSULE_METRICS_VERSION, name, timestamp: new Date(now()).toISOString(), properties: Object.freeze({ ...properties }) });
      events.push(event);
      return { ok: true, event };
    },
    list() { return events.map((event) => ({ ...event, properties: { ...event.properties } })); },
    exportJson() { return JSON.stringify({ export_version: CAPSULE_METRICS_VERSION, source: "local-consented", events }); },
    dashboard() { return calculateCapsuleDashboard(events); },
  });
}
export function calculateCapsuleDashboard(events = []) {
  const personalShown = events.filter((event) => event.name === "personal_outfit_shown").length;
  const wouldWear = events.filter((event) => event.name === "would_wear_recorded").length;
  const undoneWouldWear = events.filter((event) => event.name === "feedback_undone" && event.properties.feedback_kind === "would_wear").length;
  const ratings = events.filter((event) => event.name === "explanation_rated");
  return Object.freeze({
    source: "local-consented",
    production_kpi: false,
    personal_outfits_n: personalShown,
    qwwr_at_3: personalShown ? Math.max(0, wouldWear - undoneWouldWear) / personalShown : null,
    explanation_usefulness: ratings.length ? ratings.filter((event) => event.properties.useful).length / ratings.length : null,
    explanation_responses_n: ratings.length,
  });
}
