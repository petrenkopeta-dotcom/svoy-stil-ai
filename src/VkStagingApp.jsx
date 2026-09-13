import React, { useEffect, useRef, useState } from "react";
import { createVkStagingClient, vkJourneyError } from "./vkStagingClient.js";

export function VkStagingApp() {
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
  const [category, setCategory] = useState("shirt"),
    [color, setColor] = useState("blue");
  const [message, setMessage] = useState("");
  const generation = useRef(0),
    urls = useRef(new Set()),
    operation = useRef();
  const clearPhotos = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setPhotos([]);
  };
  const addPhoto = (photo) => {
    const url = URL.createObjectURL(photo.blob);
    urls.current.add(url);
    setPhotos((current) => [
      ...current.filter((x) => x.id !== photo.id),
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
      if (current === generation.current) {
        const result = vkJourneyError(error);
        setState(result.state);
        setMessage(
          (!signedIn ? "Гардероб не загружен. " : "") + result.message,
        );
      }
    } finally {
      if (operation.current === current) operation.current = undefined;
    }
  };
  const refresh = async (active) => {
    const wardrobe = await client.wardrobe();
    const capability = await client.capabilities();
    const saved =
      capability.photos === true ? await client.photos() : { items: [] };
    if (!active()) return;
    setItems(wardrobe.items);
    setEnabled(capability.photos === true);
    clearPhotos();
    setCandidates([]);
    for (const item of saved.items) {
      const photo = await client.readPhoto(item);
      if (!active()) return;
      addPhoto(photo);
    }
    if (active()) {
      setState(wardrobe.items.length || saved.items.length ? "ready" : "empty");
      setMessage(
        wardrobe.items.length || saved.items.length
          ? "Гардероб загружен."
          : "Гардероб пока пуст.",
      );
    }
  };
  const login = async (active) => {
    await client.login();
    if (!active()) return;
    setSignedIn(true);
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
  const busy = [
    "loading",
    "saving",
    "analyzing",
    "confirming",
    "logout",
  ].includes(state);
  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}>
      <h1>Мой гардероб · закрытый тест VK</h1>
      {!enabled && (
        <p>
          Фотографии пока недоступны: проверка безопасного выделения одежды ещё
          не завершена.
        </p>
      )}
      <p role="status" data-state={state}>
        {{
          loading: "Проверяем вход и загружаем гардероб…",
          analyzing:
            "Анализируем одежду… Цель — 10 секунд, предел обработки — 20 секунд.",
          confirming: "Повторно проверяем и сохраняем…",
          saving: "Сохраняем…",
          logout: "Завершаем сессию…",
        }[state] || message}
      </p>
      {!signedIn && !busy && state !== "signedOut" && (
        <button onClick={() => run("loading", login)}>Повторить вход</button>
      )}
      {signedIn && (
        <>
          <ul aria-label="Личный гардероб">
            {items.map((item) => (
              <li key={item.id}>
                {item.category} · {item.color}
              </li>
            ))}
          </ul>
          {photos.length >= 100 && (
            <p>
              Этот экран показывает не более 100 последних фото-вещей. Более
              старые могут оставаться на сервере; просмотр следующих страниц
              пока недоступен.
            </p>
          )}
          <div aria-label="Сохранённые вещи">
            {photos.map((photo) => (
              <img
                key={photo.id}
                src={photo.url}
                alt="Сохранённая проверенная вещь"
                width="160"
              />
            ))}
          </div>
          {enabled && (
            <label>
              Загрузить фото для анализа{" "}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setCandidates([]);
                  run("analyzing", async (active) => {
                    const result = await client.analyze(file);
                    if (!active()) return;
                    setCandidates(result.candidates);
                    setState(
                      result.candidates.length ? "confirmation" : "empty",
                    );
                    setMessage(
                      result.candidates.length
                        ? "Проверьте выделенную одежду и подтвердите сохранение."
                        : "Безопасно выделенная одежда не найдена. Попробуйте другое фото.",
                    );
                  });
                }}
              />
            </label>
          )}
          {candidates.map((candidate) => (
            <div key={candidate.id}>
              <img src={candidate.preview} alt={candidate.label} width="160" />
              <button
                disabled={busy}
                onClick={() =>
                  run("confirming", async (active) => {
                    const photo = await client.confirm(candidate.id);
                    if (!active()) return;
                    addPhoto(photo);
                    setCandidates((current) =>
                      current.filter((x) => x.id !== candidate.id),
                    );
                    setState("ready");
                    setMessage(
                      "Вещь сохранена и повторно прочитана с сервера.",
                    );
                  })
                }
              >
                Подтвердить сохранение
              </button>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run("saving", async (active) => {
                const result = await client.save([
                  ...items,
                  { id: crypto.randomUUID(), category, color },
                ]);
                if (active()) {
                  setItems(result.items);
                  setState("ready");
                  setMessage("Вещь сохранена и повторно прочитана с сервера.");
                }
              });
            }}
          >
            <label>
              Вещь{" "}
              <select
                disabled={busy}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="shirt">Рубашка</option>
                <option value="coat">Пальто</option>
                <option value="pants">Брюки</option>
              </select>
            </label>
            <label>
              Цвет{" "}
              <select
                disabled={busy}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              >
                <option value="blue">Синий</option>
                <option value="black">Чёрный</option>
                <option value="white">Белый</option>
              </select>
            </label>
            <button disabled={busy} type="submit">
              Сохранить вещь без фото
            </button>
          </form>
          <button disabled={busy} onClick={() => run("loading", refresh)}>
            Обновить гардероб
          </button>
          <button
            disabled={state === "logout"}
            onClick={() => {
              generation.current++;
              clearPhotos();
              setItems([]);
              setCandidates([]);
              setEnabled(false);
              run("logout", async (active) => {
                await client.logout();
                if (active()) {
                  setSignedIn(false);
                  setState("signedOut");
                  setMessage("Вы вышли. Личный гардероб скрыт.");
                  client.close();
                }
              });
            }}
          >
            Выйти
          </button>
        </>
      )}
    </main>
  );
}
