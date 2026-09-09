export const CONTEXT_RULESET_VERSION = "context.v1";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const confirmed = (value) => value?.confirmed === true;
const fact = (code, explanation, evidence) => ({ code, ruleVersion: CONTEXT_RULESET_VERSION, explanation, evidence });
const constraint = (code, kind, target, operator, value) => ({ code, kind, target, operator, value });

/** Evaluates explicit context and confirmed garment metadata; unknowns never reject an outfit. */
export function reasonAboutContext(input = {}) {
  const context = confirmed(input.context) ? input.context : null;
  const outfit = confirmed(input.outfit) ? input.outfit : null;
  const shoes = confirmed(input.shoes) ? input.shoes : null;
  const facts = [];
  const constraints = [];

  if (finite(context?.minFormality) && finite(outfit?.formality) && outfit.formality < context.minFormality) {
    const code = "CTX_FORMALITY_BELOW_MINIMUM";
    facts.push(fact(code, "Outfit formality is below the explicit occasion minimum.", { minimum: context.minFormality, actual: outfit.formality }));
    constraints.push(constraint(code, "hard", "outfit.formality", "gte", context.minFormality));
  }

  if (typeof context?.occasion === "string" && Array.isArray(outfit?.excludedOccasions) && outfit.excludedOccasions.includes(context.occasion)) {
    const code = "CTX_OCCASION_EXPLICITLY_EXCLUDED";
    facts.push(fact(code, "The confirmed outfit metadata explicitly excludes the requested occasion.", { occasion: context.occasion }));
    constraints.push(constraint(code, "hard", "outfit.excludedOccasions", "not_contains", context.occasion));
  }

  if (finite(context?.temperatureC) && finite(outfit?.minTemperatureC) && context.temperatureC < outfit.minTemperatureC) {
    const code = "CTX_TOO_COLD_FOR_OUTFIT";
    facts.push(fact(code, "The explicit temperature is below the outfit's confirmed minimum.", { temperatureC: context.temperatureC, minimumC: outfit.minTemperatureC }));
    constraints.push(constraint(code, "hard", "outfit.minTemperatureC", "lte", context.temperatureC));
  }

  if (finite(context?.temperatureC) && finite(outfit?.maxTemperatureC) && context.temperatureC > outfit.maxTemperatureC) {
    const code = "CTX_TOO_WARM_FOR_OUTFIT";
    facts.push(fact(code, "The explicit temperature is above the outfit's confirmed maximum.", { temperatureC: context.temperatureC, maximumC: outfit.maxTemperatureC }));
    constraints.push(constraint(code, "hard", "outfit.maxTemperatureC", "gte", context.temperatureC));
  }

  if (finite(context?.walkingMinutes) && context.walkingMinutes >= 30 && shoes?.walkingComfort === "low") {
    const code = "CTX_LONG_WALK_LOW_SHOE_COMFORT";
    facts.push(fact(code, "A long walk is explicit and shoe walking comfort is confirmed low.", { walkingMinutes: context.walkingMinutes, walkingComfort: shoes.walkingComfort }));
    constraints.push(constraint(code, "hard", "shoes.walkingComfort", "in", ["medium", "high"]));
  }

  if (context?.activity === "active" && outfit?.mobility === "restricted") {
    const code = "CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY";
    facts.push(fact(code, "The activity is explicitly active while outfit mobility is confirmed restricted.", { activity: context.activity, mobility: outfit.mobility }));
    constraints.push(constraint(code, "hard", "outfit.mobility", "in", ["standard", "free"]));
  }

  if (finite(context?.standingMinutes) && context.standingMinutes >= 60 && shoes?.standingComfort === "medium") {
    const code = "CTX_LONG_STANDING_MEDIUM_SHOE_COMFORT";
    facts.push(fact(code, "Extended standing is explicit and shoe standing comfort is only medium.", { standingMinutes: context.standingMinutes, standingComfort: shoes.standingComfort }));
    constraints.push(constraint(code, "soft", "shoes.standingComfort", "equals", "high"));
  }

  return { rulesetVersion: CONTEXT_RULESET_VERSION, facts, constraints };
}
