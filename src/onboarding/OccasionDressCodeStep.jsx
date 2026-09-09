import React from "react";
import { Check } from "lucide-react";

export const GOAL_CARDS = [
  { value: "Прогулка", aliases: ["Каждый день", "Учёба"], label: "На каждый день", description: "Спокойно и собранно", dressCode: "Свободный", position: "0% 0%" },
  { value: "Работа", aliases: ["Деловой / офисный"], label: "Деловой / офисный", description: "Уместно и уверенно", legacyDescription: "Работа, встречи и аккуратный офисный гардероб", dressCode: "Деловой", position: "100% 0%" },
  { value: "Встреча", aliases: ["Встреча / выходной", "Свидание"], label: "Встреча / выходной", description: "Теплее и свободнее", dressCode: "Smart casual", position: "0% 100%" },
  { value: "Мероприятие", aliases: ["Формальный / вечерний"], label: "Формальный / вечерний", description: "Сдержанный акцент", legacyDescription: "Торжество, приём или вечернее событие", dressCode: "Формальный", position: "100% 100%" },
];

const isSelected = (card, value) => card.value === value || card.aliases.includes(value);

export function OccasionDressCodeStep({ answers, update }) {
  return <fieldset className="goal-step">
    <legend className="sr-only">Цель образа</legend>
    <p className="goal-step__lead">Выбери ближайший сценарий.</p>
    <div className="goal-card-grid" role="radiogroup" aria-label="Цель образа">
      {GOAL_CARDS.map((card) => {
        const selected = isSelected(card, answers.occasion);
        return <label className={`goal-card${selected ? " is-selected" : ""}`} key={card.value} style={{ "--goal-position": card.position }}>
          <input type="radio" name="onboarding-goal" value={card.value} checked={selected} aria-checked={selected} onChange={() => update({ occasion: card.value, dressCode: card.dressCode })} />
          <span className="goal-card__copy"><b>{card.label}</b><small>{card.description}</small></span>
          {selected && <span className="goal-card__check" aria-hidden="true"><Check size={20} /></span>}
        </label>;
      })}
    </div>
    <p className="goal-step__note">Можно изменить позже</p>
  </fieldset>;
}
