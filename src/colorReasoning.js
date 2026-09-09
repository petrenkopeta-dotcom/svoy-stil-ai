export const COLOR_REASONING_VERSION = "color-reasoning/1.0.0";

const validMetric = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const roles = new Set(["base", "support", "accent"]);
const ids = (items) => items.slice().sort((a, b) => a.index - b.index).map((x) => x.id);
const fact = (code, severity, items, evidence) => ({
  code, evidence, item_ids: ids(items), severity, rule_version: COLOR_REASONING_VERSION,
});

function normalize(item, index) {
  const color = item?.color;
  if ((typeof item?.id !== "string" && typeof item?.id !== "number") || !color || color.known === false) return null;
  if (typeof color.family !== "string" || !color.family.trim()) return null;
  return { id: item.id, index, family: color.family.trim().toLowerCase(), neutral: color.neutral === true,
    lightness: validMetric(color.lightness) ? color.lightness : null,
    saturation: validMetric(color.saturation) ? color.saturation : null,
    role: roles.has(color.role) ? color.role : null };
}

export function reasonAboutColors(input) {
  const source = Array.isArray(input?.items) ? input.items : [];
  const known = source.map(normalize).filter(Boolean);
  const facts = [];
  if (known.length < 2) {
    facts.push(fact("COLOR_DATA_INSUFFICIENT", "warning", known, { known_item_count: known.length,
      total_item_count: source.length, required_known_item_count: 2 }));
    return { engine_version: COLOR_REASONING_VERSION, facts };
  }
  const neutrals = known.filter((x) => x.neutral);
  const accents = known.filter((x) => x.role === "accent" && !x.neutral);
  if (neutrals.length && accents.length === 1) facts.push(fact("NEUTRAL_BASE_SINGLE_ACCENT", "info", [...neutrals, ...accents], { neutral_count: neutrals.length, accent_count: 1 }));

  const counts = new Map();
  known.forEach((x) => counts.set(x.family, (counts.get(x.family) ?? 0) + 1));
  const repeatedFamilies = [...counts].filter(([, n]) => n >= 2).map(([family]) => family);
  const repeated = known.filter((x) => repeatedFamilies.includes(x.family));
  if (repeated.length) facts.push(fact("COLOR_FAMILY_REPEATED", "info", repeated, { repeated_family_count: repeatedFamilies.length, repeated_item_count: repeated.length }));

  const chromatic = known.filter((x) => !x.neutral);
  if (chromatic.length >= 2 && new Set(chromatic.map((x) => x.family)).size === 1) facts.push(fact("RELATED_SHADES_PRESENT", "info", chromatic, { chromatic_item_count: chromatic.length, chromatic_family_count: 1 }));

  const lightness = known.filter((x) => x.lightness !== null);
  if (lightness.length >= 2) {
    const values = lightness.map((x) => x.lightness);
    const range = Math.max(...values) - Math.min(...values);
    if (range >= 25 && range <= 65) facts.push(fact("MODERATE_LIGHTNESS_CONTRAST", "info", lightness, { lightness_range: range, lower_bound: 25, upper_bound: 65 }));
    const light = lightness.filter((x) => x.lightness >= 65), dark = lightness.filter((x) => x.lightness <= 35);
    if (light.length && dark.length && Math.abs(light.length - dark.length) <= 1) facts.push(fact("LIGHT_DARK_BALANCED", "info", [...light, ...dark], { light_item_count: light.length, dark_item_count: dark.length }));
  }

  const saturation = known.filter((x) => x.saturation !== null);
  if (saturation.length >= 2) {
    const vivid = saturation.filter((x) => x.saturation >= 70), restrained = saturation.filter((x) => x.saturation <= 45);
    if (vivid.length === 1 && restrained.length) facts.push(fact("SATURATION_SINGLE_FOCUS", "info", [...vivid, ...restrained], { vivid_item_count: 1, restrained_item_count: restrained.length }));
    else if (vivid.length >= 3 && vivid.length / saturation.length > 0.6) facts.push(fact("SATURATION_LOAD_HIGH", "warning", vivid, { vivid_item_count: vivid.length, measured_item_count: saturation.length, vivid_share: Math.round(vivid.length / saturation.length * 100) / 100 }));
  }
  const accentFamilyCount = new Set(accents.map((x) => x.family)).size;
  if (accents.length >= 2 && accentFamilyCount >= 2) facts.push(fact("MULTIPLE_ACCENTS_CONFLICT", "warning", accents, { accent_item_count: accents.length, accent_family_count: accentFamilyCount }));
  return { engine_version: COLOR_REASONING_VERSION, facts };
}
