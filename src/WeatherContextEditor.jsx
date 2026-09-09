import React, { useEffect, useId, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { createManualContext, weatherContextDraft } from "./contextAdapter.js";
import { useStylistContext } from "./ContextProvider.jsx";
import { loadCurrentWeather, searchCities } from "./weatherService.js";

export function WeatherContextHeaderButton({ onOpen, className = "weather-context-trigger" }) {
  const { labels } = useStylistContext();
  return <button type="button" className={className} aria-haspopup="dialog" onClick={onOpen}>
    <span aria-hidden="true">☁</span><span>{labels.weather}</span><span className="sr-only">. Открыть погоду и планы</span>
  </button>;
}

export function WeatherContextEditor({ open, onClose }) {
  const { context, confirmContext, resetContext, saveContext } = useStylistContext();
  const [draft, setDraft] = useState(() => weatherContextDraft(context));
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open) {
      setDraft(weatherContextDraft(context));
      setRemember(false);
      setStatus("");
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || String(draft.city || "").trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { setSuggestions(await searchCities(draft.city, { signal: controller.signal })); setActiveSuggestion(-1); }
      catch (error) { if (error.name !== "AbortError") setSuggestions([]); }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, draft.city]);

  if (!open) return null;
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const apply = (event) => {
    event.preventDefault();
    const confirmed = { ...createManualContext(draft), confirmed: true };
    confirmContext(confirmed);
    if (remember) {
      const result = saveContext(true, confirmed);
      setStatus(result.ok ? "Контекст сохранён на этом устройстве." : "Не удалось сохранить контекст на устройстве.");
      if (!result.ok) return;
    }
    onClose();
  };
  const clear = () => {
    resetContext();
    setDraft(weatherContextDraft({}));
    setStatus("Контекст очищен.");
  };
  const chooseCity = async (place) => {
    setSuggestions([]);
    setDraft((current) => ({ ...current, city: place.name }));
    setLoading(true);
    setStatus("Загружаем текущую погоду…");
    try {
      const weather = await loadCurrentWeather(place);
      setDraft((current) => ({ ...current, ...weather }));
      setStatus(`Погода для ${place.name} обновлена.`);
    } catch {
      setStatus("Не удалось загрузить погоду. Можно указать данные вручную.");
    } finally { setLoading(false); }
  };
  const cityKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestion((current) => (current + direction + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      chooseCity(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  };

  return <AccessibleDialog as="form" className="modal weather-context-editor" labelledBy={titleId} describedBy={descriptionId} initialFocus="input[name='context-city']" onClose={onClose} onSubmit={apply}>
    <div className="weather-context-editor__heading">
      <div><h2 id={titleId}>Погода для образа</h2><p id={descriptionId}>Выберите город — температура, осадки и ветер заполнятся сами.</p></div>
      <button type="button" className="x" onClick={onClose} aria-label="Закрыть редактор погоды">×</button>
    </div>
    <div className="weather-context-editor__city"><label>Город<input name="context-city" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-controls="weather-city-options" aria-activedescendant={activeSuggestion >= 0 ? `weather-city-option-${activeSuggestion}` : undefined} value={draft.city || ""} onChange={update("city")} onKeyDown={cityKeyDown} placeholder="Начните вводить город" /></label>
      {suggestions.length > 0 && <div id="weather-city-options" className="weather-city-options" role="listbox">{suggestions.map((place, index) => <button id={`weather-city-option-${index}`} key={place.id} type="button" role="option" aria-selected={activeSuggestion === index} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => chooseCity(place)}><b>{place.name}</b><small>{[place.region, place.country].filter(Boolean).join(", ")}</small></button>)}</div>}
    </div>
    <section className="weather-context-editor__current" aria-label="Текущая погода"><span><small>Температура</small><b>{draft.temperatureC === null || draft.temperatureC === "" ? "—" : `${Number(draft.temperatureC) > 0 ? "+" : ""}${draft.temperatureC}°`}</b></span><span><small>Осадки</small><b>{{ none: "Нет", rain: "Дождь", snow: "Снег", mixed: "Смешанные" }[draft.precipitation] || "—"}</b></span><span><small>Ветер</small><b>{{ calm: "Спокойный", breezy: "Ветрено", strong: "Сильный" }[draft.wind] || "—"}</b></span></section>
    <details className="weather-context-editor__details"><summary>Уточнить вручную</summary><div className="weather-context-editor__fields">
      <label>Температура, °C<input type="number" inputMode="decimal" min="-60" max="60" value={draft.temperatureC ?? ""} onChange={update("temperatureC")} placeholder="Не указана" /></label>
      <label>Осадки<select value={draft.precipitation || ""} onChange={update("precipitation")}><option value="">Неизвестно</option><option value="none">Без осадков</option><option value="rain">Дождь</option><option value="snow">Снег</option><option value="mixed">Смешанные</option></select></label>
      <label>Ветер<select value={draft.wind || ""} onChange={update("wind")}><option value="">Неизвестно</option><option value="calm">Штиль</option><option value="breezy">Ветрено</option><option value="strong">Сильный ветер</option></select></label>
      <label>По ощущениям<select value={draft.feelsLike || ""} onChange={update("feelsLike")}><option value="">Неизвестно</option><option value="colder">Холоднее температуры</option><option value="as_expected">Как по температуре</option><option value="warmer">Теплее температуры</option></select></label>
      <label>Время на ногах, минут<input type="number" inputMode="numeric" min="0" max="720" step="1" value={draft.standingMinutes ?? ""} onChange={update("standingMinutes")} placeholder="Не указано" /></label>
    </div></details>
    <label className="weather-context-editor__consent"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Запомнить на этом устройстве после подтверждения</label>
    <p className="weather-context-editor__privacy">Геолокация не запрашивается. При поиске название города передаётся Open-Meteo; остальные настройки остаются на устройстве.</p>
    <output aria-live="polite">{status}</output>
    <div className="weather-context-editor__actions"><button type="button" onClick={clear}>Очистить</button><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={loading}>Применить</button></div>
  </AccessibleDialog>;
}
