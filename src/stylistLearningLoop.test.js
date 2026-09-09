import test from "node:test";
import assert from "node:assert/strict";
import { createStylistLearningProfile, learningRankingContext, migrateStylistLearningProfile, recordRecommendationFeedback, stylistLearningEtag, undoStylistLearning } from "./stylistLearning.js";
import { generateAndRankCandidates } from "./stylistCandidateEngine.js";

const item = (id, category, style) => ({ id, category, status: "ready", style_tags: [style], colors: [{ name: "black" }], occasions: ["work"] });
const wardrobe = [item("top-min", "top", "minimal"), item("top-bold", "top", "bold"), item("bottom", "bottom", "minimal"), item("shoe", "shoes", "minimal"), item("shoe-2", "shoes", "bold")];
const ownerId = "user-a";
const profile = () => createStylistLearningProfile({ ownerId, consent: { granted: true, grantedAt: "2026-08-20T08:00:00Z" } });
const apply = (current, command) => recordRecommendationFeedback(current, { ownerId, idempotencyKey: command.idempotencyKey, source: { referenceId: "rec-1" }, recommendationSequence: 1, ...command }, { consent: true, ifMatch: stylistLearningEtag(current), now: "2026-08-20T09:00:00Z" });

test("negative feedback predictably changes the next ranking and exposes provenance", () => {
  const before = generateAndRankCandidates(wardrobe, { limit: 4 }).candidates;
  const learned = apply(profile(), { action: "not_for_me", reason: "not_my_style", subject: { itemIds: before[0].itemIds }, idempotencyKey: "f-1" });
  const context = learningRankingContext(learned.profile, { ownerId, recommendationSequence: 2 });
  const after = generateAndRankCandidates(wardrobe, { limit: 4, learningContext: context }).candidates;
  assert.notEqual(after[0].signature, before[0].signature);
  assert.equal(after.find((candidate) => candidate.signature === before[0].signature).rankingReasons[0].eventId, learned.event.id);
  assert.equal(after[0].preferenceVersion, 1);
});

test("undo restores ranking, diversity remains, and another owner is isolated", () => {
  const baseline = generateAndRankCandidates(wardrobe, { limit: 4 }).candidates.map((candidate) => candidate.signature);
  const learned = apply(profile(), { action: "replace_item", reason: "shoes", replaceItemId: "shoe", subject: { itemIds: ["shoe"] }, idempotencyKey: "f-2" });
  const changed = generateAndRankCandidates(wardrobe, { limit: 4, learningContext: learningRankingContext(learned.profile, { ownerId, recommendationSequence: 2 }) }).candidates;
  assert.ok(new Set(changed.slice(0, 3).flatMap((candidate) => candidate.itemIds.filter((id) => id.startsWith("top")))).size > 1);
  const undone = undoStylistLearning(learned.profile, { ownerId, eventId: learned.event.id, idempotencyKey: "undo-f-2" }, { consent: true, ifMatch: learned.etag });
  const restored = generateAndRankCandidates(wardrobe, { limit: 4, learningContext: learningRankingContext(undone.profile, { ownerId, recommendationSequence: 2 }) }).candidates.map((candidate) => candidate.signature);
  assert.deepEqual(restored, baseline);
  assert.throws(() => learningRankingContext(learned.profile, { ownerId: "user-b" }), /ownerId/);
});

test("single feedback decays, explicit permanent action does not, and privacy fields fail closed", () => {
  const weak = apply(profile(), { action: "would_wear", subject: { styleTags: ["minimal"] }, idempotencyKey: "f-3" });
  const now = learningRankingContext(weak.profile, { ownerId, recommendationSequence: 1 }).adjustments[0].weight;
  const later = learningRankingContext(weak.profile, { ownerId, recommendationSequence: 10 }).adjustments[0].weight;
  assert.ok(later < now);
  const rejected = apply(profile(), { action: "not_for_me", reason: "fit", subject: { body: "hidden" }, idempotencyKey: "f-4" });
  assert.equal(rejected.code, "privacy_fields_rejected");
});

test("v1 profiles migrate additively without losing audit events", () => {
  const legacy = { ownerId, revision: 1, consent: { granted: true }, signals: {}, events: [{ id: "sl-1", type: "interaction" }], idempotency: { old: "sl-1" } };
  const migrated = migrateStylistLearningProfile(legacy, { ownerId });
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.events, legacy.events);
  assert.deepEqual(migrated.idempotency, legacy.idempotency);
});
