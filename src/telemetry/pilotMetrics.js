const duration = (start, end) => start && end ? Math.max(0, Date.parse(end) - Date.parse(start)) : null;
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const percent = (value) => value == null ? null : Math.round(value * 1000) / 10;

function sessionRate(events, numeratorName, denominatorName) {
  const sessions = new Map();
  for (const event of events) {
    const names = sessions.get(event.session_id) || new Set();
    names.add(event.name);
    sessions.set(event.session_id, names);
  }
  const eligible = [...sessions.values()].filter((names) => names.has(denominatorName));
  return ratio(eligible.filter((names) => names.has(numeratorName)).length, eligible.length);
}

export function calculatePilotMetrics(events) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const count = (name) => sorted.filter((event) => event.name === name).length;
  const first = (name) => sorted.find((event) => event.name === name)?.timestamp;
  const sessions = new Set(sorted.map((event) => event.session_id));
  const wouldWearFirst3 = sorted.filter((event) => event.name === "would_wear_recorded" && event.properties.sequence <= 3).length;
  const explanation = sorted.filter((event) => event.name === "explanation_rated");
  return {
    environment: sorted[0]?.environment || null,
    events: sorted.length,
    sessions: sessions.size,
    ttfr_ms: duration(first("onboarding_started"), first("first_result_shown")),
    onboarding_completion_rate: sessionRate(sorted, "onboarding_completed", "onboarding_started"),
    auth_success_rate: sessionRate(sorted, "auth_succeeded", "auth_code_requested"),
    first_item_success_rate: sessionRate(sorted, "first_item_completed", "first_item_started"),
    qwwr_at_3: ratio(wouldWearFirst3, Math.min(3, count("look_generated"))),
    explanation_usefulness: ratio(explanation.filter((event) => event.properties.useful).length, explanation.length),
    second_item_intent_rate: ratio(count("second_item_intent"), count("first_item_completed")),
    d1_returns: sorted.filter((event) => event.name === "session_returned" && event.properties.day_bucket === "d1").length,
    d7_returns: sorted.filter((event) => event.name === "session_returned" && event.properties.day_bucket === "d7").length,
    technical_errors: count("stage_error") + count("storage_failure") + count("db_failure"),
  };
}

export function ownerMetricRows(metrics) {
  return [
    { key: "onboarding", label: "Завершили онбординг", value: percent(metrics.onboarding_completion_rate), unit: "%" },
    { key: "first_result", label: "До первого результата", value: metrics.ttfr_ms, unit: "мс" },
    { key: "first_item", label: "Добавили первую вещь", value: percent(metrics.first_item_success_rate), unit: "%" },
    { key: "would_wear", label: "Надела бы · первые 3 образа", value: percent(metrics.qwwr_at_3), unit: "%" },
    { key: "usefulness", label: "Объяснение полезно", value: percent(metrics.explanation_usefulness), unit: "%" },
    { key: "second_item", label: "Хотят добавить вторую вещь", value: percent(metrics.second_item_intent_rate), unit: "%" },
  ];
}
