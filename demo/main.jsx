import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const wardrobe = [
  { name: "Белая рубашка", category: "Верх", mark: "◇" },
  { name: "Чёрные брюки", category: "Низ", mark: "⌁" },
  { name: "Чёрные лоферы", category: "Обувь", mark: "◒" },
  { name: "Бежевый тренч", category: "Верхний слой", mark: "〰" },
  { name: "Структурная сумка", category: "Аксессуар", mark: "▱" },
];
const steps = [
  { title: "Куда собираемся?", options: ["На работу", "На прогулку", "На встречу"] },
  { title: "Какая посадка ближе?", options: ["Свободная", "Сбалансированная", "По фигуре"] },
  { title: "Какое сочетание нравится?", options: ["Синий + молочный", "Бежевый + чёрный", "Монохром"] },
];
function Demo() {
  const [screen, setScreen] = useState("start"), [step, setStep] = useState(0), [answers, setAnswers] = useState([]), [saved, setSaved] = useState(false);
  const reset = () => { setScreen("start"); setStep(0); setAnswers([]); setSaved(false); };
  return <>
    <div className="demo-label">ДЕМО · только примеры · без личных данных</div>
    <header><button className="wordmark" onClick={reset}>СВОЙ СТИЛЬ<span>одежда уже есть. образ — тоже.</span></button><span className="edition">ПРЕВЬЮ / 01</span></header>
    <main>
      {screen === "start" && <section className="hero"><p className="eyebrow">ЛИЧНЫЙ СТИЛЬ, БЕЗ ЛИШНИХ УСИЛИЙ</p><h1>Образ на день —<br/><em>уже в твоём шкафу</em></h1><p className="intro">Три простых ответа — и пример сочетания под твои планы. Посмотри, как будет устроен подбор образа.</p><button className="primary" onClick={() => setScreen("questions")}>Начать демо →</button><p className="small">3 вопроса · без регистрации и фотографий</p><div className="editorial"><span className="look-number">LOOK<br/>001</span><div className="color-block cream"/><div className="color-block ink"/><div className="color-block sand"/><span className="caption">SMART CASUAL / ДЕМО-ГАРДЕРОБ</span></div></section>}
      {screen === "questions" && <section className="question"><p className="eyebrow">ШАГ {step + 1} ИЗ 3</p><h1>{steps[step].title}</h1><div className="choices" role="radiogroup" aria-label={steps[step].title}>{steps[step].options.map((value) => <button role="radio" aria-label={value} aria-checked={answers[step] === value} key={value} onClick={() => setAnswers((old) => { const next = [...old]; next[step] = value; return next; })}>{value}<span>{answers[step] === value ? "✓" : "○"}</span></button>)}</div><div className="actions"><button onClick={() => step ? setStep(step - 1) : setScreen("start")}>← Назад</button><button className="primary" disabled={!answers[step]} onClick={() => step < 2 ? setStep(step + 1) : setScreen("look")}>{step < 2 ? "Дальше →" : "Показать демо-образ →"}</button></div></section>}
      {screen === "look" && <section><p className="eyebrow">ТВОЙ ПЕРВЫЙ ПРИМЕР</p><h1>Можно просто<br/><em>надеть и пойти</em></h1><p className="intro">{answers[0]} · {answers[1]} посадка · {answers[2]}</p><p>Это фиксированный пример из демонстрационного гардероба, а не результат распознавания или персональная рекомендация.</p><div className="garments">{wardrobe.map((item) => <article key={item.name}><div className="garment-symbol">{item.mark}</div><small>{item.category}</small><h2>{item.name}</h2></article>)}</div><p className="rationale">Спокойная база, чёткие линии и один тёплый оттенок. В демо можно посмотреть сочетание и познакомиться с будущим сценарием.</p><div className="actions"><button className="primary" onClick={() => setSaved(true)}>{saved ? "В демо-избранном ✓" : "Сохранить пример ♡"}</button><button onClick={() => setScreen("wardrobe")}>Посмотреть демо-гардероб →</button></div><p role="status">{saved ? "Пример отмечен только в памяти этой вкладки. После обновления отметка исчезнет." : ""}</p></section>}
      {screen === "wardrobe" && <section><p className="eyebrow">ПОСТАВЛЯЕМЫЕ ПРИМЕРЫ</p><h1>Демо-гардероб</h1><p>Личные вещи и фотографии в этой версии не принимаются.</p><div className="garments">{wardrobe.map((item) => <article key={item.name}><div className="garment-symbol">{item.mark}</div><small>{item.category}</small><h2>{item.name}</h2></article>)}</div><button className="primary" onClick={() => setScreen("look")}>Вернуться к образу →</button></section>}
    </main>
    <footer><b>Это отдельная демонстрационная версия.</b><p>Нет загрузки фото, камеры, входа, распознавания, облачного сохранения и аналитики. Все выборы живут только в памяти вкладки.</p><button onClick={reset}>Начать заново</button></footer>
  </>;
}
createRoot(document.getElementById("root")).render(<Demo/>);
