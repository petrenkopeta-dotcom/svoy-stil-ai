export function createCloudProfileAdapter({ request }) {
  if (typeof request !== "function") throw new TypeError("authenticated request is required");
  return {
    async load() { return request({ method: "GET", path: "/rest/v1/profiles?select=user_id,avatar_index,updated_at" }); },
    async saveAvatar(avatarIndex) {
      const value = Number(avatarIndex); if (!Number.isInteger(value) || value < 1 || value > 9) throw new RangeError("avatar_index must be 1..9");
      return request({ method: "PATCH", path: "/rest/v1/profiles", body: { avatar_index: value }, prefer: "return=representation" });
    },
    async savePreferences(preferences, revision) { return request({ method: "PATCH", path: "/rest/v1/stylist_preferences", body: { preferences, revision }, prefer: "return=representation" }); },
  };
}
