# CAPSULE-12 — объяснения капсулы «настоящим стилистом»

Дата: 21.08.2026  
Статус: **PASS — UX/domain design; HOLD — production quality and rollout**  
Scope: цвет, силуэт, пропорции, повторяемость, контекст, погода, practical styling, missing item. Production-код, авторизация и Supabase не менялись. VK ID остаётся только исследовательским backlog.

## 1. Решение

Объяснение капсулы должно быть не свободным текстом, а проекцией версионированного decision trace:

`подтверждённые вещи + запрос/контекст + погода + явные предпочтения + история подтверждённых действий → capsule trace → короткий вывод → раскрываемые основания → одно практическое действие → оценка пользователя`.

**PASS для проектирования:** контракт ниже согласуется с текущими `StylistDecision`, unknown-safe renderer, feedback/learning и demo/personal separation.  
**HOLD для production:** текущий runtime не имеет единого capsule trace, самостоятельного proportion/repeat trace и проверенной связи `missing item → пересобранная капсула`. Synthetic-проверки не доказывают вкус, носибельность или ценность тарифов 499/999 ₽.

## 2. Подтверждённая база и границы утверждений

Подтверждено текущим проектом:

- `schemas/stylist-reasoning-v1.schema.json` задаёт вещи, кандидатов, факты, альтернативные действия и recommendation, но не capsule-level decision.
- `src/stylistExplanation.js` публикует только allowlist-факты, скрывает неподдержанные коды и даёт fallback при нехватке данных; действующие секции — цвета, силуэт, контекст, профиль.
- `docs/MVP-MAGIC-05-real-stylist-contract.md` требует factor trace `supported | tradeoff | unknown`, confidence/unknowns, пропорции как композицию вещей, повторяемость без запрета любимых вещей и отсутствие гарантий посадки без примерки.
- Погода имеет источник/актуальность; ручной ввод допустим. Геолокация не обязательна, а название города при поиске передаётся погодному провайдеру; остальные настройки заявлены локальными.
- Feedback допускает `would_wear`, `not_for_me`, `replace_item`, consent/provenance/undo; один сигнал слабый и не должен превращаться в постоянное правило.
- Demo и personal нельзя смешивать: demo-result можно объяснить публично, но нельзя выдавать за личную капсулу или сохранять как personal. Personal learning/write допустим только в разрешённом текущим продуктовым gate состоянии.
- 499/999 ₽ — продуктовый контекст, а не доказанный entitlement данного объяснения. UI не должен выводить доступность, лимиты или преимущество тарифа из локального профиля либо текста рекомендации.

Не подтверждено и потому запрещено утверждать: что вещь «идёт фигуре», визуально стройнит/молодит, соответствует цветотипу, точно сядет, будет комфортна без metadata/примерки, подходит с заданной вероятностью, действительно была надета, доступна/чиста, либо что покупка missing item окупится.

## 3. Выходной контракт `CapsuleExplanation v1`

Минимальный логический объект (не предложение менять текущую schema без отдельной задачи):

```text
CapsuleExplanation {
  version, capsule_id, source: demo | personal,
  snapshot_revision, ruleset_version, explanation_version,
  verdict: ready | ready_with_tradeoff | incomplete | insufficient_data,
  confidence: high | medium | low,
  confidence_reasons[], unknowns[],
  dimensions: {
    color, silhouette, proportions, repeatability,
    context, weather, practical_styling, missing_item
  },
  summary, next_action?, limitation,
  feedback_prompt
}

Dimension {
  status: supported | tradeoff | unknown | not_applicable,
  fact_ids[], text, action?
}
```

Инварианты:

1. Любое предметное предложение ссылается на `fact_ids`; неизвестное не преобразуется в PASS.
2. Публичного числового score и сырого evidence нет. Confidence объясняет полноту и согласованность данных, а не вероятность вкуса.
3. `tradeoff` всегда имеет одно выполнимое действие; `unknown` — один способ уточнить либо безопасный fallback.
4. Текст описывает вещи и композицию, не тело или демографию пользователя.
5. `source=demo` маркируется «пример на демо-вещах»; demo feedback не обновляет personal profile и не расходует personal quota.
6. Personal feedback записывается только через существующий consent/owner/provenance/undo contract. Free text не нужен для ranking и не должен попадать в telemetry.
7. Тариф не меняет истинность объяснения. Если entitlement не подтверждён server-owned источником, CTA нейтрален: «Проверить доступность», не «Доступно в вашем тарифе».

## 4. Восемь измерений объяснения

| Измерение | Разрешённые подтверждённые основания | Unknown-safe текст | Практическое действие |
|---|---|---|---|
| Цвет | dominant/supporting/accent, семейство, светлота, насыщенность, повтор оттенка | «Цвета части вещей не подтверждены; палитру пока не оцениваю» | подтвердить цвета; оставить один акцент; заменить только конфликтующий цвет |
| Силуэт | fit, volume, structure, length конкретных вещей | «Объём/посадка одной из ключевых вещей не подтверждены» | сохранить один объёмный элемент; заменить второй на более собранный |
| Пропорции | относительные длины, видимая линия талии, границы слоёв, длина верха/низа | «Без подтверждённых длин и примерки оцениваю только композицию вещей» | заправить/расстегнуть/подвернуть, показать границу слоёв либо проверить в полный рост |
| Повторяемость | число валидных образов, role coverage вещей, повтор комбинаций, подтверждённая wear history | «Истории ношения нет; повторяемость оцениваю по числу сочетаний, не по фактической носке» | назвать вещь-мост; предложить 2–3 разные комбинации; не штрафовать любимую вещь без fatigue signal |
| Контекст | occasion, indoor/outdoor, duration, activity, formality, явные exclusions | «Повод/активность не указаны; уместность не подтверждена» | уточнить контекст или дать нейтральный сценарий без категоричного claim |
| Погода | temperature/feels-like, precipitation, wind, source, observed/forecast time, warmth/layering metadata | «Погода или теплота вещей не подтверждены» | добавить/убрать подтверждённый слой; заменить обувь; запросить ручное уточнение |
| Practical styling | только действия, выведенные из уже подтверждённого tradeoff | «Без примерки не утверждаю посадку; проверьте этот приём» | одно обратимое действие без покупки: заправить, подвернуть, расстегнуть, сменить слой/обувь |
| Missing item | доказанный coverage gap: обязательная категория/роль отсутствует среди ready/confirmed personal items | «Не вижу подтверждённой вещи этой роли» вместо «у вас её нет» | сначала альтернатива из гардероба; затем свойства недостающей вещи; покупка — только отдельный opt-in |

### Правила по измерениям

**Цвет.** Называть роль, а не вкус как факт: «молочный — основа, бордовый — один акцент». «Гармонично» допустимо только как вывод из поддержанного правила и лучше раскрывается конкретной причиной. Фото с неопределённым цветом не позволяет уверенно называть оттенок.

**Силуэт и пропорции.** Силуэт отвечает за объём/структуру, пропорции — за отношения длин и границы слоёв. Эти секции нельзя дублировать. Формулировка «открытая талия делит длины верха и низа» допустима; «подчёркивает достоинства фигуры» — нет.

**Повторяемость.** Для капсулы показывать проверяемый результат: «6 вещей дают 8 валидных комбинаций; жакет участвует в 5 и связывает деловой и повседневный сценарии». Число допустимо только если комбинации реально сгенерированы после hard gates. История ношения влияет лишь при подтверждённых событиях. Повтор вещи не является недостатком сам по себе; fatigue сильнее применяется к комбинации.

**Контекст и погода.** Сначала hard safety/availability, затем stylist tradeoff. Старый прогноз или неизвестный источник понижает confidence. При конфликте «красивее, но холодно» результат не `ready`: требуется слой/замена или честный `incomplete`.

**Practical styling.** Совет должен менять один параметр и быть проверяемым пользователем. Максимум один главный совет в collapsed view; остальные — по раскрытию. Нельзя советовать физически невозможное действие без metadata вещи.

**Missing item.** Это роль, а не товар: `водостойкая закрытая обувь, нейтральная, комфорт для долгой ходьбы`, а не бренд/SKU. Основание хранит контекст, обязательную роль, просмотренные confirmed items и причину отказа альтернатив. Если gap влияет только на разнообразие, статус `tradeoff`; если нарушает hard gate, `incomplete`. Рекомендация покупки отделена от объяснения и не появляется автоматически.

## 5. UX и copy hierarchy

Collapsed card:

1. Вердикт: «Капсула готова», «Готова с одним компромиссом», «Нужно дополнить» или «Пока мало данных».
2. Две самые полезные причины из разных измерений.
3. Одно действие.
4. Confidence/limitation обычным языком.
5. «Почему так?» раскрывает все восемь измерений, включая `unknown`.

Пример с подтверждёнными фактами:

> **Готова с одним компромиссом.** Нейтральная основа позволяет повторять вещи, а один бордовый акцент связывает комплекты. Жакет и прямой низ дают более собранную форму, но для указанного дождя нет подтверждённой подходящей обуви. Сначала попробуйте другую закрытую пару из гардероба; если её нет среди подтверждённых вещей, недостающая роль — водостойкая обувь для долгой ходьбы. Уверенность средняя: посадку без примерки не гарантирую.

Пример при нехватке данных:

> **Пока предварительно.** Не подтверждены длины двух вещей и погода на выбранное время, поэтому пропорции и комфорт не оцениваю. Уточните эти данные — после этого я пересоберу капсулу. Цветовая основа подтверждена, но это не доказывает посадку.

Запрещённый copy: «идеально», «точно подойдёт», «стройнит», «ваш цветотип», «вам нужно купить», «вы часто носите» без wear history, «в тарифе 999 доступно» без server entitlement.

## 6. Пользовательская оценка и learning

На карточке капсулы:

- Primary: **«Надела бы»**.
- Secondary: **«Не моё»** с одной структурированной причиной: `colors | too_dressy | fit | shoes | too_hot | too_cold | not_my_style`.
- Action: **«Заменить вещь»** с конкретным `item_id`; отдельное **«Совет не помог»** относится только к practical action и не превращается в body/fit inference.
- Для missing item: **«У меня есть такая вещь»**, **«Показать альтернативу»**, **«Не нужно»**. Это корректирует coverage/intent, но не считается покупкой.

После действия UI показывает learning preview: что именно может измениться, что один сигнал слабый, и Undo. Demo-оценка измеряет понятность/интерес к примеру только session-local; personal preference не обновляет. До consent personal feedback остаётся session-only и не заявляется как «стилист запомнил».

Минимальная продуктовая метрика — capsule QWWR: доля eligible capsule sessions с `would_wear` хотя бы для одного из не более чем трёх предложений и без undo в согласованном окне. Дополнительно: доля понятых объяснений, helpful practical action, missing-item dismissal, abstention/unknown rate и guardrail violations. Любой целевой процент требует заранее заданного pilot/holdout; сейчас он не является подтверждённым claim.

## 7. Privacy, demo/personal и тарифы

- Explanation trace содержит item IDs/признаки, но не тело, возраст, пол, геолокацию, email, фото или свободный текст в telemetry.
- Фото не обязательно для капсулы; отсутствие фото человека не снижает entitlement и не оправдывает телесные выводы.
- Название города и weather source показываются только в степени, нужной для актуальности; точные координаты не нужны.
- Demo item IDs, feedback и explanation trace не смешиваются с personal wardrobe/history/profile.
- Объяснение базового качества не должно намеренно становиться менее честным на тарифе 499 ₽. Возможные различия 499/999 ₽ — масштаб/частота/лимиты или расширенная функция — требуют отдельного утверждённого server-owned entitlement contract.
- Ни quota, ни paywall нельзя выводить из `missing item`: отсутствие роли — stylist fact, не коммерческий триггер.

## 8. Acceptance criteria

### Contract PASS

- [ ] Все восемь измерений имеют `status`, traceable `fact_ids`, текст и при необходимости действие.
- [ ] Неподтверждённый факт даёт `unknown`, понижает confidence либо вызывает уточнение; не становится положительным claim.
- [ ] Color/silhouette/proportion объясняют свойства и композицию вещей без body/color-type/demographic inference.
- [ ] Repeatability считает только реально валидные после hard gates комбинации; любимая вещь не штрафуется без подтверждённого fatigue signal.
- [ ] Context/weather учитывают источник и актуальность; hard weather/comfort конфликт нельзя компенсировать эстетикой.
- [ ] Каждый tradeoff имеет одно выполнимое изменение; practical action не требует покупки по умолчанию.
- [ ] Missing item появляется только после documented coverage gap и сначала предлагает confirmed wardrobe alternative.
- [ ] Demo явно маркирован, не сохраняется как personal и не обучает personal profile.
- [ ] Feedback следует consent/provenance/ETag/idempotency/undo contract; один сигнал остаётся слабым.
- [ ] Текст не обещает посадку, вкус, процент успеха, наличие вещи, фактическую носку или entitlement без evidence.

### Production PASS gate

- [ ] Единый versioned capsule decision trace связывает generator, hard gates, ranking, explanation, alternatives и feedback.
- [ ] Proportion, repeatability и missing-item facts добавлены в schema/allowlist с golden snapshots и forbidden-claim scan.
- [ ] Tested matrices: complete/unknown/conflicting metadata; cold/heat/rain/wind; small wardrobe; demo/personal; stale weather; no safe candidate; missing item dismissed/provided.
- [ ] Human review двумя независимыми стилистами проверяет grounding, понятность, выполнимость и отсутствие чувствительных выводов; critical fail = 0.
- [ ] Consented pilot измеряет QWWR/helpfulness/unknown calibration и guardrails; copy цели утверждается только после holdout.
- [ ] Server-owned entitlement для 499/999 ₽ отдельно подтверждён; explanation не выводит его локально.

Пока хотя бы один пункт production gate не закрыт, итоговый статус остаётся **HOLD**.

## 9. Риски и зависимости

| Приоритет | Риск | Митигация / зависимость |
|---|---|---|
| P0 | Explanation дрейфует от выбранного candidate | единый selected-candidate/capsule trace; renderer принимает только trace |
| P0 | Unknown маскируется уверенным stylist copy | typed statuses, abstention, golden negative cases, forbidden-claim scan |
| P0 | Missing item превращается в скрытую продажу | role-based gap, wardrobe-first fallback, отдельный opt-in shopping flow |
| P0 | Demo facts/feedback попадают в personal | source namespace, write boundary и integration tests |
| P1 | Неточные metadata дают правдоподобное объяснение | confirmed/ready gate, revision/provenance, ручная коррекция |
| P1 | Погода устарела или недостаточна | source/time, stale policy, manual fallback, confidence downgrade |
| P1 | Повторяемость оптимизирует однообразие | diversity guardrails, combination fatigue, explicit repeat preference |
| P1 | Feedback закрепляет случайный выбор | weak/trend/strong levels, decay, reasoned feedback, Undo |
| P1 | «Пропорции» скатываются в оценку тела | композиционный vocabulary allowlist и human safety review |
| P1 | Тарифный copy не совпадает с backend | только server-owned entitlement; отдельный pricing acceptance gate |
| P2 | Малый гардероб не даёт полноценную капсулу | honest `incomplete`, максимум полезных комбинаций, без выдуманного разнообразия |

Ключевые зависимости: качество confirmed garment metadata; единый `StylistDecision/CapsuleDecision`; context/weather adapter с актуальностью; wear-history provenance; consented feedback repository; demo/personal boundary; server entitlement contract; golden и human-review harness.

## 10. Следующие задачи

1. **CAPSULE-13 / P0 — CapsuleDecision schema:** определить capsule snapshot, dimension trace, confidence/unknowns, coverage gap и versioning; additive compatibility с reasoning v1.
2. **CAPSULE-14 / P0 — Grounded renderer:** добавить allowlist для proportions/repeatability/practical/missing item; renderer только из selected trace; ru-RU short/long snapshots.
3. **CAPSULE-15 / P0 — Coverage and repeat engine:** валидные комбинации после hard gates, role coverage, bridge item, combination fatigue и explicit repeat preference.
4. **CAPSULE-16 / P0 — Missing-item policy:** wardrobe-first alternatives, hard-gap/tradeoff distinction, dismiss/provided feedback, запрет автоматического shopping CTA.
5. **CAPSULE-17 / P0 — Safety/eval:** unknown/conflict/stale-weather/demo-personal matrices, forbidden claims, critical-fail gate.
6. **CAPSULE-18 / P1 — UX prototype:** collapsed verdict, eight-dimension disclosure, one-action hierarchy, accessible feedback/Undo.
7. **CAPSULE-19 / P1 — Learning integration:** capsule feedback → next ranking с consent/provenance/decay; no cross-source learning.
8. **CAPSULE-20 / P1 — Pilot:** заранее зафиксировать eligible session, QWWR/helpfulness/calibration, holdout и human review.
9. **PRICING-CONTRACT / P1:** владелец продукта подтверждает server-owned различия 499/999 ₽ и квоты; не блокирует честность базового explanation.
10. **VK ID / P2 research only:** отдельное исследование provider/UX/privacy; не зависимость CAPSULE-12 и не часть реализации.

## 11. Итоговый gate

**PASS:** дизайн объяснения конкретен, fact-grounded, unknown-safe, допускает пользовательскую оценку и сохраняет privacy/demo-personal/tariff boundaries.  
**HOLD:** production rollout и claim «настоящий стилист» до реализации единого trace, capsule-level факторов, safety/eval и реального consented pilot. Авторизация/Supabase и VK ID не входят в этот scope.
