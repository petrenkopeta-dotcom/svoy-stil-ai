import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
test("business-office and formal-evening are distinct",async()=>{const source=await read("./onboarding/OccasionDressCodeStep.jsx");assert.match(source,/Деловой \/ офисный/);assert.match(source,/Формальный \/ вечерний/);assert.match(source,/Работа, встречи/);assert.match(source,/Торжество, приём/);});
test("fit choices explain silhouettes in plain language",async()=>{const source=await read("./onboarding/FitStep.jsx");assert.match(source,/не прилегают/);assert.match(source,/По фигуре, но не тесно/);assert.match(source,/Чёткий силуэт/);});
test("color choice has swatches and a no-preference answer",async()=>{const source=await read("./onboarding/ColorComparisonStep.jsx");assert.match(source,/color-pair-swatch/);assert.match(source,/Не знаю \/ нет предпочтения/);assert.match(source,/aria-label=\{option.label\}/);});
test("mobile controls retain accessible touch sizes and visible focus",async()=>{const css=await read("./styles.css");assert.match(css,/\.onboarding-wizard \.chips \.chip\{[^}]*min-height:64px/);assert.match(css,/\.wizard-actions button\{[^}]*min-width:48px;min-height:48px/);assert.match(css,/\.onboarding-wizard :is\(button,input\):focus-visible/);});
