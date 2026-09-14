import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  emptyProfileDraft,
  validProfileDraft,
  validProfileMutation,
  validStoredProfile,
  withinProfileBytes,
  canonicalProfile,
} from "./vkProfileContract.js";
import { VK_QUESTIONS } from "./vkStagingJourney.js";

test("profile uses existing enums and distinguishes absent and explicit no preference", () => {
  const draft = emptyProfileDraft();
  assert.equal(validProfileDraft(draft), true);
  for (const q of VK_QUESTIONS)
    for (const o of q.options)
      assert.equal(
        validProfileDraft({
          ...draft,
          preferences: { ...draft.preferences, [q.key]: o.value },
        }),
        true,
      );
  const explicit = {
    ...draft,
    preferences: {
      ...draft.preferences,
      colorComparison: "Не знаю / нет предпочтения",
    },
  };
  assert.notEqual(canonicalProfile(draft), canonicalProfile(explicit));
});
test("profile exact schema rejects unknown/identity fields, invalid city, version, revision and byte overflow", () => {
  const draft = emptyProfileDraft(),
    mutationId = randomUUID();
  assert.equal(validProfileMutation({ ...draft, mutationId }), true);
  for (const bad of [
    { ...draft, userId: "456" },
    { ...draft, schemaVersion: 2 },
    { ...draft, preferences: {} },
    { ...draft, preferences: { ...draft.preferences, fit: "guess" } },
    { ...draft, city: { name: "Москва", region: "", source: "manual" } },
    {
      ...draft,
      city: { name: "https://evil.test", region: "RU", source: "manual" },
    },
    {
      ...draft,
      city: { name: "x".repeat(101), region: "RU", source: "manual" },
    },
  ])
    assert.equal(validProfileDraft(bad), false);
  assert.equal(
    validProfileMutation({ ...draft, mutationId: "not-uuid" }),
    false,
  );
  assert.equal(
    validStoredProfile({
      ...draft,
      revision: 1,
      updatedAt: 1,
      lastMutationId: mutationId,
    }),
    true,
  );
  assert.equal(
    validStoredProfile({
      ...draft,
      revision: 0,
      updatedAt: 1,
      lastMutationId: mutationId,
    }),
    false,
  );
  assert.equal(withinProfileBytes("я".repeat(8192)), false);
});
