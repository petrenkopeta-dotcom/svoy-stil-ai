# Stylist Reasoning: silhouette and context

Status: deterministic pre-production contract (SR-03)  
Versions: `silhouette.v1`, `context.v1`

The modules evaluate only explicit, confirmed garment metadata and user-entered context. They do not accept a person photo and do not infer body, color type, health, or demographic attributes. Production recognition remains NO-GO.

Each evaluator returns `{ rulesetVersion, facts, constraints }`. A `ReasoningFact` contains a stable `code`, `ruleVersion`, plain-language `explanation`, and the exact `evidence` used. A constraint has `kind: hard | soft`, a machine-readable target, operator, and value. Hard constraints are emitted only for a confirmed incompatibility or an explicit required preference. Missing, invalid, unconfirmed, or unknown data emits no rule and never blocks an outfit.

## Rule inventory

Silhouette (`src/silhouetteReasoning.js`):

1. `SIL_VOLUME_DOUBLE_OVERSIZED` — soft volume-balance suggestion.
2. `SIL_VOLUME_DOUBLE_FITTED` — soft volume-balance suggestion.
3. `SIL_OUTER_SHORTER_THAN_TOP` — soft layer-length suggestion.
4. `SIL_OVERLAPPING_LONG_LENGTHS` — soft length-overlap suggestion.
5. `SIL_WAISTLINE_PREFERENCE_MISMATCH` — soft by default; hard only for an explicit required preference.

Context (`src/contextReasoning.js`):

6. `CTX_FORMALITY_BELOW_MINIMUM` — hard explicit minimum-formality conflict.
7. `CTX_OCCASION_EXPLICITLY_EXCLUDED` — hard explicit occasion exclusion.
8. `CTX_TOO_COLD_FOR_OUTFIT` — hard confirmed temperature-range conflict.
9. `CTX_TOO_WARM_FOR_OUTFIT` — hard confirmed temperature-range conflict.
10. `CTX_LONG_WALK_LOW_SHOE_COMFORT` — hard long-walk/low-comfort conflict.
11. `CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY` — hard active/restricted-mobility conflict.
12. `CTX_LONG_STANDING_MEDIUM_SHOE_COMFORT` — soft comfort improvement.

Consumers must treat unknown enum values as unknown, preserve fact order, and use codes rather than explanation text for automation. Rule changes require a ruleset version bump and deterministic fixture updates.
