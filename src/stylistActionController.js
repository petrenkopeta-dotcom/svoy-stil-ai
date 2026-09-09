import { adaptCandidateItem, generateAndRankCandidates } from "./stylistCandidateEngine.js";

export const STYLIST_ACTION_COPY = Object.freeze({
  calmer: { label: "Спокойнее", why: "Уменьшили количество цветовых акцентов." },
  brighter: { label: "Ярче", why: "Добавили более заметный цветовой акцент." },
  more_formal: { label: "Официальнее", why: "Выбрали более собранные и формальные вещи." },
  more_comfortable: { label: "Комфортнее", why: "Отдали приоритет мягким и свободным вещам." },
  replace_shoes_only: { label: "Заменить только обувь", why: "Сохранили весь комплект и заменили только обувь." },
});

const norm = (value) => String(value ?? "").trim().toLowerCase();
const idOf = (item) => String(item.garment_id ?? item.id);
const categoryOf = (item) => adaptCandidateItem(item).category;
const colorOf = (item) => norm(item.colors?.[0]?.name ?? item.color);
const neutral = /black|white|gray|grey|beige|brown|navy|cream|ч[её]рн|бел|сер|беж|корич|молоч/;

function actionValue(candidate, code) {
  const items = candidate.items;
  if (code === "calmer" || code === "brighter") {
    const accents = items.filter((item) => !neutral.test(colorOf(item))).length;
    return code === "calmer" ? -accents : accents;
  }
  if (code === "more_formal") return items.reduce((sum, item) => sum + (Number(item.formality) || 3), 0) / items.length;
  if (code === "more_comfortable") return items.reduce((sum, item) => sum + (item.comfort_tags?.length ? 1 : 0) + (/soft|relaxed|loose|мяг|свобод/.test(norm(`${item.style_tags} ${item.style} ${item.fit}`)) ? 1 : 0), 0);
  return 0;
}

function sameNonShoes(candidate, current) {
  const ids = (items) => items.filter((item) => categoryOf(item) !== "shoes").map(idOf).sort();
  return JSON.stringify(ids(candidate.items)) === JSON.stringify(ids(current.items));
}

function describeChange(before, after) {
  const beforeIds = new Set(before.items.map(idOf));
  const afterIds = new Set(after.items.map(idOf));
  const removed = before.items.filter((item) => !afterIds.has(idOf(item)));
  const added = after.items.filter((item) => !beforeIds.has(idOf(item)));
  const categories = [...new Set([...removed, ...added].map(categoryOf))];
  return { removed: removed.map((item) => item.display_name ?? item.name ?? idOf(item)), added: added.map((item) => item.display_name ?? item.name ?? idOf(item)), categories };
}

export function regenerateForStylistAction({ action, wardrobe, request = {}, currentCandidate }) {
  if (!STYLIST_ACTION_COPY[action]) return { status: "invalid_action", action };
  if (!currentCandidate?.items?.length) return { status: "no_alternative", action, reason: "current_candidate_missing" };
  const generated = generateAndRankCandidates(wardrobe, { ...request, limit: 50 });
  let alternatives = generated.candidates.filter((candidate) => candidate.signature !== currentCandidate.signature);
  if (action === "replace_shoes_only") alternatives = alternatives.filter((candidate) => sameNonShoes(candidate, currentCandidate));
  else alternatives.sort((a, b) => actionValue(b, action) - actionValue(a, action) || a.signature.localeCompare(b.signature));
  const candidate = alternatives[0];
  if (!candidate) return { status: "no_alternative", action, reason: action === "replace_shoes_only" ? "no_other_shoes" : "no_matching_candidate", preserved: { anchorId: request.anchorId ?? null, hardConstraints: true } };
  return { status: "changed", action, candidate, change: describeChange(currentCandidate, candidate), why: STYLIST_ACTION_COPY[action].why, preserved: { anchorId: request.anchorId ?? null, hardConstraints: true } };
}

export function createStylistActionController(run = regenerateForStylistAction) {
  let pending = null;
  return {
    get loading() { return pending !== null; },
    async dispatch(input) {
      if (pending) return { status: "ignored", reason: "action_in_progress", action: input.action };
      pending = input.action;
      try { return await Promise.resolve().then(() => run(input)); }
      finally { pending = null; }
    },
  };
}
