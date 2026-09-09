import React, { useEffect, useRef, useState } from "react";
import { CloudSun, MessageCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import "./LocalWarmProfilePanel.css";
import "./ProfileAvatarPicker.css";
import { localWarmProfileView } from "./localWarmProfile.js";
import { createLocalProfileSyncController, PROFILE_SYNC_STATES } from "./localProfileSync.js";
import { PersistenceStatus } from "./PersistenceStatus.jsx";

export { localWarmProfileView } from "./localWarmProfile.js";
export function LocalWarmProfilePanel({ prefs, learningProfile, avatarIndex = 1, onAvatarChange, onPreferenceChange, preferencePersistence, onPreferenceRetry, onOpenWeather, onFeedback, onUndoLearning, counts = {}, privacyController, onReset, onDelete, onClose, syncAdapter = null, localPilotPhoto = false, onAddGarment }) {
  const panelRef = useRef(null), closeRef = useRef(null), previousFocusRef = useRef(null);
  const view = localWarmProfileView(prefs, learningProfile);
  const [syncState, setSyncState] = useState(PROFILE_SYNC_STATES.LOCAL_SAVED);
  const [feedbackText, setFeedbackText] = useState("Не мой стиль");
  const [localStatus, setLocalStatus] = useState("");
  const syncControllerRef = useRef(null);
  if (!syncControllerRef.current) syncControllerRef.current = createLocalProfileSyncController({ adapter: syncAdapter, profileRevision: view.revision, onStateChange: setSyncState });
  useEffect(() => { if (syncAdapter) syncControllerRef.current.retry(); }, []);
  const close = () => { onClose(); queueMicrotask(() => previousFocusRef.current?.focus?.()); };
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll("button,[href],input,select,textarea,summary,[tabindex]:not([tabindex='-1'])") || [];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, []);
  const choices = (values) => values.map((value) => <option key={value}>{value}</option>);
  return <div className="warm-profile-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <aside ref={panelRef} className="warm-profile" role="dialog" aria-modal="true" aria-labelledby="warm-profile-title">
      <button ref={closeRef} className="warm-profile-close" type="button" aria-label="Закрыть профиль" onClick={close}><X size={20} /></button>
      <span className="warm-profile-kicker">ПРОФИЛЬ БЕЗ АККАУНТА</span><h2 id="warm-profile-title">Твой профиль</h2>
      <div className="warm-profile-offline" role="status"><ShieldCheck size={20}/><span><b>Данные на этом устройстве</b><small>Настройки, аватар и память стилиста остаются в этом браузере. Облачного сохранения здесь нет.</small></span></div>
      <section className="warm-profile-avatar-section"><h3>Выбери аватар</h3><p>Аватар 01–09 хранится только в этом браузере. Если запись не удастся, останется предыдущий.</p><div className="warm-profile-avatar-grid" role="radiogroup" aria-label="Аватар профиля">{Array.from({ length: 9 }, (_, offset) => { const index = offset + 1, column = offset % 3, row = Math.floor(offset / 3); return <button key={index} type="button" role="radio" aria-checked={avatarIndex === index} aria-label={`Аватар ${index}`} className={avatarIndex === index ? "selected" : ""} onClick={() => onAvatarChange?.(index)}><span aria-hidden="true" style={{ backgroundPosition: `${column * 50}% ${row * 50}%` }} /></button>; })}</div></section>
      <div className={`warm-profile-sync ${syncState}`} role="status" aria-live="polite">{syncState === PROFILE_SYNC_STATES.LOCAL_SAVED && <p><b>Сохранено на устройстве.</b> Аккаунт не нужен.</p>}{syncState === PROFILE_SYNC_STATES.SYNC_PENDING && <p><b>Синхронизация…</b> Локальный профиль уже сохранён.</p>}{syncState === PROFILE_SYNC_STATES.SYNC_FAILED && <><p><b>Не удалось сохранить профиль.</b> Предыдущая локальная версия сохранена.</p><button type="button" onClick={() => syncControllerRef.current.retry()}>Повторить</button></>}</div>
      {onAddGarment && <section><h3>Локальный гардероб</h3><p>{localPilotPhoto ? "Фото и описание сохраняются только на этом устройстве, без облачной синхронизации." : "Для добавления персональной вещи потребуется вход."}</p><button className="warm-profile-action" type="button" onClick={onAddGarment}>Добавить вещь с фото</button></section>}
      <section><div className="warm-profile-section-head"><h3>Предпочтения</h3><span>{view.completion}/8 заполнено</span></div><p>Эти ответы участвуют в подборе и объяснении образов.</p>{view.preferences.length ? <dl>{view.preferences.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p>Настройки пока не выбраны. Можно продолжить онбординг — профиль не блокирует работу.</p>}<div className="warm-profile-quick-edit"><label>Повод<select disabled={preferencePersistence?.state === "saving"} value={prefs.goal || ""} onChange={(e) => onPreferenceChange?.("goal", e.target.value)}><option value="">Не выбран</option>{choices(["Работа","Встреча","Прогулка","Свидание","Мероприятие"])}</select></label><label>Стиль<select disabled={preferencePersistence?.state === "saving"} value={prefs.style || ""} onChange={(e) => onPreferenceChange?.("style", e.target.value)}><option value="">Не выбран</option>{choices(["Smart casual","Casual","Feminine","Minimal","Old money","Sporty","Romantic"])}</select></label></div><PersistenceStatus result={preferencePersistence} onRetry={onPreferenceRetry} /></section>
      <section><div className="warm-profile-section-head"><h3>Погода и комфорт</h3><CloudSun size={18}/></div><p>{prefs.temp || "Город и температура не указаны"}. Геолокация не обязательна.</p><button className="warm-profile-action" type="button" onClick={onOpenWeather}>Изменить город и погоду</button></section>
      <section><h3>Что влияет на рекомендации</h3><ul><li>Повод, стиль, посадка и цветовые пары меняют ранжирование, когда у вещей есть нужные теги.</li><li>Комфорт, ограничения и ручная погода исключают неподходящие варианты.</li><li>Обратная связь влияет только после явного сохранения на этом устройстве.</li></ul></section>
      <section><h3>Что запомнил стилист</h3>{view.signals.length ? <ul>{view.signals.map((signal) => <li key={signal.key}>{signal.value}</li>)}</ul> : <p>Пока ничего. Память появится после обратной связи.</p>}<small>Локальная версия профиля: {view.revision}</small>{view.signals.length > 0 && <button className="warm-profile-action" type="button" onClick={onUndoLearning}><RotateCcw size={16}/> Отменить последнее обучение</button>}</section>
      <section><h3>Мои данные</h3><div className="warm-profile-counts"><span><b>{counts.wardrobe || 0}</b> вещей</span><span><b>{counts.outfits || 0}</b> образов</span><span><b>{counts.signals || 0}</b> сигналов</span></div>{privacyController && <><a className="warm-profile-action" href={privacyController.exportHref()} download="ai-stylist-local-profile.json">Экспортировать локальные данные</a><button className="warm-profile-action" type="button" onClick={() => { privacyController.resetProfile(); onReset?.(); setLocalStatus("Профиль и память сброшены; гардероб сохранён."); }}>Сбросить профиль и память</button><button className="warm-profile-action danger" type="button" onClick={async () => { if (!globalThis.confirm?.("Удалить все локальные данные на этом устройстве?")) return; await privacyController.deleteAll(); onDelete?.(); close(); }}>Удалить все локальные данные</button></>}</section>
      <section><h3><MessageCircle size={17}/> Обратная связь</h3><form onSubmit={(e) => { e.preventDefault(); onFeedback?.(feedbackText); setLocalStatus("Отзыв сохранён на этом устройстве."); }}><label htmlFor="profile-feedback">Что стилисту учесть?</label><select id="profile-feedback" value={feedbackText} onChange={(e)=>setFeedbackText(e.target.value)}>{choices(["Не мой стиль","Не мои цвета","Не подходит посадка","Не подходит обувь","Слишком нарядно","Слишком жарко","Слишком холодно"])}</select><button className="warm-profile-action" type="submit">Сохранить отзыв</button></form></section>
      <section><h3>Коротко о профиле</h3><details><summary>Нужен ли аккаунт?</summary><p>Нет. Этот профиль работает локально в текущем браузере.</p></details><details><summary>Погода определяется автоматически?</summary><p>Нет. Город и температуру можно указать вручную, без геолокации.</p></details><details><summary>Можно удалить данные?</summary><p>Да: экспорт, сброс и полное удаление доступны выше.</p></details></section>
      {localStatus && <p className="warm-profile-local-status" role="status" aria-live="polite">{localStatus}</p>}
    </aside>
  </div>;
}
