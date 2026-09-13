import React, { useEffect, useRef, useState } from "react";
import { createVkStagingClient, vkJourneyError } from "./vkStagingClient.js";
import {
  VK_QUESTIONS,
  VK_CATEGORIES,
  VK_COLORS,
  validVkItem,
  answerVkQuestion,
  hasVkAnswer,
} from "./vkStagingJourney.js";
import "./VkStagingApp.css";
import { VkCityPanel } from "./VkCityPanel.jsx";

function Action({ children, ...props }) {
  return (
    <button className="vk-primary" {...props}>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function VkStagingApp({ cityBridge = null } = {}) {
  const [client] = useState(() => {
    const launch = window.location.search.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    return createVkStagingClient({ launch });
  });
  const [items, setItems] = useState([]),
    [photos, setPhotos] = useState([]);
  const [candidates, setCandidates] = useState([]),
    [enabled, setEnabled] = useState(false);
  const [state, setState] = useState("loading"),
    [signedIn, setSignedIn] = useState(false);
  const [screen, setScreen] = useState("entry"),
    [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState({});
  const [category, setCategory] = useState(""),
    [color, setColor] = useState("");
  const [selectedId, setSelectedId] = useState(null),
    [needsReadback, setNeedsReadback] = useState(false);
  const [message, setMessage] = useState(""),
    [invalidSession, setInvalidSession] = useState(false);
  const generation = useRef(0),
    urls = useRef(new Set()),
    operation = useRef();
  const logoutPending = useRef(false),
    onboardingComplete = useRef(false),
    heading = useRef(null);
  const clearPhotos = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setPhotos([]);
  };
  const addPhoto = (photo) => {
    const url = URL.createObjectURL(photo.blob);
    urls.current.add(url);
    setPhotos((current) => [
      ...current.filter((item) => item.id !== photo.id),
      { id: photo.id, url },
    ]);
  };
  const run = async (busy, action) => {
    const current = generation.current;
    if (operation.current === current) return;
    operation.current = current;
    setState(busy);
    setMessage("");
    try {
      await action(() => current === generation.current);
    } catch (error) {
      if (current !== generation.current) return;
      const result = vkJourneyError(error);
      setState(result.state);
      if (error.status === 401 || error.code === "vk_launch_rejected") {
        setInvalidSession(true);
        setLoaded(false);
        clearPhotos();
        setItems([]);
        setCandidates([]);
      }
      const prefix =
        busy === "loading"
          ? "Гардероб не загружен. "
          : busy === "saving" || busy === "confirming"
            ? "Сохранение не подтверждено. "
            : busy === "logout"
              ? "Выход не подтверждён. "
              : "";
      setMessage(
        prefix +
          (error.status === 503 &&
          error.code !== "storage_unavailable" &&
          busy !== "analyzing" &&
          busy !== "confirming"
            ? "Сервис временно недоступен. Проверьте соединение или вернитесь позже."
            : result.message),
      );
      if (busy === "saving" || busy === "confirming") setNeedsReadback(true);
    } finally {
      if (operation.current === current) operation.current = undefined;
    }
  };
  const refresh = async (active) => {
    setLoaded(false);
    setSelectedId(null);
    clearPhotos();
    const wardrobe = await client.wardrobe();
    const capability = await client.capabilities();
    const saved =
      capability.photos === true ? await client.photos() : { items: [] };
    if (!active()) return;
    const readPhotos = [];
    for (const item of saved.items) {
      const photo = await client.readPhoto(item);
      if (!active()) return;
      readPhotos.push(photo);
    }
    setItems(wardrobe.items);
    setEnabled(capability.photos === true);
    setCandidates([]);
    for (const photo of readPhotos) addPhoto(photo);
    setLoaded(true);
    setNeedsReadback(false);
    setInvalidSession(false);
    const filled = wardrobe.items.length > 0 || saved.items.length > 0;
    if (filled) onboardingComplete.current = true;
    setScreen(onboardingComplete.current ? "wardrobe" : "onboarding");
    setState(filled ? "ready" : "empty");
    setMessage(filled ? "Гардероб загружен." : "");
  };
  const login = async (active) => {
    await client.login();
    if (!active()) return;
    setSignedIn(true);
    setInvalidSession(false);
    await refresh(active);
  };
  useEffect(() => {
    run("loading", login);
    return () => {
      generation.current++;
      client.close();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, [client]);
  useEffect(() => {
    heading.current?.focus();
  }, [screen, step, loaded]);
  const busy = [
    "loading",
    "saving",
    "analyzing",
    "confirming",
    "logout",
  ].includes(state);
  const selected = loaded ? items.find((item) => item.id === selectedId) : null;
  const openAdd = () => {
    if (busy || !loaded) return;
    setCategory("");
    setColor("");
    setCandidates([]);
    setMessage("");
    setState("ready");
    setScreen("add");
  };
  const logout = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    try {
      generation.current++;
      clearPhotos();
      setItems([]);
      setCandidates([]);
      setEnabled(false);
      setLoaded(false);
      setSelectedId(null);
      setAnswers({});
      setStep(0);
      onboardingComplete.current = false;
      await run("logout", async (active) => {
        await client.logout();
        if (!active()) return;
        setSignedIn(false);
        setScreen("entry");
        setState("signedOut");
        setMessage("Вы вышли. Личный гардероб скрыт.");
        client.close();
      });
    } finally {
      logoutPending.current = false;
    }
  };
  const cancelPhoto = () => {
    if (state === "confirming") setNeedsReadback(true);
    generation.current++;
    client.cancel();
    setCandidates([]);
    setScreen("add");
    setState("cancelled");
    setMessage(
      "Ожидание прекращено. Сохранение не подтверждено. Это не подтверждает остановку обработки на сервере.",
    );
  };
  const title = !loaded
    ? [
        state === "signedOut" ? "До новой" : "Начнём",
        state === "signedOut" ? "встречи" : "с вашего стиля",
      ]
    : screen === "onboarding"
      ? ["Немного", "о вашем стиле"]
      : screen === "add"
        ? ["Добавим", "вашу вещь"]
        : screen === "photo"
          ? [
              state === "confirmation" ? "Просмотрите" : "Проверяем",
              state === "confirmation" ? "выделенную вещь" : "фото",
            ]
          : screen === "detail" || screen === "selection"
            ? ["Одна вещь", "в основе образа"]
            : items.length || photos.length
              ? ["То, что", "уже ваше"]
              : ["Место для", "ваших вещей"];
  const statusCopy =
    {
      loading: signedIn ? "Загружаем гардероб…" : "Проверяем вход…",
      saving: "Сохраняем и проверяем запись…",
      analyzing: "Проверяем фото. Результат ещё не получен.",
      confirming: "Повторно проверяем и сохраняем…",
      logout: "Завершаем сессию…",
    }[state] || message;
  return (
    <div className="vk-staging" data-screen={screen} data-loaded={loaded}>
      <header className="vk-header">
        <span>Надеть есть что</span>
        <small>Настя | Надеть есть что</small>
      </header>
      <main className="vk-content">
        <p className="vk-eyebrow">
          {loaded && screen === "onboarding"
            ? `Вопрос ${step + 1} из 3`
            : "Ваш гардероб и стиль"}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {title[0]}
          <em>{title[1]}</em>
        </h1>
        <p
          role="status"
          className={`vk-status${statusCopy ? " vk-panel" : ""}`}
          data-state={state}
        >
          {statusCopy}
        </p>
        {!loaded && (
          <>
            {!signedIn && state === "loading" && (
              <p className="vk-muted">
                Подтверждаем вход через VK. Затем — три вопроса и первый шаг к
                своему гардеробу.
              </p>
            )}
            {!busy && !invalidSession && state !== "signedOut" && (
              <Action
                onClick={() => run("loading", signedIn ? refresh : login)}
              >
                {signedIn ? "Обновить гардероб" : "Повторить вход"}
              </Action>
            )}
          </>
        )}
        {loaded && screen === "onboarding" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasVkAnswer(answers, step)) return;
              if (step < 2) setStep(step + 1);
              else {
                onboardingComplete.current = true;
                setScreen("wardrobe");
                setMessage("");
              }
            }}
          >
            <fieldset>
              <legend>{VK_QUESTIONS[step].title}</legend>
              {VK_QUESTIONS[step].options.map((option) => (
                <label className="vk-choice" key={option.value}>
                  <input
                    type="radio"
                    name={VK_QUESTIONS[step].key}
                    value={option.value}
                    checked={answers[VK_QUESTIONS[step].key] === option.value}
                    required
                    onChange={() =>
                      setAnswers((current) =>
                        answerVkQuestion(current, step, option.value),
                      )
                    }
                  />
                  {option.colors && (
                    <span className="vk-swatch" aria-hidden="true">
                      {option.colors.map((colorValue) => (
                        <i
                          key={colorValue}
                          style={{ backgroundColor: colorValue }}
                        />
                      ))}
                    </span>
                  )}
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </fieldset>
            {step === 2 && (
              <p className="vk-muted">
                Это предпочтение сочетаний, не определение цветотипа. Ответы
                остаются только до закрытия приложения; на сервере и устройстве
                не сохраняются.
              </p>
            )}
            <Action disabled={!hasVkAnswer(answers, step)} type="submit">
              {step === 2 ? "Перейти к гардеробу" : "Дальше"}
            </Action>
            {step > 0 && (
              <button
                className="vk-link"
                type="button"
                onClick={() => setStep(step - 1)}
              >
                Назад
              </button>
            )}
          </form>
        )}
        {loaded && screen === "wardrobe" && (
          <>
            {items.length === 0 && photos.length === 0 ? (
              <>
                <section className="vk-panel vk-center">
                  <h2>В гардеробе пока нет вещей</h2>
                  <p className="vk-muted">
                    Начните с той, которую часто носите.
                  </p>
                </section>
                <Action onClick={openAdd}>Добавить первую вещь</Action>
              </>
            ) : (
              <>
                <p className="vk-muted">
                  Вещей в этом списке: {items.length + photos.length}. Выберите
                  свою вещь.
                </p>
                <ul className="vk-grid" aria-label="Личный гардероб">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        className="vk-item"
                        onClick={() => {
                          setSelectedId(item.id);
                          setScreen("detail");
                          setMessage("");
                        }}
                      >
                        <strong>
                          {VK_CATEGORIES[item.category] || item.category}
                        </strong>
                        <span>
                          {VK_CATEGORIES[item.category] || item.category} ·{" "}
                          {VK_COLORS[item.color] || item.color}
                        </span>
                        <small>Без фото</small>
                      </button>
                    </li>
                  ))}
                </ul>
                {photos.length >= 100 && (
                  <p className="vk-muted">
                    Показаны не более 100 последних фото-вещей. Более старые
                    могут оставаться на сервере; следующие страницы пока
                    недоступны.
                  </p>
                )}
                <div className="vk-grid" aria-label="Сохранённые вещи">
                  {photos.map((photo) => (
                    <div className="vk-panel" key={photo.id}>
                      <img src={photo.url} alt="Сохранённая проверенная вещь" />
                      <p>Проверенная вещь</p>
                      <small>Категория и цвет не указаны.</small>
                    </div>
                  ))}
                </div>
                <button className="vk-link" onClick={openAdd}>
                  Добавить вещь
                </button>
              </>
            )}
            {!enabled && (
              <p className="vk-muted">
                Фото сейчас недоступны. Можно начать без них.
              </p>
            )}
            <button
              className="vk-link"
              disabled={busy}
              onClick={() => run("loading", refresh)}
            >
              Обновить гардероб
            </button>
          </>
        )}
        {loaded &&
          (screen === "detail" || screen === "selection") &&
          selected && (
            <>
              <section className="vk-panel vk-center">
                <h2>{VK_CATEGORIES[selected.category] || selected.category}</h2>
                <p>{VK_COLORS[selected.color] || selected.color}</p>
                <p className="vk-muted">
                  Добавлена без фото. Посадка и сезонность не указаны.
                </p>
              </section>
              {screen === "detail" ? (
                <Action
                  onClick={() => {
                    setScreen("selection");
                    setMessage(
                      "Вещь выбрана. Подбор комплекта в этом разделе пока недоступен; готовый образ не создан.",
                    );
                  }}
                >
                  Использовать эту вещь
                </Action>
              ) : (
                <p className="vk-muted">
                  Вы можете выбрать другую вещь или дополнить гардероб. Выбор
                  остаётся только в текущем открытии приложения.
                </p>
              )}
              <button
                className="vk-link"
                onClick={() => {
                  setScreen("wardrobe");
                  setMessage("");
                }}
              >
                Назад в гардероб
              </button>
            </>
          )}
        {loaded && screen === "add" && (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || needsReadback || !validVkItem(category, color))
                  return;
                run("saving", async (active) => {
                  const result = await client.save([
                    ...items,
                    { id: crypto.randomUUID(), category, color },
                  ]);
                  if (!active()) return;
                  setItems(result.items);
                  setState("ready");
                  setScreen("wardrobe");
                  setMessage("Вещь сохранена и повторно прочитана с сервера.");
                });
              }}
            >
              <label className="vk-field">
                Категория
                <select
                  required
                  aria-label="Категория"
                  value={category}
                  disabled={busy}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Выберите категорию</option>
                  {Object.entries(VK_CATEGORIES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vk-field">
                Цвет
                <select
                  required
                  aria-label="Цвет"
                  value={color}
                  disabled={busy}
                  onChange={(event) => setColor(event.target.value)}
                >
                  <option value="">Выберите цвет</option>
                  {Object.entries(VK_COLORS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Action
                type="submit"
                disabled={
                  busy || needsReadback || !validVkItem(category, color)
                }
              >
                Сохранить без фото
              </Action>
            </form>
            {!enabled ? (
              <section className="vk-photo-option">
                <button disabled>Фото сейчас недоступны</button>
                <p className="vk-muted">
                  Проверка безопасного выделения одежды ещё не завершена. Пока
                  используйте категорию и цвет.
                </p>
              </section>
            ) : (
              <label className="vk-field">
                Выбрать фото
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || needsReadback}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setCandidates([]);
                    setScreen("photo");
                    run("analyzing", async (active) => {
                      const result = await client.analyze(file);
                      if (!active()) return;
                      setCandidates(result.candidates);
                      setState(
                        result.candidates.length ? "confirmation" : "empty",
                      );
                      setMessage(
                        result.candidates.length
                          ? "Проверьте выделенную одежду перед сохранением."
                          : "Безопасно выделенная одежда не найдена. Снимите одну вещь отдельно, без человека.",
                      );
                    });
                  }}
                />
                <span className="vk-muted">
                  Одна вещь отдельно, без человека. До сохранения результат
                  нужно просмотреть и подтвердить.
                </span>
              </label>
            )}
            {needsReadback && (
              <Action onClick={() => run("loading", refresh)}>
                Обновить гардероб
              </Action>
            )}
            <button
              className="vk-link"
              disabled={busy}
              onClick={() => {
                setScreen("wardrobe");
                setMessage("");
              }}
            >
              Назад в гардероб
            </button>
          </>
        )}
        {loaded && screen === "photo" && (
          <>
            <details className="vk-panel">
              <summary>Что проверяем</summary>
              <p>
                Можно ли выделить только одежду без человека и фона. Перед
                сохранением сервер повторно проверяет результат.
              </p>
              <p>
                10 секунд — цель, 20 секунд — предел требований к обработке, а
                не измеренная скорость.
              </p>
            </details>
            {candidates.map((candidate) => (
              <section className="vk-panel" key={candidate.id}>
                <img
                  src={candidate.preview}
                  alt="Выделенная вещь для подтверждения"
                />
                <Action
                  disabled={busy || needsReadback}
                  onClick={() =>
                    run("confirming", async (active) => {
                      const photo = await client.confirm(candidate.id);
                      if (!active()) return;
                      addPhoto(photo);
                      setCandidates((current) =>
                        current.filter((item) => item.id !== candidate.id),
                      );
                      setScreen("wardrobe");
                      setState("ready");
                      setMessage(
                        "Вещь сохранена и повторно прочитана с сервера.",
                      );
                    })
                  }
                >
                  Подтвердить сохранение
                </Action>
              </section>
            ))}
            {busy ? (
              <button className="vk-link" onClick={cancelPhoto}>
                Отменить ожидание
              </button>
            ) : (
              <button
                className="vk-link"
                onClick={() => {
                  setScreen("add");
                  setCandidates([]);
                }}
              >
                Продолжить без фото или выбрать заново
              </button>
            )}
            {needsReadback && (
              <Action disabled={busy} onClick={() => run("loading", refresh)}>
                Обновить гардероб
              </Action>
            )}
          </>
        )}
        {signedIn && !invalidSession && state !== "logout" && (
          <VkCityPanel bridge={cityBridge} />
        )}
      </main>
      {signedIn && (
        <nav className="vk-nav" aria-label="Навигация">
          <button
            disabled={busy || !loaded || screen === "onboarding"}
            aria-current={screen === "wardrobe" ? "page" : undefined}
            onClick={() => {
              setScreen("wardrobe");
              setMessage("");
            }}
          >
            Гардероб
          </button>
          <button disabled={state === "logout"} onClick={logout}>
            Выйти
          </button>
        </nav>
      )}
    </div>
  );
}
