# Color Reasoning Engine

Status: deterministic reasoning only; production recognition is **NO-GO**.  
Rule set: `color-reasoning/1.0.0`.

`reasonAboutColors({ items })` accepts confirmed structured color features only. Each item has an `id` and optional `color`: `family` (non-empty stable token), `neutral` (boolean), `lightness` and `saturation` (0..100), and `role` (`base`, `support`, or `accent`). `known: false`, a missing family, and invalid values are never inferred from names, photos, or other attributes.

The result contains `engine_version` and `facts`. A fact contains only `code`, structured `evidence`, `item_ids`, `severity`, and `rule_version`; it contains no personalized claim or recommendation.

Rules in version 1.0.0:

- `COLOR_DATA_INSUFFICIENT`
- `NEUTRAL_BASE_SINGLE_ACCENT`
- `COLOR_FAMILY_REPEATED`
- `RELATED_SHADES_PRESENT`
- `MODERATE_LIGHTNESS_CONTRAST`
- `LIGHT_DARK_BALANCED`
- `SATURATION_SINGLE_FOCUS`
- `SATURATION_LOAD_HIGH`
- `MULTIPLE_ACCENTS_CONFLICT`

The engine does not recognize colors, inspect images, infer color type/body/demographics, call providers, rank people, or emit claims such as “this suits you.” Callers must supply confirmed features and map stable fact codes to separately reviewed UI copy.
