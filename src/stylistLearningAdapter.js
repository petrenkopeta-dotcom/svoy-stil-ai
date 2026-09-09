import {
  createStylistLearningProfile,
  learningRankingContext,
  migrateStylistLearningProfile,
  recordRecommendationFeedback,
  stylistLearningEtag,
  undoStylistLearning,
} from "./stylistLearning.js";

export const STYLIST_PROFILE_KEY = "as-stylist-learning-v1";
export const STYLIST_OWNER_ID = "local-warm-mvp-user";

const REJECTION_REASONS = Object.freeze({
  "Не мои цвета": "colors",
  "Слишком нарядно": "too_dressy",
  "Не подходит посадка": "fit",
  "Не подходит обувь": "shoes",
  "Слишком жарко": "too_hot",
  "Слишком холодно": "too_cold",
  "Не мой стиль": "not_my_style",
});

const COPY = {
  would_wear: {
    title: "Что стилист понял",
    conclusion: "Этот конкретный образ тебе подошёл.",
    effect: "Сохраним реакцию для истории, но один ответ не станет постоянным правилом.",
  },
  replacement: {
    title: "Что стилист понял",
    conclusion: "Для этого образа ты попросила другую комбинацию.",
    effect: "Это запрос замены, а не постоянный запрет на вещи или стиль.",
  },
};

export function createUiLearningProfile() {
  return { ...createStylistLearningProfile({ ownerId: STYLIST_OWNER_ID }), interactionEvents: [] };
}

export function normalizeUiLearningProfile(profile) {
  if (!profile) return createUiLearningProfile();
  if (!profile.ownerId) return createUiLearningProfile();
  return { ...migrateStylistLearningProfile(profile, { ownerId: profile.ownerId }), interactionEvents: profile.interactionEvents || [] };
}

export function learningProposal(kind, { reason = null, outfitId, idempotencyKey, subject = {}, replaceItemId = null, recommendationSequence = 0 } = {}) {
  if (!outfitId || !idempotencyKey) throw new TypeError("outfitId and idempotencyKey are required");
  if (kind === "rejection") {
    const reasonCode = REJECTION_REASONS[reason];
    if (!reasonCode) throw new TypeError("unsupported rejection reason");
    return {
      kind, reason, reasonCode, outfitId, idempotencyKey, subject, recommendationSequence,
      title: "Что стилист понял",
      conclusion: `Причина отказа: «${reason}».`,
      effect: "Пока это только слабый сигнал. Он станет устойчивой тенденцией лишь после повторных отзывов.",
    };
  }
  if (!COPY[kind]) throw new TypeError("unsupported learning action");
  return { kind, outfitId, idempotencyKey, subject, replaceItemId, recommendationSequence, ...COPY[kind] };
}

const withConsent = (profile, now) => ({
  ...profile,
  consent: { granted: true, version: "stylist-learning-consent-v1", grantedAt: profile.consent.grantedAt || now },
});

export function applyUiLearning(profile, proposal, { consent, ifMatch, now = new Date().toISOString() } = {}) {
  if (!consent) return { ok: false, status: 403, code: "consent_required", etag: stylistLearningEtag(profile) };
  if (ifMatch !== stylistLearningEtag(profile)) return { ok: false, status: 412, code: "stale_profile", etag: stylistLearningEtag(profile) };
  if (profile.idempotency[proposal.idempotencyKey]) return { ok: true, status: 200, replayed: true, profile: structuredClone(profile), etag: stylistLearningEtag(profile), event: profile.events.find((event) => event.id === profile.idempotency[proposal.idempotencyKey]) };
  const consented = withConsent(profile, now);
  if (proposal.kind === "rejection" || proposal.kind === "replacement" || proposal.kind === "would_wear") {
    const recorded = recordRecommendationFeedback(consented, {
      ownerId: profile.ownerId,
      action: proposal.kind === "rejection" ? "not_for_me" : proposal.kind === "replacement" ? "replace_item" : "would_wear",
      reason: proposal.kind === "would_wear" ? null : (proposal.reasonCode || "not_my_style"),
      subject: Object.keys(proposal.subject || {}).length ? proposal.subject : { itemIds: [proposal.outfitId] },
      replaceItemId: proposal.kind === "replacement" ? (proposal.replaceItemId || proposal.subject?.itemIds?.[0] || proposal.outfitId) : null,
      recommendationSequence: proposal.recommendationSequence,
      idempotencyKey: proposal.idempotencyKey,
      source: { referenceId: proposal.outfitId },
    }, { consent: true, ifMatch, now });
    if (!recorded.ok) return recorded;
    const interaction = proposal.kind === "rejection" ? "not_for_me" : proposal.kind;
    recorded.event.interaction = interaction;
    recorded.profile.events = recorded.profile.events.map((event) => event.id === recorded.event.id ? { ...event, interaction } : event);
    if (proposal.kind === "rejection") {
      recorded.profile.signals = {
        ...recorded.profile.signals,
        [REJECTION_REASONS[proposal.reason] === "colors" ? "colors.avoid" : `${REJECTION_REASONS[proposal.reason]}.feedback`]: {
          level: "weak_signal", confidence: 0.25, evidenceCount: 1,
          provenance: [{ eventId: recorded.event.id, source: { kind: "outfit_feedback", referenceId: proposal.outfitId }, occurredAt: now }],
          explanation: proposal.conclusion,
        },
      };
    }
    return recorded;
  }
  const event = { id: `sl-${profile.revision + 1}`, type: "interaction", interaction: proposal.kind, ownerId: profile.ownerId, source: { kind: "outfit_feedback", referenceId: proposal.outfitId }, occurredAt: now, ruleVersion: "stylist-learning-rules-v1" };
  const next = { ...structuredClone(consented), revision: profile.revision + 1, events: [...profile.events, event], interactionEvents: [...(profile.interactionEvents || []), event], idempotency: { ...profile.idempotency, [proposal.idempotencyKey]: event.id } };
  return { ok: true, status: 201, replayed: false, profile: next, etag: stylistLearningEtag(next), event };
}

export function undoUiLearning(profile, eventId, { ifMatch, idempotencyKey } = {}) {
  const target = profile.events.find((event) => event.id === eventId);
  if (target?.type === "feedback" || target?.type === "recommendation_feedback" || profile.idempotency[idempotencyKey]) return undoStylistLearning(profile, { ownerId: profile.ownerId, eventId, idempotencyKey }, { consent: true, ifMatch });
  if (ifMatch !== stylistLearningEtag(profile)) return { ok: false, status: 412, code: "stale_profile", etag: stylistLearningEtag(profile) };
  if (!target || target.type !== "interaction") return { ok: false, status: 404, code: "event_not_found", etag: stylistLearningEtag(profile) };
  if (profile.idempotency[idempotencyKey]) return { ok: true, status: 200, replayed: true, profile: structuredClone(profile), etag: stylistLearningEtag(profile) };
  const event = { id: `sl-${profile.revision + 1}`, type: "undo", ownerId: profile.ownerId, targetEventId: eventId, occurredAt: new Date().toISOString(), ruleVersion: "stylist-learning-rules-v1" };
  const next = { ...structuredClone(profile), revision: profile.revision + 1, events: [...profile.events, event], interactionEvents: (profile.interactionEvents || []).filter((item) => item.id !== eventId), idempotency: { ...profile.idempotency, [idempotencyKey]: event.id } };
  return { ok: true, status: 201, profile: next, etag: stylistLearningEtag(next), event };
}

export const uiLearningEtag = stylistLearningEtag;
export const uiLearningRankingContext = (profile, recommendationSequence = 0) => learningRankingContext(normalizeUiLearningProfile(profile), { ownerId: normalizeUiLearningProfile(profile).ownerId, recommendationSequence });
export const rejectionLabels = Object.freeze(Object.keys(REJECTION_REASONS));
