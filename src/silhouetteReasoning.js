export const SILHOUETTE_RULESET_VERSION = "silhouette.v1";

const VOLUME = new Set(["fitted", "regular", "relaxed", "oversized"]);
const LENGTH_RANK = Object.freeze({ cropped: 1, short: 2, hip: 3, midi: 4, long: 5, maxi: 6 });
const WAISTLINE = new Set(["low", "natural", "high", "none"]);

const known = (set, value) => typeof value === "string" && set.has(value);
const fact = (code, explanation, evidence) => ({
  code,
  ruleVersion: SILHOUETTE_RULESET_VERSION,
  explanation,
  evidence,
});
const constraint = (code, kind, target, operator, value) => ({ code, kind, target, operator, value });

/**
 * Evaluates garment metadata only. It never accepts or infers body attributes.
 * Unknown and unconfirmed fields are ignored.
 */
export function reasonAboutSilhouette(input = {}) {
  const top = input.top?.confirmed === true ? input.top : null;
  const bottom = input.bottom?.confirmed === true ? input.bottom : null;
  const outer = input.outer?.confirmed === true ? input.outer : null;
  const preference = input.preference?.confirmed === true ? input.preference : null;
  const facts = [];
  const constraints = [];

  if (known(VOLUME, top?.volume) && known(VOLUME, bottom?.volume) && top.volume === "oversized" && bottom.volume === "oversized") {
    const code = "SIL_VOLUME_DOUBLE_OVERSIZED";
    facts.push(fact(code, "Both main garments are explicitly marked oversized.", { topVolume: top.volume, bottomVolume: bottom.volume }));
    constraints.push(constraint(code, "soft", "outfit", "prefer_at_most_one", { volume: "oversized", count: 1 }));
  }

  if (known(VOLUME, top?.volume) && known(VOLUME, bottom?.volume) && top.volume === "fitted" && bottom.volume === "fitted") {
    const code = "SIL_VOLUME_DOUBLE_FITTED";
    facts.push(fact(code, "Both main garments are explicitly marked fitted.", { topVolume: top.volume, bottomVolume: bottom.volume }));
    constraints.push(constraint(code, "soft", "outfit", "prefer_at_least_one", { volume: ["regular", "relaxed"] }));
  }

  if (LENGTH_RANK[outer?.length] && LENGTH_RANK[top?.length] && LENGTH_RANK[outer.length] < LENGTH_RANK[top.length]) {
    const code = "SIL_OUTER_SHORTER_THAN_TOP";
    facts.push(fact(code, "The confirmed outer layer is shorter than the confirmed top.", { outerLength: outer.length, topLength: top.length }));
    constraints.push(constraint(code, "soft", "outer", "prefer_length_rank_gte", top.length));
  }

  if (LENGTH_RANK[top?.length] >= LENGTH_RANK.midi && LENGTH_RANK[bottom?.length] >= LENGTH_RANK.midi) {
    const code = "SIL_OVERLAPPING_LONG_LENGTHS";
    facts.push(fact(code, "The confirmed top and bottom both have midi-or-longer length.", { topLength: top.length, bottomLength: bottom.length }));
    constraints.push(constraint(code, "soft", "outfit", "prefer_one_length_below", "midi"));
  }

  if (known(WAISTLINE, preference?.waistline) && preference.waistline !== "none" && known(WAISTLINE, bottom?.waistline) && bottom.waistline !== preference.waistline) {
    const code = "SIL_WAISTLINE_PREFERENCE_MISMATCH";
    facts.push(fact(code, "The confirmed garment waistline differs from an explicit confirmed preference.", { preferred: preference.waistline, actual: bottom.waistline }));
    constraints.push(constraint(code, preference.required === true ? "hard" : "soft", "bottom.waistline", "equals", preference.waistline));
  }

  return { rulesetVersion: SILHOUETTE_RULESET_VERSION, facts, constraints };
}
