import test from "node:test";
import assert from "node:assert/strict";
import { applyUiLearning, createUiLearningProfile, learningProposal, uiLearningEtag, undoUiLearning } from "./stylistLearningAdapter.js";

const proposal = (kind, reason, key = `${kind}-1`) => learningProposal(kind, { reason, outfitId: "look-42", idempotencyKey: key });
const apply = (profile, input, etag = uiLearningEtag(profile)) => applyUiLearning(profile, input, { consent: true, ifMatch: etag, now: "2026-08-12T12:00:00.000Z" });

test("would-wear and replacement are auditable interactions, not permanent rules", () => {
  const liked = apply(createUiLearningProfile(), proposal("would_wear"));
  assert.equal(liked.profile.events[0].interaction, "would_wear");
  assert.deepEqual(liked.profile.signals, {});
  const replaced = apply(liked.profile, proposal("replacement", null, "replacement-1"));
  assert.equal(replaced.profile.events[1].interaction, "replacement");
  assert.deepEqual(replaced.profile.signals, {});
});

test("one rejection is only a weak signal with provenance and qualitative UI copy", () => {
  const input = proposal("rejection", "Не мои цвета");
  assert.match(input.effect, /слабый сигнал/i);
  const result = apply(createUiLearningProfile(), input);
  assert.equal(result.profile.signals["colors.avoid"].level, "weak_signal");
  assert.deepEqual(result.profile.signals["colors.avoid"].provenance[0].source, { kind: "outfit_feedback", referenceId: "look-42" });
  assert.equal(input.confidence, undefined);
});

test("adapter enforces consent, ETag 412, idempotency, and undo", () => {
  const profile = createUiLearningProfile();
  const input = proposal("rejection", "Не подходит обувь");
  assert.equal(applyUiLearning(profile, input, { ifMatch: uiLearningEtag(profile) }).code, "consent_required");
  assert.equal(apply(profile, input, 'W/"stylist-learning-9"').status, 412);
  const first = apply(profile, input);
  const replay = apply(first.profile, input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.profile.revision, 1);
  const undone = undoUiLearning(first.profile, first.event.id, { ifMatch: first.etag, idempotencyKey: "undo-1" });
  assert.equal(undone.ok, true);
  assert.deepEqual(undone.profile.signals, {});
  const undoReplay = undoUiLearning(undone.profile, first.event.id, { ifMatch: undone.etag, idempotencyKey: "undo-1" });
  assert.equal(undoReplay.replayed, true);
});
