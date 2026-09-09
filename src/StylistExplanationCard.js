import React, { useId, useState } from "react";
import { renderStylistExplanation } from "./stylistExplanation.js";

const h = React.createElement;

export function StylistExplanationCard({ facts = [], status = "ready", errorMessage = "", onRate }) {
  const [expanded, setExpanded] = useState(false);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const detailsId = `${baseId}-details`;
  if (status === "loading") return h("section", { className: "stylist-explanation is-loading", "aria-busy": "true", "aria-live": "polite", "aria-labelledby": titleId }, h("h3", { id: titleId }, "Почему сочетается"), h("p", null, "Собираю объяснение по подтверждённым данным…"));
  if (status === "error") return h("section", { className: "stylist-explanation is-error", role: "alert", "aria-labelledby": titleId }, h("h3", { id: titleId }, "Почему сочетается"), h("p", null, errorMessage || "Не удалось подготовить объяснение. Сам образ можно использовать как обычно."));

  const explanation = renderStylistExplanation(facts, { length: expanded ? "long" : "short" });
  if (status === "empty" || !explanation.sections.some((section) => section.supported)) return h("section", { className: "stylist-explanation is-empty", "aria-labelledby": titleId }, h("h3", { id: titleId }, "Почему сочетается"), h("p", null, "Пока недостаточно подтверждённых данных, чтобы объяснить этот образ без догадок."));

  return h("section", { className: "stylist-explanation", "aria-labelledby": titleId },
    h("div", { className: "stylist-explanation__head" }, h("div", null, h("span", null, "ЛОГИКА ОБРАЗА"), h("h3", { id: titleId }, "Почему сочетается")), h("button", { type: "button", className: "stylist-explanation__toggle", onClick: () => setExpanded((value) => !value), "aria-expanded": expanded, "aria-controls": detailsId }, expanded ? "Свернуть" : "Подробнее")),
    h("div", { id: detailsId, className: "stylist-explanation__grid" }, explanation.sections.map((section) => h("div", { key: section.id, className: section.supported ? "" : "is-unsupported" }, h("h4", null, section.id === "context" ? "Повод и комфорт" : section.id === "profile" ? "Учтено из профиля" : section.title), h("p", null, section.text)))),
    h("p", { className: "stylist-explanation__advice" }, explanation.advice.replace(/^Практический совет:\s*/i, "")),
    onRate && h("div", { className: "stylist-explanation__rating", "aria-label": "Оценить объяснение" }, h("span", null, "Объяснение помогло?"), h("button", { type: "button", onClick: () => onRate(true) }, "Да"), h("button", { type: "button", onClick: () => onRate(false) }, "Не совсем")),
    h("span", { className: "sr-only" }, explanation.accessibility_label));
}
