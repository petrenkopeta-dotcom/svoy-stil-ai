import { VK_QUESTIONS } from "./vkStagingJourney.js";
import { placeText } from "./vkStagingCity.js";

export const PROFILE_SCHEMA_VERSION = 1;
export const PROFILE_MAX_BYTES = 16384;
export const profileEtag = (revision) => `"profile-${revision}"`;
export const validMutationId = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
const exact = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export function withinProfileBytes(value) {
  try {
    const raw = JSON.stringify(value);
    return (
      typeof raw === "string" &&
      new TextEncoder().encode(raw).length <= PROFILE_MAX_BYTES
    );
  } catch {
    return false;
  }
}
export const emptyProfileDraft = () => ({
  schemaVersion: 1,
  preferences: { occasion: null, fit: null, colorComparison: null },
  city: null,
});
export function validProfileDraft(value) {
  return (
    exact(value, ["schemaVersion", "preferences", "city"]) &&
    value.schemaVersion === 1 &&
    exact(
      value.preferences,
      VK_QUESTIONS.map((q) => q.key),
    ) &&
    VK_QUESTIONS.every(
      (q) =>
        value.preferences[q.key] === null ||
        q.options.some((o) => o.value === value.preferences[q.key]),
    ) &&
    (value.city === null ||
      (exact(value.city, ["name", "region", "source"]) &&
        [value.city.name, value.city.region].every(
          (s) => typeof s === "string" && placeText(s) === s,
        ) &&
        ["manual", "profile_confirmed"].includes(value.city.source))) &&
    withinProfileBytes(value)
  );
}
export const profileContent = (value) => ({
  schemaVersion: value.schemaVersion,
  preferences: value.preferences,
  city: value.city,
});
export const validProfileMutation = (value) =>
  exact(value, ["schemaVersion", "preferences", "city", "mutationId"]) &&
  validMutationId(value.mutationId) &&
  validProfileDraft(profileContent(value)) &&
  withinProfileBytes(value);
export const validStoredProfile = (value) =>
  exact(value, [
    "schemaVersion",
    "preferences",
    "city",
    "revision",
    "updatedAt",
    "lastMutationId",
  ]) &&
  validProfileDraft(profileContent(value)) &&
  Number.isSafeInteger(value.revision) &&
  value.revision > 0 &&
  Number.isSafeInteger(value.updatedAt) &&
  value.updatedAt >= 0 &&
  validMutationId(value.lastMutationId);
// Canonical ordering permits semantically identical JSON requests to deduplicate.
export const canonicalProfile = (value) =>
  JSON.stringify({
    schemaVersion: 1,
    preferences: Object.fromEntries(
      VK_QUESTIONS.map((q) => [q.key, value.preferences[q.key]]),
    ),
    city:
      value.city === null
        ? null
        : {
            name: value.city.name,
            region: value.city.region,
            source: value.city.source,
          },
  });
