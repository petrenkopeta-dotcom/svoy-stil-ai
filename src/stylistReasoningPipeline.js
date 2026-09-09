import { reasonAboutColors } from "./colorReasoning.js";
import { reasonAboutSilhouette } from "./silhouetteReasoning.js";
import { reasonAboutContext } from "./contextReasoning.js";
import { renderStylistExplanation } from "./stylistExplanation.js";

export const STYLIST_REASONING_PIPELINE_VERSION = "stylist-reasoning-pipeline/1.0.0";

export const ALLOWED_REASONING_FACT_CODES = Object.freeze([
  "NEUTRAL_BASE_SINGLE_ACCENT",
  "COLOR_FAMILY_REPEATED",
  "RELATED_SHADES_PRESENT",
  "MODERATE_LIGHTNESS_CONTRAST",
  "LIGHT_DARK_BALANCED",
  "SATURATION_SINGLE_FOCUS",
  "SATURATION_LOAD_HIGH",
  "MULTIPLE_ACCENTS_CONFLICT",
  "SIL_VOLUME_DOUBLE_OVERSIZED",
  "SIL_VOLUME_DOUBLE_FITTED",
  "SIL_OUTER_SHORTER_THAN_TOP",
  "SIL_OVERLAPPING_LONG_LENGTHS",
  "SIL_WAISTLINE_PREFERENCE_MISMATCH",
  "CTX_FORMALITY_BELOW_MINIMUM",
  "CTX_OCCASION_EXPLICITLY_EXCLUDED",
  "CTX_TOO_COLD_FOR_OUTFIT",
  "CTX_TOO_WARM_FOR_OUTFIT",
  "CTX_LONG_WALK_LOW_SHOE_COMFORT",
  "CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY",
  "CTX_LONG_STANDING_MEDIUM_SHOE_COMFORT",
]);

const ALLOWED_CODES = new Set(ALLOWED_REASONING_FACT_CODES);

function confirmedItems(items) {
  return Array.isArray(items) ? items.filter((item) => item?.confirmed === true) : [];
}

function publicFacts(results) {
  const seen = new Set();
  return results.flatMap(({ source, result }) => (result.facts ?? []).flatMap((fact) => {
      if (!fact || !ALLOWED_CODES.has(fact.code) || seen.has(fact.code)) return [];
      seen.add(fact.code);
      return [{
        code: fact.code,
        confirmed: true,
        source,
        rule_version: fact.rule_version ?? fact.ruleVersion,
      }];
    }));
}

/**
 * Deterministic, local-only reasoning pipeline. Inputs must contain explicit,
 * user-confirmed garment/context facts; photos and inferred person attributes
 * are intentionally outside this contract.
 */
export function runStylistReasoningPipeline(input = {}, options = {}) {
  const results = [
    { source: "color", result: reasonAboutColors({ items: confirmedItems(input.items) }) },
    { source: "silhouette", result: reasonAboutSilhouette(input.silhouette) },
    { source: "context", result: reasonAboutContext(input.context) },
  ];
  const facts = publicFacts(results);
  const explanation = renderStylistExplanation(facts, { length: options.length });

  return {
    pipeline_version: STYLIST_REASONING_PIPELINE_VERSION,
    facts,
    explanation,
  };
}
