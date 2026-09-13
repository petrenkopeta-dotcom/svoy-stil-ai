import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const samples = [
  {
    id: "top",
    name: "Молочный кроп-топ",
    category: "Верх",
    color: "Молочный",
    kind: "top",
    tone: "#e3dccb",
  },
  {
    id: "jeans",
    name: "Прямые джинсы",
    category: "Низ",
    color: "Синий",
    kind: "pants",
    tone: "#707d86",
  },
  {
    id: "shoes",
    name: "Светлые кеды",
    category: "Обувь",
    color: "Молочный",
    kind: "shoes",
    tone: "#ddd8cc",
  },
  {
    id: "coat",
    name: "Оливковый бомбер",
    category: "Верхний слой",
    color: "Оливковый",
    kind: "coat",
    tone: "#7a826c",
  },
];
const questions = [
  {
    title: "Куда собираемся?",
    choices: [
      "На каждый день",
      "Деловой / офисный",
      "Встреча / выходной",
      "Формальный / вечерний",
    ],
  },
  {
    title: "Как вещи должны сидеть?",
    choices: ["Свободная", "По фигуре, но не тесно", "Более прилегающая"],
  },
  {
    title: "Какое сочетание вам ближе?",
    choices: [
      "Тёмно-синий + молочный",
      "Оливковый + песочный",
      "Бордовый + серый",
      "Чёрный + белый",
      "Не знаю / нет предпочтения",
    ],
  },
];
const pairs = [
  ["#303e51", "#e8e0cf"],
  ["#737c5d", "#c7b894"],
  ["#784d54", "#979792"],
  ["#272926", "#eeece5"],
];
const categories = { shirt: "Рубашка", pants: "Брюки", coat: "Пальто" };
const colors = { blue: "Синий", black: "Чёрный", white: "Белый" };
const tones = { blue: "#707d86", black: "#444a43", white: "#e3dccb" };

function Garment({ item, large = false }) {
  const shapes = {
    top: "M57 34 40 46 21 75 43 88 53 73 53 137 127 137 127 73 137 88 159 75 140 46 123 34 109 43 71 43Z",
    pants: "M54 29 126 29 133 147 99 147 90 74 81 147 47 147Z",
    coat: "M61 27 38 43 20 124 44 131 56 78 55 150 125 150 124 78 136 131 160 124 142 43 119 27 103 37 77 37Z",
    shoes: "M27 103 47 65 76 74 91 105 144 117 155 132 154 143 27 143 20 130Z",
  };
  return (
    <div
      className={`garment-art ${large ? "garment-large" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 180 180" focusable="false">
        <path
          d={shapes[item.kind] || shapes.top}
          fill={item.tone}
          stroke="#596153"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {item.kind === "pants" ? (
          <path d="M90 30v44M56 42h68" />
        ) : item.kind === "shoes" ? (
          <path d="M25 131h128M61 87l24-5M67 96l23-5M73 105l23-5" />
        ) : (
          <path
            d={
              item.kind === "coat"
                ? "M90 39v109M60 126h18M102 126h18"
                : "M71 44q19 24 38 0M56 126h68"
            }
          />
        )}
      </svg>
    </div>
  );
}
function Primary({ children, ...props }) {
  return (
    <button className="primary" {...props}>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
function Demo() {
  const [screen, setScreen] = useState("entry");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef(null);
  const nextId = useRef(1);
  const completed = answers.every(Boolean);
  useEffect(() => {
    heading.current?.focus();
  }, [screen, step]);
  const go = (next) => {
    setNotice("");
    setScreen(next);
  };
  const reset = () => {
    setAnswers(["", "", ""]);
    setStep(0);
    setRecords([]);
    setFavorites([]);
    setSelected(null);
    setCategory("");
    setColor("");
    nextId.current = 1;
    go("entry");
  };
  const add = () => {
    setCategory("");
    setColor("");
    go("add");
  };
  const choose = (item) => {
    setSelected(item);
    go("item");
  };
  const title = (first, second, eyebrow) => (
    <div className="title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 ref={heading} tabIndex={-1}>
        {first}
        {second && <em>{second}</em>}
      </h1>
    </div>
  );
  const cards = (items) => (
    <div className="item-grid">
      {items.map((item) => (
        <button
          className="item-card"
          key={item.id}
          onClick={() => choose(item)}
          aria-label={`Посмотреть: ${item.name}`}
        >
          <Garment item={item} />
          <span className="item-name">{item.name}</span>
          <span className="muted">
            {item.category} · {item.color}
          </span>
          <span className="card-link">
            Посмотреть вещь <span aria-hidden="true">↗</span>
          </span>
        </button>
      ))}
    </div>
  );
  const outfit = selected
    ? [
        selected,
        ...samples.filter((item) => item.kind !== selected.kind),
      ].slice(0, 4)
    : [];
  const favorite =
    selected && favorites.some((item) => item.id === selected.id);
  return (
    <>
      <a className="skip" href="#content">
        К содержанию
      </a>
      <div className="demo-label">Демо · без личных вещей и фотографий</div>
      <header>
        <div className="brand">Надеть есть что</div>
        <p className="brand-note">меньше поисков — больше своего</p>
      </header>
      <main id="content">
        {screen === "entry" && (
          <>
            {title("Начнём", "с вашего стиля", "Знакомство с приложением")}
            <div className="panel centered entry-panel">
              <p className="lead">
                Вещи уже есть.
                <br />
                Осталось увидеть сочетания.
              </p>
              <p className="muted">
                Три вопроса, небольшой демо-гардероб и пример образа.
                Посмотрите, как может выглядеть ваш ежедневный выбор.
              </p>
              <div className="entry-art">
                <Garment item={samples[0]} />
                <Garment item={samples[1]} />
              </div>
            </div>
            <div className="action">
              <Primary onClick={() => go("questions")}>
                Перейти к вопросам
              </Primary>
              <p className="hint">
                Это открытое демо: вход через VK не выполняется. Ответы и
                отметки исчезнут после обновления страницы.
              </p>
            </div>
          </>
        )}
        {screen === "questions" && (
          <>
            {title(questions[step].title, null, `Вопрос ${step + 1} из 3`)}
            <fieldset className="choices">
              <legend className="sr-only">{questions[step].title}</legend>
              {questions[step].choices.map((answer, index) => (
                <label className="choice" key={answer}>
                  <input
                    type="radio"
                    name={`question-${step}`}
                    value={answer}
                    checked={answers[step] === answer}
                    onChange={() =>
                      setAnswers((old) =>
                        old.map((value, i) => (i === step ? answer : value)),
                      )
                    }
                  />
                  {step === 2 && (
                    <span className="swatches" aria-hidden="true">
                      {pairs[index] ? (
                        pairs[index].map((tone) => (
                          <span key={tone} style={{ background: tone }} />
                        ))
                      ) : (
                        <span className="no-pair">—</span>
                      )}
                    </span>
                  )}
                  <span>{answer}</span>
                </label>
              ))}
            </fieldset>
            {step === 2 && (
              <p className="hint">
                Это предпочтение сочетаний, не определение цветотипа. В демо
                ответы остаются только в памяти вкладки — запоминание на
                устройстве отключено.
              </p>
            )}
            <div className="action">
              <Primary
                disabled={!answers[step]}
                onClick={() => (step < 2 ? setStep(step + 1) : go("wardrobe"))}
              >
                {step === 2 ? "Перейти к гардеробу" : "Дальше"}
              </Primary>
              <button
                className="text-button"
                onClick={() => (step ? setStep(step - 1) : go("entry"))}
              >
                Назад
              </button>
            </div>
          </>
        )}
        {screen === "home" && (
          <>
            {title("Начните", "с одной вещи", "Главная · демо")}
            <div className="steps">
              {[
                "Выберите вещь",
                "Посмотрите сочетание",
                "Отметьте понравившееся",
              ].map((text, index) => (
                <div className="step" key={text}>
                  <span>{index + 1}</span>
                  <div>
                    <h2>{text}</h2>
                    <p className="muted">
                      {
                        [
                          "Готовый пример или пробную запись без фото.",
                          "В демо это иллюстрация, а не персональный подбор.",
                          "Избранное останется только до обновления страницы.",
                        ][index]
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="action">
              <Primary onClick={() => go("wardrobe")}>
                Открыть демо-гардероб
              </Primary>
              <button
                className="text-button"
                onClick={() => {
                  setStep(0);
                  go("questions");
                }}
              >
                Изменить ответы
              </button>
            </div>
          </>
        )}
        {screen === "wardrobe" && (
          <>
            {title("Место для", "ваших вещей", "Гардероб · демо")}
            <div className="panel centered">
              <h2>Собственных вещей — 0</h2>
              <p className="muted">
                Личные вещи в этой версии не принимаются. Можно попробовать
                форму без фото — на условных категории и цвете.
              </p>
              <Primary onClick={add}>
                {records.length
                  ? "Добавить пробную запись"
                  : "Попробовать добавить вещь"}
              </Primary>
            </div>
            {records.length > 0 && (
              <section className="collection" aria-label="Пробные записи">
                <div className="section-heading">
                  <h2>
                    Пробные записи{" "}
                    <span className="count">{records.length}</span>
                  </h2>
                </div>
                <p className="hint">
                  Созданы здесь для демонстрации формы. Не личный гардероб, не
                  сохранены на сервере.
                </p>
                {cards(records)}
              </section>
            )}
            <section className="collection" aria-label="Готовые примеры">
              <div className="section-heading">
                <h2>Готовые примеры</h2>
                <span className="count">04</span>
              </div>
              <p className="hint">
                Отдельный демонстрационный набор. Выберите вещь, чтобы
                посмотреть пример сочетания.
              </p>
              {cards(samples)}
            </section>
          </>
        )}
        {screen === "add" && (
          <>
            {title(
              "Одна вещь —",
              "хорошее начало",
              "Пробная запись · без фото",
            )}
            <p className="intro">
              Выберите условные категорию и цвет. Это демонстрация формы: запись
              появится только в этой вкладке.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!category || !color) return;
                const entry = {
                  id: `trial-${nextId.current++}`,
                  name: `${categories[category]} · ${colors[color].toLowerCase()}`,
                  category: categories[category],
                  color: colors[color],
                  kind: category === "shirt" ? "top" : category,
                  tone: tones[color],
                  trial: true,
                };
                setRecords((old) => [...old, entry]);
                setSelected(entry);
                setScreen("item");
                setNotice(
                  "Пробная запись добавлена только в память вкладки. На сервер ничего не сохранено.",
                );
              }}
            >
              <div className="field">
                <label htmlFor="demo-category">Категория</label>
                <select
                  id="demo-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                >
                  <option value="">Выберите категорию</option>
                  {Object.entries(categories).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="demo-color">Цвет</label>
                <select
                  id="demo-color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  required
                >
                  <option value="">Выберите цвет</option>
                  {Object.entries(colors).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Primary type="submit" disabled={!category || !color}>
                Добавить пробную запись
              </Primary>
            </form>
            <div className="photo-closed">
              <h2>Фото сейчас недоступны</h2>
              <p className="muted">
                Демо не принимает снимки и не запускает обработку.
              </p>
              <button className="text-button" onClick={() => go("photo")}>
                Почему без фото
              </button>
            </div>
            <button className="text-button" onClick={() => go("wardrobe")}>
              Назад в гардероб
            </button>
          </>
        )}
        {screen === "photo" && (
          <>
            {title("Фото сейчас", "недоступны", "Добавление без фото")}
            <div className="panel">
              <h2>Начать можно с описания</h2>
              <p className="muted">
                В этой версии нет загрузки и проверки снимков. Используйте
                пробную форму с категорией и цветом.
              </p>
              <details>
                <summary>Что нужно проверить до включения фото</summary>
                <p>
                  Будущий путь должен сохранять только одежду без человека и
                  фона, после независимой проверки и вашего подтверждения. В
                  демо эти проверки не выполняются.
                </p>
              </details>
            </div>
            <div className="action">
              <Primary onClick={() => go("add")}>Продолжить без фото</Primary>
            </div>
          </>
        )}
        {screen === "item" && selected && (
          <>
            {title(
              "Отправная точка",
              "вашего образа",
              selected.trial ? "Пробная запись" : "Вещь из готовых примеров",
            )}
            <div className="panel centered">
              <Garment item={selected} large />
              <h2>{selected.name}</h2>
              <p className="muted">
                {selected.category} · {selected.color}
              </p>
              <p className="hint">
                Условная иллюстрация, не фото вещи. Посадка и сезонность не
                указаны.
              </p>
            </div>
            <p role="status" className="notice">
              {notice}
            </p>
            <div className="action">
              <Primary onClick={() => go("look")}>
                Использовать эту вещь
              </Primary>
              <p className="hint">
                Дальше — пример сочетания из демо-набора, не персональная
                рекомендация.
              </p>
              <button className="text-button" onClick={() => go("wardrobe")}>
                Назад в гардероб
              </button>
            </div>
          </>
        )}
        {screen === "look" && selected && (
          <>
            {title("Надеть", "есть что", "Пример сочетания")}
            <p className="intro">
              Начали с вещи «{selected.name}». Остальные предметы — готовые
              примеры для знакомства со сценарием.
            </p>
            <div className="look-grid">
              {outfit.map((item) => (
                <div className="look-item" key={item.id}>
                  <Garment item={item} />
                  <h2>{item.name}</h2>
                  <p className="muted">
                    {item.id === selected.id
                      ? "Выбранная демо-вещь"
                      : "Готовый пример"}
                  </p>
                </div>
              ))}
            </div>
            <div className="panel">
              <h2>Спокойная основа</h2>
              <p className="muted">
                Простые линии и сдержанные оттенки показывают идею комплекта.
                Это фиксированная демонстрация, не распознавание и не подбор под
                ваши ответы.
              </p>
            </div>
            <div className="action">
              <button
                className="primary"
                aria-pressed={Boolean(favorite)}
                onClick={() => {
                  setFavorites((old) =>
                    favorite
                      ? old.filter((item) => item.id !== selected.id)
                      : [...old, selected],
                  );
                  setNotice(
                    favorite
                      ? "Пример удалён из демо-избранного."
                      : "Пример отмечен только в памяти вкладки. После обновления отметка исчезнет.",
                  );
                }}
              >
                {favorite ? "Убрать из демо-избранного" : "В демо-избранное"}
              </button>
              <p role="status" className="notice">
                {notice}
              </p>
              <button className="text-button" onClick={() => go("wardrobe")}>
                Выбрать другую вещь
              </button>
            </div>
          </>
        )}
        {screen === "favorites" && (
          <>
            {title("То, что", "вам откликнулось", "Избранное · демо")}
            {favorites.length ? (
              <>
                <p className="intro">
                  Ваши отметки в этой вкладке. Обновление страницы очистит
                  список.
                </p>
                <div className="item-grid">
                  {favorites.map((item) => (
                    <button
                      className="item-card"
                      key={item.id}
                      onClick={() => {
                        setSelected(item);
                        go("look");
                      }}
                      aria-label={`Открыть пример: ${item.name}`}
                    >
                      <Garment item={item} />
                      <span className="item-name">
                        Пример с вещью «{item.name}»
                      </span>
                      <span className="card-link">Посмотреть сочетание →</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="panel centered">
                <h2>Отметок пока нет</h2>
                <p className="muted">
                  Откройте готовый пример и отметьте сочетание, которое
                  понравится.
                </p>
                <Primary onClick={() => go("wardrobe")}>
                  Посмотреть примеры
                </Primary>
              </div>
            )}
          </>
        )}
      </main>
      {completed && screen !== "questions" && (
        <nav aria-label="Основная навигация">
          {[
            ["home", "Главная"],
            ["wardrobe", "Гардероб"],
            ["favorites", "Избранное"],
          ].map(([route, label]) => (
            <button
              key={route}
              aria-current={
                screen === route ||
                (route === "wardrobe" &&
                  ["item", "add", "photo"].includes(screen))
                  ? "page"
                  : undefined
              }
              onClick={() => go(route)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <footer>
        <p className="footer-brand">Настя | Надеть есть что</p>
        <p>
          Открытое демо. Без входа, личных фото, облачного сохранения и
          аналитики. Все выборы — только до обновления страницы.
        </p>
        <button className="text-button" onClick={reset}>
          Начать заново
        </button>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<Demo />);
