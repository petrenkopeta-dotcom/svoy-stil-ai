import React, { useState } from "react";
import { useStylistContext } from "./ContextProvider.jsx";

/** Optional UI for manual facts. It performs no network requests. */
export function ContextFields() {
  const { context, labels, setContext, confirmContext, saveContext } = useStylistContext();
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState(null);
  const update = (field) => (event) => setContext({ ...context, [field]: event.target.value });
  return <fieldset className="context-fields">
    <legend>Контекст образа</legend>
    <label>Повод<input value={context.occasion || ""} onChange={update("occasion")} placeholder="Например, офис или театр" /></label>
    <label>Температура, °C<input type="number" min="-60" max="60" value={context.temperatureC ?? ""} onChange={update("temperatureC")} placeholder="Не указана" /></label>
    <label>Осадки<select value={context.precipitation || ""} onChange={update("precipitation")}><option value="">Не указаны</option><option value="none">Без осадков</option><option value="rain">Дождь</option><option value="snow">Снег</option><option value="mixed">Смешанные</option></select></label>
    <label>Активность<select value={context.activity || ""} onChange={update("activity")}><option value="">Не указана</option><option value="low">Низкая</option><option value="moderate">Умеренная</option><option value="active">Активная</option></select></label>
    <label>Приоритет<select value={context.priority || ""} onChange={update("priority")}><option value="">Не указан</option><option value="balanced">Баланс</option><option value="comfort">Комфорт</option><option value="expressiveness">Выразительность</option></select></label>
    <output aria-live="polite">{labels.weather}</output>
    <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Сохранить этот контекст на устройстве</label>
    <button type="button" onClick={() => {
      const confirmed = { ...context, confirmed: true };
      confirmContext(confirmed);
      setStatus(consent ? saveContext(true, confirmed) : { ok: true, code: "session_only" });
    }}>Применить</button>
    {status?.code === "consent_required" && <p role="alert">Для сохранения нужно согласие. Без него контекст используется только сейчас.</p>}
  </fieldset>;
}
