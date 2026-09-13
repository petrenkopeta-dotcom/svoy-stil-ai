/** Memory-only preparation for city UI. No profile, forecast, GPS or storage calls.
 * Profile city is a suggestion, never signed identity or an automatic selection.
 * A future forecast adapter receives only a resolved place, never VK UserInfo.
 */
const placeText = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[\p{L}\p{M}\p{N} .,'’()\-]+$/u.test(value)
  )
    return null;
  const text = value.trim().replace(/ +/g, " ");
  return text && /[\p{L}\p{N}]/u.test(text) ? text : null;
};

export function createVkCityContext() {
  let epoch = 0,
    selected = null,
    proposal = null;
  const select = (name, region, source) => {
    const checkedName = placeText(name),
      checkedRegion = placeText(region);
    // Explicit region disambiguates same-name cities before future geocoding.
    if (!checkedName || !checkedRegion) throw new Error("city_region_required");
    selected = Object.freeze({
      name: checkedName,
      region: checkedRegion,
      source,
    });
    proposal = null;
    epoch++;
    return selected;
  };
  return Object.freeze({
    snapshot: () =>
      Object.freeze({ selected, proposal, forecast: "not_connected" }),
    setManual: (name, region) => select(name, region, "manual"),
    beginProfileRequest: () => ++epoch,
    offerProfile(token, userInfo) {
      if (token !== epoch || selected) return false;
      const name = placeText(userInfo?.city?.title);
      // Copy the one required field; do not retain id/name/photo/birthday.
      proposal = name ? Object.freeze({ name }) : null;
      return !!proposal;
    },
    confirmProfile(region) {
      if (!proposal) throw new Error("city_proposal_required");
      return select(proposal.name, region, "profile_confirmed");
    },
    reset() {
      epoch++;
      selected = null;
      proposal = null;
    },
  });
}
