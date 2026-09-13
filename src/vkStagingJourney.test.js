import test from "node:test";
import assert from "node:assert/strict";
import {
  VK_QUESTIONS,
  answerVkQuestion,
  hasVkAnswer,
  validVkItem,
} from "./vkStagingJourney.js";
test("VK answers start empty, retain prior steps and preserve existing preference mapping", () => {
  let answers = {};
  for (let step = 0; step < 3; step++)
    assert.equal(hasVkAnswer(answers, step), false);
  answers = answerVkQuestion(answers, 0, "Работа");
  answers = answerVkQuestion(answers, 1, "Сбалансированная");
  answers = answerVkQuestion(answers, 2, "Не знаю / нет предпочтения");
  assert.deepEqual(answers, {
    occasion: "Работа",
    dressCode: "Деловой",
    fit: "Сбалансированная",
    colorComparison: "Не знаю / нет предпочтения",
  });
  answers = answerVkQuestion(answers, 0, "Встреча");
  assert.equal(answers.fit, "Сбалансированная");
  assert.equal(answers.dressCode, "Smart casual");
  assert.equal(answerVkQuestion(answers, 0, "injected"), answers);
  assert.equal(VK_QUESTIONS.length, 3);
});
test("VK add requires both supported metadata fields, without extending backend schema", () => {
  assert.equal(validVkItem("", ""), false);
  assert.equal(validVkItem("shirt", ""), false);
  assert.equal(validVkItem("", "blue"), false);
  assert.equal(validVkItem("shoes", "blue"), false);
  assert.equal(validVkItem("shirt", "red"), false);
  assert.equal(validVkItem("shirt", "blue"), true);
});
