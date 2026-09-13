import React, { useEffect, useRef, useState } from "react";
import { createVkCityContext } from "./vkStagingCity.js";
import { requestVkProfileCity } from "./vkProfileCityAdapter.js";

export function VkCityPanel({ bridge = null }) {
  const [context] = useState(createVkCityContext);
  const [view, setView] = useState(context.snapshot);
  const [mode, setMode] = useState("closed");
  const [name, setName] = useState(""),
    [region, setRegion] = useState("");
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const controller = useRef(null),
    generation = useRef(0),
    input = useRef(null);
  const cancel = () => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setPending(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      context.reset();
    },
    [context],
  );
  useEffect(() => {
    if (mode !== "closed") input.current?.focus();
  }, [mode]);
  const manual = () => {
    cancel();
    context.beginProfileRequest();
    setName(view.selected?.name || "");
    setRegion(view.selected?.region || "");
    setMode("manual");
    setMessage("");
  };
  const fromProfile = async () => {
    if (controller.current) return;
    const current = ++generation.current,
      token = context.beginProfileRequest();
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setMessage("Проверяем, доступен ли город VK…");
    try {
      const result = await requestVkProfileCity({
        bridge,
        signal: abort.signal,
      });
      if (generation.current !== current) return;
      if (!context.offerProfile(token, result)) return;
      setView(context.snapshot());
      setName(result.city.title);
      setRegion("");
      setMode("profile");
      setMessage(
        "Город из VK — предложение. Укажите регион и подтвердите выбор.",
      );
    } catch (error) {
      if (generation.current !== current) return;
      setMessage(
        error.code === "city_timeout"
          ? "VK не ответил вовремя. Укажите город вручную."
          : "Город VK недоступен. Укажите город вручную.",
      );
    } finally {
      if (generation.current === current) {
        controller.current = null;
        setPending(false);
      }
    }
  };
  return (
    <section className="vk-panel vk-city" aria-label="Город и погода">
      <h2>Город и погода</h2>
      <p>
        {view.selected
          ? `${view.selected.name}, ${view.selected.region}`
          : "Город не выбран"}
      </p>
      {view.selected && (
        <p className="vk-muted">
          {view.selected.source === "manual"
            ? "Указан вручную"
            : "Город VK подтверждён вами"}
        </p>
      )}
      <p>Прогноз ещё не подключён</p>
      <p className="vk-muted">
        Город необязателен. Выбор действует до выхода или закрытия приложения и
        не сохраняется на сервере.
      </p>
      <button type="button" className="vk-link" onClick={manual}>
        Указать город вручную
      </button>
      {!view.selected && mode === "closed" && (
        <button
          type="button"
          className="vk-link"
          disabled={pending}
          onClick={fromProfile}
        >
          Предложить город из VK
        </button>
      )}
      {mode !== "closed" && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (mode === "profile") context.confirmProfile(region);
              else context.setManual(name, region);
              cancel();
              setView(context.snapshot());
              setMode("closed");
              setMessage("Город выбран только для этой сессии.");
            } catch {
              setMessage(
                "Укажите город и регион: от 1 до 100 символов, без ссылок и специальных команд.",
              );
            }
          }}
        >
          <label>
            Город
            <input
              ref={mode === "manual" ? input : undefined}
              value={name}
              readOnly={mode === "profile"}
              maxLength={100}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Регион или страна
            <input
              ref={mode === "profile" ? input : undefined}
              value={region}
              maxLength={100}
              autoComplete="off"
              onChange={(event) => setRegion(event.target.value)}
            />
          </label>
          <button className="vk-primary" type="submit">
            {mode === "profile" ? "Подтвердить город VK" : "Выбрать город"}
          </button>
          <button
            className="vk-link"
            type="button"
            onClick={() => {
              cancel();
              setMode("closed");
              setMessage("");
            }}
          >
            Отмена
          </button>
        </form>
      )}
      {view.selected && (
        <button
          className="vk-link"
          type="button"
          onClick={() => {
            cancel();
            context.reset();
            setView(context.snapshot());
            setMode("closed");
            setName("");
            setRegion("");
            setMessage("Город убран.");
          }}
        >
          Убрать город
        </button>
      )}
      <p aria-live="polite" className="vk-muted">
        {message}
      </p>
    </section>
  );
}
