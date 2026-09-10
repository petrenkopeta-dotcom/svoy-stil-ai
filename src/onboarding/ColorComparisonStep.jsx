import React from "react";
import { Check } from "lucide-react";

export const COLOR_COMPARISONS = [
  { label: "Тёмно-синий + молочный", colors: ["#24344d", "#f3eadb"] },
  { label: "Оливковый + песочный", colors: ["#74785a", "#d8bf94"] },
  { label: "Бордовый + серый", colors: ["#742f3d", "#aaa7a2"] },
  { label: "Чёрный + белый", colors: ["#242422", "#f7f4ed"] },
  { label: "Не знаю / нет предпочтения", colors: ["#d8d4ca", "#ebe7de"], neutral: true },
];

export function ColorComparisonStep({ answers, update }) {
  return <fieldset className="choice color-comparison" role="radiogroup" aria-labelledby="onboarding-04-label" aria-describedby="onboarding-04-description">
    <legend className="choice-legend"><span className="num" aria-hidden="true">03</span><span className="choice-title" id="onboarding-04-label">Какое сочетание вам ближе?</span></legend>
    <p className="choice-description" id="onboarding-04-description">Смотрите на свотчи, а не на названия. Это не определяет цветотип — только помогает начать.</p>
    <div className="color-pair-grid">{COLOR_COMPARISONS.map((option, index) => {
      const selected = answers.colorComparison === option.label;
      const id = `onboarding-04-option-${index}`;
      return <label className={`color-pair-card${selected ? " active" : ""}${option.neutral ? " neutral" : ""}`} htmlFor={id} key={option.label}>
        <input id={id} name="onboarding-04" type="radio" value={option.label} checked={selected} aria-label={option.label} required onChange={() => update({ colorComparison: option.label })} />
        <span className="color-pair-swatch" aria-hidden="true"><i style={{ backgroundColor: option.colors[0] }} /><i style={{ backgroundColor: option.colors[1] }} /></span>
        <span className="color-pair-label">{option.label}</span><span className="color-pair-check" aria-hidden="true">{selected && <Check size={18} />}</span>
      </label>;
    })}</div>
  </fieldset>;
}
