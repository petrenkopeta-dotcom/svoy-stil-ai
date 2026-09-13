/** VK-only presentation mappings. Answers stay in component memory. */
export const VK_QUESTIONS = [
  {
    key: "occasion",
    title: "Куда собираемся?",
    options: [
      { value: "Прогулка", label: "На каждый день", dressCode: "Свободный" },
      { value: "Работа", label: "Деловой / офисный", dressCode: "Деловой" },
      {
        value: "Встреча",
        label: "Встреча / выходной",
        dressCode: "Smart casual",
      },
      {
        value: "Мероприятие",
        label: "Формальный / вечерний",
        dressCode: "Формальный",
      },
    ],
  },
  {
    key: "fit",
    title: "Как вещи должны сидеть?",
    options: [
      { value: "Свободная", label: "Свободная" },
      { value: "Сбалансированная", label: "По фигуре, но не тесно" },
      { value: "Собранная", label: "Более прилегающая" },
    ],
  },
  {
    key: "colorComparison",
    title: "Какое сочетание вам ближе?",
    options: [
      { value: "Тёмно-синий + молочный", colors: ["#24344d", "#f3eadb"] },
      { value: "Оливковый + песочный", colors: ["#74785a", "#d8bf94"] },
      { value: "Бордовый + серый", colors: ["#742f3d", "#aaa7a2"] },
      { value: "Чёрный + белый", colors: ["#242422", "#f7f4ed"] },
      { value: "Не знаю / нет предпочтения" },
    ],
  },
];
export const VK_CATEGORIES = {
  shirt: "Рубашка",
  pants: "Брюки",
  coat: "Пальто",
};
export const VK_COLORS = { blue: "Синий", black: "Чёрный", white: "Белый" };
export const validVkItem = (category, color) =>
  Object.hasOwn(VK_CATEGORIES, category) && Object.hasOwn(VK_COLORS, color);
export function answerVkQuestion(answers, step, value) {
  const question = VK_QUESTIONS[step];
  const option = question?.options.find((item) => item.value === value);
  if (!option) return answers;
  return {
    ...answers,
    [question.key]: value,
    ...(option.dressCode ? { dressCode: option.dressCode } : {}),
  };
}
export const hasVkAnswer = (answers, step) =>
  VK_QUESTIONS[step]?.options.some(
    (option) => option.value === answers[VK_QUESTIONS[step].key],
  ) === true;
