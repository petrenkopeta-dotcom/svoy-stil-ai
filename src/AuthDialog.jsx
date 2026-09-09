import React, { useEffect, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { AUTH_STATES } from "./auth/AuthPort.js";
import "./AuthDialog.css";

const copy = {
  expired: "Код не подошёл или истёк. Проверьте цифры или запросите новый.",
  rate_limited: "Слишком много попыток. Подождите перед повтором.",
  offline: "Нет соединения. Демо остаётся доступно, но создать личный гардероб сейчас нельзя.",
  provider_unavailable: "Сервис входа не настроен. Личные функции заблокированы — успешный вход не имитируется.",
  invalid_email: "Проверьте адрес почты.", invalid_code: "Введите 6 цифр из письма.",
  unknown: "Не удалось выполнить вход. Попробуйте ещё раз.", cancelled: "Действие отменено.",
};

export function AuthDialog({ repository, state, providerAvailable, providerStatus = providerAvailable ? "available" : "unavailable", onRetryProvider, onClose, onAuthenticated }) {
  const [email, setEmail] = useState(state.email || ""); const [code, setCode] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const emailRef = useRef(null); const codeRef = useRef(null);
  const codeStage = !!state.email && !!state.expiresAt && state.error !== "invalid_email";
  useEffect(() => { if (state.status === AUTH_STATES.AUTHENTICATED) onAuthenticated?.(state.session); }, [state.status]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const busy = state.status === AUTH_STATES.CODE_SENDING || state.status === AUTH_STATES.VERIFYING;
  const close = () => { repository.cancel(); onClose(); };
  return <AccessibleDialog as="form" className="auth-dialog" labelledBy="auth-title" describedBy="auth-description" initialFocus={codeStage ? codeRef : emailRef} onClose={close} onSubmit={(event) => { event.preventDefault(); codeStage ? repository.verifyCode(code) : repository.sendCode(email); }}>
    <button className="auth-close" type="button" aria-label="Закрыть вход" onClick={close}>×</button>
    <p className="auth-kicker">ЛИЧНОЕ ПРОСТРАНСТВО СТИЛИСТА</p>
    <h2 id="auth-title">{codeStage ? "Введите код из письма" : "Создайте свой гардероб"}</h2>
    <p id="auth-description">Сохраняйте вещи и образы, обучайте стилиста своими реакциями и возвращайтесь к гардеробу с других устройств. Рекламу без согласия не отправляем.</p>
    {providerStatus === "checking" && <p className="auth-status" role="status">Проверяем доступность защищённого входа…</p>}
    {providerStatus === "unavailable" && <div className="auth-error" role="alert"><p>{copy.provider_unavailable}</p><button type="button" className="auth-link" onClick={onRetryProvider}>Проверить ещё раз</button></div>}
    {!codeStage ? <label>Почта<input ref={emailRef} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} required /></label> : <>
      <p>Код отправлен на <b>{state.email}</b></p>
      <label>6-значный код<input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} required /></label>
      <button type="button" className="auth-link" onClick={() => { repository.logout(); setCode(""); }}>Изменить почту</button>
    </>}
    {state.error && state.error !== "provider_unavailable" && <p className="auth-error" role="alert">{copy[state.error] || copy.unknown}</p>}
    <div className="auth-status" aria-live="polite">{state.status === AUTH_STATES.CODE_SENDING && "Отправляем код…"}{state.status === AUTH_STATES.VERIFYING && "Проверяем код…"}</div>
    <button className="primary auth-submit" type="submit" disabled={busy || providerStatus !== "available"}>{codeStage ? "Подтвердить" : "Получить код"}</button>
    {codeStage && <button type="button" disabled={busy || clock < (state.resendAt || 0)} onClick={() => repository.sendCode(state.email)}>{clock < (state.resendAt || 0) ? `Новый код через ${Math.ceil((state.resendAt-clock)/1000)} сек.` : "Отправить новый код"}</button>}
  </AccessibleDialog>;
}
