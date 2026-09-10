import React, { useEffect, useState } from "react";
import { createVkStagingClient } from "./vkStagingClient.js";

export function VkStagingApp() {
  const [client] = useState(() => {
    const launch = window.location.search.slice(1);
    // Prevent accidental referrer/history disclosure; no localStorage/sessionStorage.
    window.history.replaceState(null, "", window.location.pathname);
    return createVkStagingClient({ launch });
  });
  const [items, setItems] = useState([]);
  const [state, setState] = useState("loading");
  const [category, setCategory] = useState("shirt");
  const [color, setColor] = useState("blue");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await client.login();
        const result = await client.wardrobe();
        if (active) { setItems(result.items); setState("ready"); }
      } catch { if (active) { setState("blocked"); setMessage("Закрытый тест пока недоступен. Гардероб не загружен."); } }
    })();
    return () => { active = false; client.close(); };
  }, [client]);
  const save = async (event) => {
    event.preventDefault(); setState("saving"); setMessage("");
    try {
      const result = await client.save([...items, { id: crypto.randomUUID(), category, color }]);
      setItems(result.items); setMessage("Вещь сохранена и повторно прочитана с сервера.");
    } catch { setMessage("Сохранение не подтверждено. Повторите после восстановления связи."); }
    finally { setState("ready"); }
  };
  return <main style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}>
    <h1>Мой гардероб · закрытый тест VK</h1>
    <p>Фотографии пока недоступны: проверка безопасного выделения одежды ещё не завершена.</p>
    <p role="status">{state === "loading" ? "Проверяем вход…" : message}</p>
    {(state === "ready" || state === "saving") && <>
      <ul aria-label="Личный гардероб">{items.map((item) => <li key={item.id}>{item.category} · {item.color}</li>)}</ul>
      <form onSubmit={save}>
        <label>Вещь <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="shirt">Рубашка</option><option value="coat">Пальто</option><option value="pants">Брюки</option></select></label>
        <label>Цвет <select value={color} onChange={(e) => setColor(e.target.value)}><option value="blue">Синий</option><option value="black">Чёрный</option><option value="white">Белый</option></select></label>
        <button disabled={state === "saving"} type="submit">Сохранить вещь без фото</button>
      </form>
      <button onClick={async () => { try { await client.logout(); setItems([]); setState("blocked"); setMessage("Вы вышли. Личный гардероб скрыт."); } catch { setMessage("Выход не подтверждён сервером."); } }}>Выйти</button>
    </>}
  </main>;
}
