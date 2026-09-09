# BACKLOG-09 — интеграция первого результата после онбординга

Интегрировать подготовленный BACKLOG-01 без изменения его продуктового контракта.

1. В `src/main.jsx` импортировать `FirstOnboardingResult`, `createFirstOnboardingResultController` и `FIRST_RESULT_ACTIONS`.
2. Добавить отдельный screen `first-demo-look`. В `onLocalComplete` после успешного локального completion заменить `setScreen("wardrobe")` на создание результата через controller и `setScreen("first-demo-look")`. Передать все три значения: `goal`/`occasion`, `fit`, `colorComparison`.
3. Для demo outfit передать существующий `demoExperience.outfit` вместе с соответствующими объектами из массива `demo`; не копировать demo-вещи в personal wardrobe и не вызывать repository save.
4. Отрисовать `<FirstOnboardingResult result={firstResult} onAction={...} />` до ветки `screen === "wardrobe"`.
5. Маршрутизация действий должна быть точной:
   - `ADD_FIRST_ITEM` → открыть существующий photo/manual intake для первой личной вещи;
   - `PHOTO_IN_STORE` → открыть тот же безопасный photo intake в сценарии магазина (без обещаний production AI/удаления фона);
   - `OPEN_DEMO_WARDROBE` → `setScreen("wardrobe")`, затем открыть вкладку demo.
6. Не добавлять действие сохранения на first-result screen. Перед любым общим save handler применять `guardFirstResultSave`: `demo_cannot_be_saved_as_personal` обязан завершать операцию без записи.
7. Не внедрять четыре A/B-визуала и 27 аватаров. Сохранить текущий нейтральный UI до голосования.

Acceptance: после третьего ответа первым экраном является `first-demo-look`; видны резюме трёх ответов, маркировка «Демо-образ», готовый комплект и ровно три действия; demo не появляется в personal storage/history. Затем выполнить `npm test` и `npm run build`, а browser/mobile QA оставить отдельным gate.
