export const CAPSULE_EXPLANATION_VERSION = "capsule-explanation/1.0.0";

const DIMENSIONS = Object.freeze(["color", "silhouette", "context", "practical_advice"]);
const STATUS = new Set(["supported", "tradeoff", "unknown", "not_applicable"]);
const FORBIDDEN_CLAIM = /(стройн|молод|цветотип|фигур|тел[ауо]|идеаль|точно (?:сядет|подойд)|гарант|процент|тариф|купить)/i;

const UNKNOWN_TEXT = Object.freeze({
  color: "Цвета вещей не подтверждены; палитру пока не оцениваю.",
  silhouette: "Объём, посадка или длина ключевых вещей не подтверждены.",
  context: "Повод и условия не подтверждены; уместность пока не оцениваю.",
  practical_advice: "Без подтверждённого компромисса конкретный приём не предлагаю.",
});

const copy = (value) => JSON.parse(JSON.stringify(value));
const safeFacts = (facts) => new Map((Array.isArray(facts) ? facts : [])
  .filter((fact) => fact && typeof fact.fact_id === "string" && fact.fact_id && fact.confirmed === true)
  .map((fact) => [fact.fact_id, fact]));

function renderDimension(name, input, facts) {
  const source = input && typeof input === "object" ? input : {};
  const requested = Array.isArray(source.fact_ids) ? [...new Set(source.fact_ids)] : [];
  const factIds = requested.filter((factId) => facts.has(factId));
  const fullyGrounded = requested.length > 0 && factIds.length === requested.length;
  const status = STATUS.has(source.status) ? source.status : "unknown";
  const canClaim = fullyGrounded && status !== "unknown";
  const candidateText = typeof source.text === "string" ? source.text.trim() : "";
  const safeText = candidateText && !FORBIDDEN_CLAIM.test(candidateText) ? candidateText : "";
  const finalStatus = canClaim && safeText ? status : "unknown";
  const action = finalStatus === "tradeoff" && typeof source.action === "string" && source.action.trim() && !FORBIDDEN_CLAIM.test(source.action)
    ? source.action.trim()
    : null;
  if (finalStatus === "tradeoff" && !action) {
    return { status: "unknown", fact_ids: [], text: UNKNOWN_TEXT[name], action: null };
  }
  return {
    status: finalStatus,
    fact_ids: finalStatus === "unknown" ? [] : factIds,
    text: finalStatus === "unknown" ? UNKNOWN_TEXT[name] : safeText,
    action,
  };
}
export function createCapsuleExplanation(trace = {}) {
  const facts = safeFacts(trace.facts);
  const dimensions = Object.fromEntries(DIMENSIONS.map((name) => [name, renderDimension(name, trace.dimensions?.[name], facts)]));
  const known = DIMENSIONS.filter((name) => dimensions[name].status !== "unknown");
  const confidence = known.length === DIMENSIONS.length ? "high" : known.length >= 2 ? "medium" : "low";
  const source = trace.source === "personal" ? "personal" : "demo";
  const summary = known.length
    ? `${source === "demo" ? "Пример на демо-вещах. " : ""}Объяснение основано на ${known.length} из ${DIMENSIONS.length} подтверждённых разделов.`
    : `${source === "demo" ? "Пример на демо-вещах. " : ""}Пока недостаточно подтверждённых фактов.`;
  return copy({
    version: CAPSULE_EXPLANATION_VERSION,
    source,
    trace_id: typeof trace.trace_id === "string" ? trace.trace_id : null,
    confidence,
    summary,
    dimensions,
    limitation: "Посадка, комфорт и личный вкус без примерки или явной оценки не подтверждены.",
  });
}
