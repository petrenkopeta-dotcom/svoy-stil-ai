import React, { useState } from "react";
import { ArrowRight, Check, CloudSun, Plus, Shirt, Sparkles, X } from "lucide-react";
import { AccessibleDialog } from "./AccessibleDialog.js";

const steps = [
  { icon: Plus, eyebrow: "01 · НАЧНИ ЗДЕСЬ", title: "Добавь любимую вещь", text: "Сфотографируй её — стилист проверит качество и сохранит только на этом устройстве.", action: "Добавить вещь" },
  { icon: CloudSun, eyebrow: "02 · КОНТЕКСТ", title: "Укажи планы и погоду", text: "Так один гардероб превращается в уместные образы для офиса, прогулки или вечера.", action: "Настроить контекст" },
  { icon: Shirt, eyebrow: "03 · РЕЗУЛЬТАТ", title: "Получи объяснённый образ", text: "Увидишь не только сочетание, но и почему работают цвет, силуэт и настроение.", action: "Открыть гардероб" },
];

export function ProductTour({ onClose, onAdd, onContext, onWardrobe }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;
  const runAction = () => {
    if (step === 0) onAdd();
    else if (step === 1) onContext();
    else onWardrobe();
    onClose();
  };
  return <AccessibleDialog as="section" className="product-tour" labelledBy="product-tour-title" describedBy="product-tour-description" onClose={onClose} initialFocus=".product-tour-primary">
      <button className="product-tour-close" onClick={onClose} aria-label="Закрыть знакомство"><X /></button>
      <div className="product-tour-visual" aria-hidden="true"><span className="product-tour-orbit"><Sparkles /></span><Icon size={58} strokeWidth={1.35} /><small>{step + 1} / {steps.length}</small></div>
      <div className="product-tour-copy">
        <div className="product-tour-brand">ATELIER AI · БЫСТРЫЙ СТАРТ</div>
        <div className="product-tour-dots" aria-label={`Шаг ${step + 1} из ${steps.length}`}>{steps.map((item, index) => <span key={item.title} className={index <= step ? "is-active" : ""} />)}</div>
        <p className="product-tour-eyebrow">{current.eyebrow}</p><h2 id="product-tour-title">{current.title}</h2><p id="product-tour-description">{current.text}</p>
        <div className="product-tour-actions"><button className="product-tour-primary" onClick={runAction}>{current.action} <ArrowRight /></button>{step < steps.length - 1 ? <button onClick={() => setStep((value) => value + 1)}>Дальше</button> : <button onClick={onClose}><Check /> Всё понятно</button>}</div>
        <button className="product-tour-skip" onClick={onClose}>Пропустить знакомство</button>
      </div>
  </AccessibleDialog>;
}
