import test from "node:test";
import assert from "node:assert/strict";
import { applyLearning, emptyLearningProfile, profileEtag, proposalForFeedback, undoLearning } from "./profileLearning.js";

test("learning requires explicit consent", () => {
  const profile = emptyLearningProfile();
  assert.equal(applyLearning(profile, proposalForFeedback("Слишком ярко"), { ifMatch: profileEtag(profile) }).status, 403);
});

test("learning records provenance and can be undone", () => {
  const profile = emptyLearningProfile();
  const learned = applyLearning(profile, proposalForFeedback("Слишком ярко"), { consent: true, ifMatch: profileEtag(profile), now: "2026-08-12T00:00:00.000Z" });
  assert.equal(learned.profile.attributes["style.avoided_tags"].source, "explicit_feedback");
  assert.equal(learned.profile.attributes["style.avoided_tags"].confidence, "средняя");
  const undone = undoLearning(learned.profile, learned.event.id, { ifMatch: learned.etag });
  assert.deepEqual(undone.profile.attributes, {});
  assert.equal(undone.profile.revision, 2);
});

test("stale ETag returns 412 without mutation", () => {
  const profile = emptyLearningProfile();
  const result = applyLearning(profile, proposalForFeedback("Неудобно"), { consent: true, ifMatch: 'W/"profile-9"' });
  assert.equal(result.status, 412);
  assert.deepEqual(profile.attributes, {});
});
