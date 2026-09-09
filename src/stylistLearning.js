export const STYLIST_LEARNING_RULE_VERSION = "stylist-learning-rules-v2";
export const STYLIST_LEARNING_CONSENT_VERSION = "stylist-learning-consent-v1";
export const STYLIST_LEARNING_PROFILE_VERSION = 2;
export const STYLIST_FEEDBACK_ACTIONS = Object.freeze(["would_wear", "not_for_me", "replace_item"]);

const REASONS = Object.freeze({
  colors: { signal: "colors.avoid", explanation: "Пользователь отклонил предложенные цвета." },
  too_dressy: { signal: "formality.lower", explanation: "Образ показался слишком нарядным." },
  fit: { signal: "fit.adjust", explanation: "Пользователь отметил проблему с посадкой." },
  shoes: { signal: "shoes.adjust", explanation: "Пользователь отклонил обувь в образе." },
  too_hot: { signal: "temperature.cooler", explanation: "В образе было жарко." },
  too_cold: { signal: "temperature.warmer", explanation: "В образе было холодно." },
  not_my_style: { signal: "style.avoid", explanation: "Образ не соответствует заявленному стилю пользователя." },
});

const clone = (value) => structuredClone(value);
const etagForRevision = (revision) => `W/"stylist-learning-${revision}"`;

export function createStylistLearningProfile({ ownerId, consent = null } = {}) {
  if (!ownerId) throw new TypeError("ownerId is required");
  return {
    schemaVersion: STYLIST_LEARNING_PROFILE_VERSION,
    ownerId,
    revision: 0,
    consent: consent?.granted === true
      ? { granted: true, version: consent.version || STYLIST_LEARNING_CONSENT_VERSION, grantedAt: consent.grantedAt || null }
      : { granted: false, version: STYLIST_LEARNING_CONSENT_VERSION, grantedAt: null },
    signals: {},
    events: [],
    idempotency: {},
  };
}

/** Adds missing v2 fields without discarding an existing v1 audit trail. */
export function migrateStylistLearningProfile(profile, { ownerId } = {}) {
  if (!profile) return createStylistLearningProfile({ ownerId });
  if (ownerId && profile.ownerId !== ownerId) throw new TypeError("ownerId does not match profile");
  return {
    ...clone(profile),
    schemaVersion: STYLIST_LEARNING_PROFILE_VERSION,
    consent: profile.consent || { granted: false, version: STYLIST_LEARNING_CONSENT_VERSION, grantedAt: null },
    signals: profile.signals || {}, events: profile.events || [], idempotency: profile.idempotency || {},
  };
}

export function stylistLearningEtag(profile) {
  return etagForRevision(profile.revision);
}

function reject(status, code, profile, extra = {}) {
  return { ok: false, status, code, etag: stylistLearningEtag(profile), ...extra };
}

function validateCommand(profile, command, options) {
  if (!command || command.ownerId !== profile.ownerId) return reject(403, "owner_mismatch", profile);
  if (!options?.consent || profile.consent.granted !== true) return reject(403, "consent_required", profile);
  if (options.ifMatch !== stylistLearningEtag(profile)) return reject(412, "stale_profile", profile);
  if (!command.idempotencyKey) return reject(400, "idempotency_key_required", profile);
  return null;
}

function aggregateSignals(events) {
  const undone = new Set(events.filter((event) => event.type === "undo").map((event) => event.targetEventId));
  const active = events.filter((event) => event.type === "feedback" && !undone.has(event.id));
  const grouped = new Map();
  for (const event of active) {
    const key = REASONS[event.reason].signal;
    const list = grouped.get(key) || [];
    list.push(event);
    grouped.set(key, list);
  }
  const signals = {};
  for (const [key, sourceEvents] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const explicit = sourceEvents.filter((event) => event.strength === "explicit_setting");
    const evidence = explicit.length ? explicit : sourceEvents;
    const level = explicit.length ? "strong_rule" : sourceEvents.length >= 2 ? "trend" : "weak_signal";
    signals[key] = {
      level,
      confidence: level === "strong_rule" ? 1 : level === "trend" ? 0.65 : 0.25,
      evidenceCount: sourceEvents.length,
      reasonCodes: [...new Set(evidence.map((event) => event.reason))].sort(),
      provenance: evidence.map((event) => ({ eventId: event.id, source: event.source, occurredAt: event.occurredAt })),
      ruleVersion: STYLIST_LEARNING_RULE_VERSION,
      explanation: REASONS[evidence[0].reason].explanation,
    };
  }
  return signals;
}

export function recordStylistFeedback(profile, command, options = {}) {
  const invalid = validateCommand(profile, command, options);
  if (invalid) return invalid;
  const existingEventId = profile.idempotency[command.idempotencyKey];
  if (existingEventId) return { ok: true, status: 200, replayed: true, profile: clone(profile), etag: stylistLearningEtag(profile), event: clone(profile.events.find((event) => event.id === existingEventId)) };
  if (!REASONS[command.reason]) return reject(400, "unsupported_reason", profile);
  if (!command.source?.kind || !command.source?.referenceId) return reject(400, "provenance_required", profile);
  const strength = command.strength || "feedback";
  if (!new Set(["feedback", "explicit_setting"]).has(strength)) return reject(400, "invalid_strength", profile);
  const occurredAt = options.now || new Date().toISOString();
  const event = {
    id: `sl-${profile.revision + 1}`,
    type: "feedback",
    ownerId: profile.ownerId,
    reason: command.reason,
    strength,
    source: clone(command.source),
    occurredAt,
    ruleVersion: STYLIST_LEARNING_RULE_VERSION,
  };
  const events = [...profile.events, event];
  const next = { ...clone(profile), revision: profile.revision + 1, events, signals: aggregateSignals(events), idempotency: { ...profile.idempotency, [command.idempotencyKey]: event.id } };
  return { ok: true, status: 201, replayed: false, profile: next, etag: stylistLearningEtag(next), event };
}

export function undoStylistLearning(profile, command, options = {}) {
  const invalid = validateCommand(profile, command, options);
  if (invalid) return invalid;
  const existingEventId = profile.idempotency[command.idempotencyKey];
  if (existingEventId) return { ok: true, status: 200, replayed: true, profile: clone(profile), etag: stylistLearningEtag(profile), event: clone(profile.events.find((event) => event.id === existingEventId)) };
  const target = profile.events.find((event) => event.id === command.eventId && (event.type === "feedback" || event.type === "recommendation_feedback"));
  if (!target) return reject(404, "event_not_found", profile);
  if (target.ownerId !== command.ownerId) return reject(403, "owner_mismatch", profile);
  if (profile.events.some((event) => event.type === "undo" && event.targetEventId === target.id)) return reject(409, "already_undone", profile);
  const event = { id: `sl-${profile.revision + 1}`, type: "undo", ownerId: profile.ownerId, targetEventId: target.id, occurredAt: options.now || new Date().toISOString(), ruleVersion: STYLIST_LEARNING_RULE_VERSION };
  const events = [...profile.events, event];
  const next = { ...clone(profile), revision: profile.revision + 1, events, signals: aggregateSignals(events), idempotency: { ...profile.idempotency, [command.idempotencyKey]: event.id } };
  return { ok: true, status: 201, replayed: false, profile: next, etag: stylistLearningEtag(next), event };
}

const TRAIT_KEYS = new Set(["styleTags", "colorFamilies", "categories", "itemIds"]);
const cleanList = (value) => [...new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 12);

function feedbackSubject(subject = {}) {
  const extra = Object.keys(subject).filter((key) => !TRAIT_KEYS.has(key));
  if (extra.length) throw new TypeError(`unsupported subject fields: ${extra.join(",")}`);
  return Object.fromEntries([...TRAIT_KEYS].map((key) => [key, cleanList(subject[key])]).filter(([, value]) => value.length));
}

/** Records the three product actions using only recommendation traits, never body/demographic data. */
export function recordRecommendationFeedback(profile, command, options = {}) {
  profile = migrateStylistLearningProfile(profile);
  const invalid = validateCommand(profile, command, options);
  if (invalid) return invalid;
  if (!STYLIST_FEEDBACK_ACTIONS.includes(command.action)) return reject(400, "unsupported_action", profile);
  if (!command.source?.referenceId) return reject(400, "provenance_required", profile);
  if ((command.action === "not_for_me" || command.action === "replace_item") && !REASONS[command.reason]) return reject(400, "unsupported_reason", profile);
  if (command.action === "replace_item" && !command.replaceItemId) return reject(400, "replace_item_required", profile);
  const existingEventId = profile.idempotency[command.idempotencyKey];
  if (existingEventId) return { ok: true, status: 200, replayed: true, profile: clone(profile), etag: stylistLearningEtag(profile), event: clone(profile.events.find((event) => event.id === existingEventId)) };
  let subject;
  try { subject = feedbackSubject(command.subject); } catch { return reject(400, "privacy_fields_rejected", profile); }
  const event = {
    id: `sl-${profile.revision + 1}`, type: "recommendation_feedback", ownerId: profile.ownerId,
    action: command.action, reason: command.reason || null, subject,
    replaceItemId: command.replaceItemId ? String(command.replaceItemId) : null,
    permanent: command.permanent === true, source: { kind: "recommendation", referenceId: String(command.source.referenceId) },
    recommendationSequence: Math.max(0, Number(command.recommendationSequence) || 0),
    occurredAt: options.now || new Date().toISOString(), ruleVersion: STYLIST_LEARNING_RULE_VERSION,
  };
  const events = [...profile.events, event];
  const next = { ...clone(profile), schemaVersion: STYLIST_LEARNING_PROFILE_VERSION, revision: profile.revision + 1, events, idempotency: { ...profile.idempotency, [command.idempotencyKey]: event.id } };
  return { ok: true, status: 201, replayed: false, profile: next, etag: stylistLearningEtag(next), event };
}

/** Internal ranking input plus a safe contract for “Что стилист запомнил”. */
export function learningRankingContext(profile, { ownerId, recommendationSequence = 0 } = {}) {
  profile = migrateStylistLearningProfile(profile, { ownerId });
  const undone = new Set(profile.events.filter((event) => event.type === "undo").map((event) => event.targetEventId));
  const adjustments = profile.events.filter((event) => event.type === "recommendation_feedback" && !undone.has(event.id)).map((event) => {
    const age = Math.max(0, recommendationSequence - event.recommendationSequence);
    const decay = event.permanent ? 1 : Math.pow(0.82, age);
    const base = event.action === "would_wear" ? 5 : event.action === "not_for_me" ? -14 : -10;
    return { eventId: event.id, action: event.action, reason: event.reason, subject: clone(event.subject), replaceItemId: event.replaceItemId, weight: base * decay, permanent: event.permanent, source: clone(event.source), ruleVersion: event.ruleVersion };
  });
  return {
    ownerId: profile.ownerId, preferenceVersion: profile.revision, ruleVersion: STYLIST_LEARNING_RULE_VERSION, adjustments,
    remembered: adjustments.map(({ eventId, action, reason, subject, source, permanent }) => ({ eventId, action, reason, subject, source, permanent })),
    productionEvidence: false,
  };
}

export const STYLIST_FEEDBACK_REASONS = Object.freeze(Object.keys(REASONS));
