import React from "react";
import { readinessView, READINESS_STATES } from "./honestReadiness.js";
import "./HonestReadinessCard.css";

export function HonestReadinessCard({ state, onAddItems, onBuild, onLeaveDemo, onRetry }) {
  const view = readinessView(state);
  const actions = {
    [READINESS_STATES.INSUFFICIENT]: onAddItems,
    [READINESS_STATES.READY]: onBuild,
    [READINESS_STATES.DEMO]: onLeaveDemo,
    [READINESS_STATES.PERSONAL]: onBuild,
    [READINESS_STATES.ERROR]: onRetry,
  };
  const action = actions[view.kind];
  const items = view.isPersonal ? state?.result?.items : [];

  return <section className={`honest-readiness honest-readiness--${view.kind}`} aria-live="polite" aria-labelledby="honest-readiness-title">
    <p className="honest-readiness__eyebrow">{view.eyebrow}</p>
    <h2 id="honest-readiness-title">{view.title}</h2>
    <p className="honest-readiness__body">{view.body}</p>
    {items?.length > 0 && <ul className="honest-readiness__items" aria-label={view.isDemo ? "Демонстрационные вещи" : "Вещи в личном образе"}>
      {items.map((item) => <li key={item.id}>{item.name || "Вещь"}</li>)}
    </ul>}
    {action && <button type="button" onClick={action}>{view.action}</button>}
  </section>;
}
