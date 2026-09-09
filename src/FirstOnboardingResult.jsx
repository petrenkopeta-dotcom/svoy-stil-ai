import React from "react";
import "./FirstOnboardingResult.css";

export function FirstOnboardingResult({ result, onAction }) {
  if (!result || result.outfit?.kind !== "demo") return null;
  return <section className="first-result" aria-labelledby="first-result-title">
    <header className="first-result__header">
      <p className="first-result__eyebrow">Первый результат</p>
      <h1 id="first-result-title">Вот образ по твоим ответам</h1>
      <p>Мы применили три решения из онбординга:</p>
      <dl className="first-result__summary">
        {result.summary.map((entry) => <div key={entry.key}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}
      </dl>
    </header>

    <article className="first-result__look" aria-labelledby="first-result-demo-label">
      <div className="first-result__look-heading">
        <div><p id="first-result-demo-label" className="first-result__demo-label">Демо-образ</p><h2>Так выглядит выбранная гамма</h2></div>
        <p>Визуальный пример, не твой гардероб</p>
      </div>
      <div className={`first-result__pieces count-${result.outfit.items.length}`} aria-label="Вещи в демо-образе">
        {result.outfit.items.map((item, index) => <div className={`first-result__piece demo-${item.id}`} key={item.id}>
          <span className="first-result__piece-art" aria-hidden="true" />
          <span className="first-result__piece-name"><small>{String(index + 1).padStart(2, "0")} · {item.category}</small><b>{item.name}</b></span>
        </div>)}
      </div>
      {result.outfit.explanation && <p>{result.outfit.explanation}</p>}
      {result.outfit.decisionLinks?.length >= 2 ? <details className="first-result__reasons"><summary><span>Почему именно этот образ</span><small>Короткое объяснение стилиста</small></summary><ul>{result.outfit.decisionLinks.map((link) => <li key={`${link.answer}-${link.decision}`}><b>{link.answer}</b> → {link.decision}</li>)}</ul>{result.outfit.limitations?.length > 0 && <ul className="first-result__limitations" aria-label="Ограничения персонализации">{result.outfit.limitations.map((item) => <li key={item}>{item}</li>)}</ul>}</details> : <p className="first-result__limitation">Метаданных демо-вещей недостаточно, чтобы честно показать две причинные связи.</p>}
      <p className="first-result__notice">Это пример из демо-вещей. Он не сохраняется в личные образы.</p>
    </article>

    <div className="first-result__actions" aria-label="Следующий шаг">
      {result.actions.map((action, index) => <button key={action.id} type="button" className={index === 0 ? "primary" : ""} onClick={() => onAction(action.id)}>{action.label}</button>)}
    </div>
  </section>;
}
