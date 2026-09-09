import React, { useState } from "react";
import { PRODUCT_FUNNEL_EVENT_COUNT } from "./eventDictionary.js";
import { calculatePilotMetrics, ownerMetricRows } from "./pilotMetrics.js";
import "./PilotMetricsPanel.css";

export function PilotMetricsPanel({ collector }) {
  const [revision, setRevision] = useState(0);
  if (collector.environment !== "pilot") return null;
  const events = collector.list();
  const metrics = calculatePilotMetrics(events);
  const rows = ownerMetricRows(metrics);
  const covered = new Set(events.filter((event) => event.category === "product").map((event) => event.name)).size;
  const refresh = () => setRevision((value) => value + 1);
  const download = () => {
    collector.emit("export_requested", { format: "json" });
    const url = URL.createObjectURL(new Blob([collector.exportJson()], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `atelier-pilot-metrics-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url); refresh();
  };
  return <aside className="pilot-metrics" aria-label="Панель результатов локального пилота" data-revision={revision}>
    <details className="pilot-metrics__drawer">
      <summary>Результаты пилота <span className={collector.hasConsent() ? "is-on" : "is-off"}>{collector.hasConsent() ? "Сбор включён" : "Сбор выключен"}</span></summary>
      <div className="pilot-metrics__content">
        <p>Данные остаются в этом браузере. Передача наружу: <b>0</b>.</p>
        <dl>{rows.map((row) => <div key={row.key}><dt>{row.label}</dt><dd>{row.value == null ? "Нет данных" : `${row.value} ${row.unit}`}</dd></div>)}</dl>
        <p className="pilot-metrics__quality">Сессий: {metrics.sessions} · событий: {metrics.events} · увидено типов: {covered} из {PRODUCT_FUNNEL_EVENT_COUNT}. «Нет данных» означает, что знаменатель ещё не собран.</p>
        <div className="pilot-metrics__primary">
          {!collector.hasConsent() && <button type="button" onClick={() => { collector.setConsent(true); refresh(); }}>Разрешить локальный сбор</button>}
          <button type="button" onClick={() => { collector.deleteEvents(); refresh(); }}>Удалить метрики</button>
          <button type="button" onClick={() => { collector.reset(); refresh(); }}>Отозвать согласие и сбросить</button>
        </div>
        <details className="pilot-metrics__export"><summary>Технический экспорт</summary><p>JSON нужен для проверки аналитиком; основные результаты показаны выше.</p><button type="button" disabled={!collector.hasConsent()} onClick={download}>Скачать JSON</button></details>
      </div>
    </details>
  </aside>;
}
