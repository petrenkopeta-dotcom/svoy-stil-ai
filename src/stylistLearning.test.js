import test from "node:test";
import assert from "node:assert/strict";
import { createStylistLearningProfile, recordStylistFeedback, STYLIST_FEEDBACK_REASONS, STYLIST_LEARNING_RULE_VERSION, stylistLearningEtag, undoStylistLearning } from "./stylistLearning.js";

const ownerId = "user-a";
const makeProfile = () => createStylistLearningProfile({ ownerId, consent: { granted: true, grantedAt: "2026-08-12T08:00:00.000Z" } });
const command = (reason, id, extra = {}) => ({ ownerId, reason, idempotencyKey: id, source: { kind: "outfit_feedback", referenceId: `outfit-${id}` }, ...extra });
const apply = (profile, input, now = "2026-08-12T09:00:00.000Z") => recordStylistFeedback(profile, input, { consent: true, ifMatch: stylistLearningEtag(profile), now });

test("supports every SR-06 reason with deterministic weak signals", () => {
  assert.deepEqual(STYLIST_FEEDBACK_REASONS, ["colors", "too_dressy", "fit", "shoes", "too_hot", "too_cold", "not_my_style"]);
  for (const [index, reason] of STYLIST_FEEDBACK_REASONS.entries()) {
    const result = apply(makeProfile(), command(reason, `reason-${index}`));
    const signal = Object.values(result.profile.signals)[0];
    assert.equal(signal.level, "weak_signal");
    assert.equal(signal.confidence, 0.25);
    assert.equal(signal.ruleVersion, STYLIST_LEARNING_RULE_VERSION);
    assert.deepEqual(signal.provenance[0].source, { kind: "outfit_feedback", referenceId: `outfit-reason-${index}` });
  }
});

test("repeated feedback becomes a trend and explicit setting becomes a strong rule", () => {
  const first = apply(makeProfile(), command("colors", "a"));
  const second = apply(first.profile, command("colors", "b"), "2026-08-12T10:00:00.000Z");
  assert.deepEqual(second.profile.signals["colors.avoid"], { level: "trend", confidence: 0.65, evidenceCount: 2, reasonCodes: ["colors"], provenance: [{ eventId: "sl-1", source: { kind: "outfit_feedback", referenceId: "outfit-a" }, occurredAt: "2026-08-12T09:00:00.000Z" }, { eventId: "sl-2", source: { kind: "outfit_feedback", referenceId: "outfit-b" }, occurredAt: "2026-08-12T10:00:00.000Z" }], ruleVersion: STYLIST_LEARNING_RULE_VERSION, explanation: "Пользователь отклонил предложенные цвета." });
  const explicit = apply(second.profile, command("colors", "c", { strength: "explicit_setting", source: { kind: "profile_setting", referenceId: "setting-colors" } }));
  assert.equal(explicit.profile.signals["colors.avoid"].level, "strong_rule");
  assert.equal(explicit.profile.signals["colors.avoid"].confidence, 1);
  assert.equal(explicit.profile.signals["colors.avoid"].provenance.length, 1);
});

test("requires consent and never mutates input on rejection or success", () => {
  const noConsent = createStylistLearningProfile({ ownerId });
  const before = structuredClone(noConsent);
  assert.equal(recordStylistFeedback(noConsent, command("fit", "fit-1"), { consent: true, ifMatch: stylistLearningEtag(noConsent) }).code, "consent_required");
  assert.deepEqual(noConsent, before);
  const profile = makeProfile();
  const accepted = apply(profile, command("fit", "fit-2"));
  assert.deepEqual(profile, makeProfile());
  assert.notStrictEqual(accepted.profile, profile);
});

test("enforces cross-user ownership and ETag 412", () => {
  const profile = makeProfile();
  assert.equal(recordStylistFeedback(profile, { ...command("shoes", "x"), ownerId: "user-b" }, { consent: true, ifMatch: stylistLearningEtag(profile) }).code, "owner_mismatch");
  const stale = recordStylistFeedback(profile, command("shoes", "y"), { consent: true, ifMatch: 'W/"stylist-learning-9"' });
  assert.equal(stale.status, 412);
  assert.deepEqual(profile.signals, {});
});

test("idempotency replay does not add an event or revision", () => {
  const profile = makeProfile();
  const first = apply(profile, command("too_hot", "same-key"));
  const replay = recordStylistFeedback(first.profile, command("too_hot", "same-key"), { consent: true, ifMatch: first.etag });
  assert.equal(replay.replayed, true);
  assert.equal(replay.profile.revision, 1);
  assert.equal(replay.profile.events.length, 1);
  assert.equal(replay.etag, first.etag);
});

test("undo is append-only, idempotent, owner-safe, and recomputes aggregation", () => {
  const first = apply(makeProfile(), command("too_cold", "cold-1"));
  const second = apply(first.profile, command("too_cold", "cold-2"));
  const undone = undoStylistLearning(second.profile, { ownerId, eventId: second.event.id, idempotencyKey: "undo-1" }, { consent: true, ifMatch: second.etag, now: "2026-08-12T11:00:00.000Z" });
  assert.equal(undone.profile.events.length, 3);
  assert.equal(undone.profile.signals["temperature.warmer"].level, "weak_signal");
  const replay = undoStylistLearning(undone.profile, { ownerId, eventId: second.event.id, idempotencyKey: "undo-1" }, { consent: true, ifMatch: undone.etag });
  assert.equal(replay.replayed, true);
  assert.equal(replay.profile.revision, 3);
  assert.equal(undoStylistLearning(undone.profile, { ownerId: "user-b", eventId: first.event.id, idempotencyKey: "bad" }, { consent: true, ifMatch: undone.etag }).code, "owner_mismatch");
});
