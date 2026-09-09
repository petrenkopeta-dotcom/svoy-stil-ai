export const PROFILE_KEY = "as-learning-profile-v1";
export const emptyLearningProfile = () => ({ revision: 0, consent: { granted: false, policyVersion: "profile-learning-v1" }, attributes: {}, events: [] });
export const profileEtag = (profile) => `W/"profile-${profile.revision}"`;

const RULES = {
  "Слишком скучно": ["style.avoided_tags", "слишком сдержанно"],
  "Слишком ярко": ["style.avoided_tags", "яркие акценты"],
  "Неудобно": ["fit.preference", "больше комфорта"],
  "Не мой стиль": ["style.avoided_tags", "этот стиль"],
  "Не по погоде": ["weather.comfort", "точнее учитывать погоду"],
  "Не под ситуацию": ["occasion.preference", "точнее учитывать ситуацию"],
};

export function proposalForFeedback(reason) {
  const [attribute, value] = RULES[reason] || ["style.feedback", "учитывать этот отзыв"];
  return { attribute, value, source: "explicit_feedback", confidence: "средняя", ruleVersion: "feedback-rules-v1", reason };
}

export function applyLearning(profile, proposal, { consent, ifMatch, now } = {}) {
  if (!consent) return { ok: false, status: 403, code: "consent_required" };
  if (ifMatch !== profileEtag(profile)) return { ok: false, status: 412, code: "stale_profile", currentEtag: profileEtag(profile) };
  const occurredAt = now || new Date().toISOString();
  const event = { id: `feedback-${profile.revision + 1}-${occurredAt}`, ...proposal, previous: profile.attributes[proposal.attribute] || null, occurredAt };
  const next = { ...profile, revision: profile.revision + 1, consent: { granted: true, policyVersion: "profile-learning-v1", grantedAt: occurredAt }, attributes: { ...profile.attributes, [proposal.attribute]: { value: proposal.value, source: proposal.source, confidence: proposal.confidence, computedAt: occurredAt, ruleVersion: proposal.ruleVersion } }, events: [...profile.events, event] };
  return { ok: true, profile: next, etag: profileEtag(next), event };
}

export function undoLearning(profile, eventId, { ifMatch } = {}) {
  if (ifMatch !== profileEtag(profile)) return { ok: false, status: 412, code: "stale_profile", currentEtag: profileEtag(profile) };
  const event = profile.events.find((item) => item.id === eventId);
  if (!event) return { ok: false, status: 404, code: "event_not_found" };
  const attributes = { ...profile.attributes };
  if (event.previous) attributes[event.attribute] = event.previous;
  else delete attributes[event.attribute];
  const next = { ...profile, revision: profile.revision + 1, attributes, events: profile.events.filter((item) => item.id !== eventId) };
  return { ok: true, profile: next, etag: profileEtag(next) };
}

export function learningBenefit(profile) {
  const keys = Object.keys(profile.attributes);
  if (!keys.length) return "Пока рекомендации опираются только на выбранные тобой настройки.";
  if (keys.some((key) => key.startsWith("weather."))) return "Следующие образы точнее учтут твой комфорт по погоде.";
  if (keys.some((key) => key.startsWith("fit."))) return "Следующие образы будут чаще выбирать комфортные сочетания.";
  return "Следующие образы будут реже повторять то, что тебе не подошло.";
}
