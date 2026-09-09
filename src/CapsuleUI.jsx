import React, { useId, useMemo, useState } from "react";
import "./CapsuleUI.css";

export const CAPSULE_MODE = Object.freeze({ DEMO: "demo", PERSONAL: "personal" });

function SourceBadge({ mode }) {
  return <span className={`capsule-badge capsule-badge--${mode}`}>{mode === CAPSULE_MODE.DEMO ? "Демо · не сохраняется" : "Личная"}</span>;
}

export function CapsuleEntry({ mode = CAPSULE_MODE.DEMO, onPrimary, onExample }) {
  const personal = mode === CAPSULE_MODE.PERSONAL;
  return <section className="capsule-entry" aria-labelledby="capsule-entry-title">
    <p className="capsule-eyebrow">КАПСУЛЫ</p>
    <h1 id="capsule-entry-title">Меньше решений — больше готовых образов</h1>
    <p>Собирайте небольшие наборы вещей для конкретной жизни: работы, поездки или сезона.</p>
    <div className="capsule-actions">
      <button className="capsule-button capsule-button--primary" type="button" onClick={onPrimary}>{personal ? "Собрать капсулу" : "Посмотреть 8 образов"}</button>
      {personal && <button className="capsule-button capsule-button--quiet" type="button" onClick={onExample}>Посмотреть пример</button>}
    </div>
  </section>;
}

export function CapsuleCard({ capsule, onOpen }) {
  const titleId = useId();
  const items = Number.isFinite(capsule.itemCount) ? capsule.itemCount : 0;
  const outfits = Number.isFinite(capsule.outfitCount) ? capsule.outfitCount : 0;
  return <article className="capsule-card" aria-labelledby={titleId}>
    <div className="capsule-preview">
      {capsule.image ? <img src={capsule.image} alt={capsule.imageAlt || "Состав капсулы"} /> : <span aria-hidden="true">небольшой набор<br />для реальной жизни</span>}
    </div>
    <SourceBadge mode={capsule.mode} />
    <h2 id={titleId}>{capsule.name || "Капсула без названия"}</h2>
    <p className="capsule-counts">{items} вещей · {outfits} образов</p>
    {capsule.contexts?.length > 0 && <ul className="capsule-chips" aria-label="Условия капсулы">{capsule.contexts.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul>}
    <p className="capsule-status"><span aria-hidden="true">●</span> {capsule.status || "Готова"}</p>
    <button className="capsule-link" type="button" onClick={() => onOpen?.(capsule)}>{capsule.status === "Нужно добавить обувь" ? "Продолжить сборку" : "Открыть капсулу"}</button>
  </article>;
}

export function CapsuleDetail({ capsule, onOutfits, onSecondary }) {
  const personal = capsule.mode === CAPSULE_MODE.PERSONAL;
  return <article className="capsule-detail">
    <header className="capsule-detail__hero">
      <SourceBadge mode={capsule.mode} />
      <h1>{capsule.name || "Капсула без названия"}</h1>
      <p>{capsule.itemCount || 0} вещей собраны в {capsule.outfitCount || 0} готовых образов{capsule.summaryContext ? ` ${capsule.summaryContext}` : ""}.</p>
      <ul className="capsule-chips" aria-label="Условия капсулы">{(capsule.contexts || []).map((item) => <li key={item}>{item}</li>)}</ul>
      <div className="capsule-actions"><button className="capsule-button capsule-button--primary" type="button" onClick={onOutfits}>Посмотреть образы</button><button className="capsule-button capsule-button--quiet" type="button" onClick={onSecondary}>{personal ? "Изменить состав" : "Перейти в мой гардероб"}</button></div>
    </header>
    <section aria-labelledby="capsule-items-title"><h2 id="capsule-items-title">В капсуле</h2><ul className="capsule-item-grid">{(capsule.items || []).map((item) => <li key={item.id}><div className="capsule-item-media">{item.image ? <img src={item.image} alt="" /> : <span aria-hidden="true">{item.category?.slice(0, 1) || "•"}</span>}</div><strong>{item.available === false ? "Вещь больше недоступна" : item.name}</strong><small>{item.category}</small>{capsule.mode === CAPSULE_MODE.DEMO && <SourceBadge mode="demo" />}</li>)}</ul></section>
  </article>;
}

export function OutfitMatrix({ outfits = [], mode = CAPSULE_MODE.DEMO, onOpen, onReplace }) {
  const [filter, setFilter] = useState("Все");
  const filters = useMemo(() => ["Все", ...new Set(outfits.map((item) => item.context).filter(Boolean))], [outfits]);
  const visible = filter === "Все" ? outfits : outfits.filter((item) => item.context === filter);
  return <section className="outfit-matrix" aria-labelledby="outfit-matrix-title"><header><p className="capsule-eyebrow">ГОТОВЫЕ СОЧЕТАНИЯ</p><h2 id="outfit-matrix-title">Матрица образов</h2></header><fieldset className="outfit-filters"><legend>Фильтр по ситуации</legend>{filters.map((item) => <label key={item}><input type="radio" name="capsule-filter" checked={filter === item} onChange={() => setFilter(item)} /> {item}</label>)}</fieldset><p className="capsule-live" aria-live="polite">Найдено образов: {visible.length}</p>{visible.length === 0 ? <CapsuleEmpty kind="filter" onAction={() => setFilter("Все")} /> : <div className="outfit-grid">{visible.map((outfit) => <article className="outfit-card" key={outfit.id}><div className="outfit-flatlay">{outfit.items.slice(0, 5).map((item) => item.image ? <img key={item.id} src={item.image} alt={item.name || "Вещь в образе"} /> : <span key={item.id} aria-label={item.name || item.category}>{item.category?.slice(0, 1) || "•"}</span>)}</div><SourceBadge mode={mode} /><h3>{outfit.title || outfit.context}</h3><p className="outfit-rating">{outfit.rating || "Подходит условиям"}</p><p className="outfit-reason">{outfit.reason || "Подтверждённых данных для подробного объяснения пока недостаточно."}</p><div className="capsule-actions"><button className="capsule-button capsule-button--primary" type="button" onClick={() => onOpen?.(outfit)}>Открыть образ</button>{mode === CAPSULE_MODE.PERSONAL && <button className="capsule-button capsule-button--quiet" type="button" onClick={() => onReplace?.(outfit)}>Заменить вещь</button>}</div></article>)}</div>}</section>;
}

export function CapsuleLoading({ label = "Загружаем капсулы…" }) { return <section className="capsule-state" aria-busy="true" aria-live="polite"><p>{label}</p><div className="capsule-skeletons" aria-hidden="true">{[1,2,3].map((item) => <span key={item} />)}</div></section>; }

const EMPTY = { capsules: ["Здесь появятся небольшие наборы под вашу реальную жизнь.", "Собрать первую капсулу"], coverage: ["Для устойчивой капсулы пока не хватает вещей разных ролей.", "Посмотреть, чего не хватает"], candidates: ["Из этого состава пока не получается честно собрать образ под выбранные условия.", "Изменить состав"], filter: ["По этим условиям готовых образов нет.", "Сбросить фильтры"], facts: ["Образ доступен, но подтверждённых данных для объяснения пока недостаточно.", null] };
export function CapsuleEmpty({ kind = "capsules", onAction }) { const [text, action] = EMPTY[kind] || EMPTY.capsules; return <section className="capsule-state"><h2>Пока пусто</h2><p>{text}</p>{action && <button className="capsule-button capsule-button--primary" type="button" onClick={onAction}>{action}</button>}</section>; }
export function CapsuleError({ kind = "list", onRetry, onChange }) { const generation = kind === "generation"; return <section className="capsule-state capsule-state--error" role="alert"><h2>Не получилось</h2><p>{generation ? "Не получилось собрать капсулу с первого раза. Состав и условия на месте." : "Не удалось загрузить капсулы. Ваши данные не изменены."}</p><div className="capsule-actions"><button className="capsule-button capsule-button--primary" type="button" onClick={onRetry}>{generation ? "Повторить" : "Попробовать снова"}</button>{generation && <button className="capsule-button capsule-button--quiet" type="button" onClick={onChange}>Изменить условия</button>}</div></section>; }
