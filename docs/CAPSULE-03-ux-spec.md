# CAPSULE-03 — UX/UI-спецификация капсул

Статус: `UX SPEC PASS / IMPLEMENTATION HOLD`  
Дата: 21.08.2026  
Область: входы в капсулы, карточка капсулы, матрица образов, объяснения, empty/error/loading/mobile. Production-код, изображения, auth/Supabase не изменялись.

## 1. Решение

Капсула — спокойный рабочий набор вещей, из которого пользователь сразу понимает: **что входит, сколько образов реально собрано, для каких ситуаций они подходят и почему вещи сочетаются**. Это не бесконечная «AI-лента» и не обещание идеального гардероба.

Визуальное направление продолжает утверждённый green direction проекта: молочный canvas, белые поверхности, мягкий шалфей и эвкалипт, тёмно-зелёный текст, крупные радиусы, тонкие границы и редкие рассеянные тени. На экране один доминирующий CTA; декоративный serif допустим только в крупных заголовках.

Принцип раскрытия: **обзор → капсула → матрица образов → объяснение конкретного образа**. Пользователь не обязан читать методологию до просмотра результата.

## 2. Границы продукта и данных

- Demo и personal — разные режимы. Demo-капсула использует только demo-вещи, имеет постоянную метку `Демо · не сохраняется` и не записывается в personal wardrobe/history.
- Личная капсула использует только подтверждённые personal-вещи одного владельца. Если пользователь пытается начать с личной вещи из demo, требуется явный переход в personal; смешанный набор не создаётся (`demo_and_personal_must_not_mix`).
- Сохранение, редактирование состава, история и feedback — personal-действия. В signed-out/demo они не должны выглядеть выполненными. UX может показать границу, но реализация auth/Supabase не входит в CAPSULE-03.
- Фото, названия вещей, точный город, email, свободный текст и payload объяснения не попадают в аналитику. Гардероб и капсулы private-by-default; публичного профиля и sharing в V1 нет.
- Объяснение строится только из подтверждённых allowlist-фактов. Unknown не превращается в догадку; публичные проценты совместимости и внутренний score не показываются.
- Тарифный UI читает plan/quota/reset только из server-owned entitlement contract. Нельзя выводить тариф или остаток из local counters.
- Цена может быть показана как `499 ₽` / `999 ₽` только рядом с утверждёнными различиями. Пока состав entitlement двух планов, период цены, reset и расход квоты не зафиксированы, comparison/paywall — `HOLD`.
- Первый полезный результат доступен до paywall. Тарифное предложение допустимо после реального результата либо у прозрачного порога; без таймеров, дефицита и ложной срочности.
- VK ID — только исследовательский backlog. В экранах, copy и acceptance CAPSULE-03 способ входа не обещается.

## 3. Информационная архитектура и входы

### 3.1 Разрешённые входы

| Вход | Контекст | Первый экран | Главный CTA |
|---|---|---|---|
| Главная / результат первого образа | demo | Preview demo-капсулы с честной меткой | `Посмотреть 8 образов` |
| Гардероб, вкладка `Мой гардероб` | personal | Список личных капсул или readiness-empty | `Собрать капсулу` |
| Карточка сохранённого образа | personal | Капсула, которой принадлежит snapshot | `Открыть капсулу` |
| Гардероб, вкладка `Демо-вещи` | demo | Demo-капсула; personal CTA отделён | `Посмотреть образы` |
| Прозрачный quota notice | personal | Не перехватывает текущий сценарий; ведёт в plan education | `Сравнить тарифы` |

Нельзя автоматически открывать paywall, auth или upload при входе в demo-капсулу. Back возвращает в исходный контекст, а не всегда на главную. Deep link в personal при signed-out не раскрывает название, фото или состав капсулы; показывает нейтральную границу доступа.

### 3.2 Навигация

Desktop: breadcrumb `Гардероб / Капсулы / [Название]`, затем header капсулы. Mobile: кнопка `Назад` с accessible name, короткий title и overflow-menu; breadcrumb скрыт. Нижняя навигация не перекрывает sticky CTA.

## 4. Экран обзора капсул

### 4.1 Header

- Eyebrow: `КАПСУЛЫ`.
- H1: `Меньше решений — больше готовых образов`.
- Lead: `Собирайте небольшие наборы вещей для конкретной жизни: работы, поездки или сезона.`
- Personal primary: `Собрать капсулу`; demo secondary: `Посмотреть пример`.

### 4.2 Карточка капсулы

Карточка — `article`, не кликабельный `div`. Внутри одна явная ссылка на detail; menu имеет отдельный focus target.

Обязательный состав:

1. Collage/neutral preview с фиксированным aspect ratio `4:3`; изображения — контент, не background-only. При отсутствии изображения показывается спокойная типографическая поверхность, без сломанной иконки.
2. Badge источника: `Личная` или `Демо · не сохраняется`.
3. Название, например `Спокойный офис`.
4. Подтверждённые counters: `12 вещей · 8 образов`. Ноль не маскируется.
5. До двух контекстов: `Офис`, `+10…+18 °C`; погода показывается только при наличии weather context.
6. Status line: `Готова`, `Нужно добавить обувь`, `Обновляем образы` или безопасная ошибка.
7. Primary link: `Открыть капсулу` / `Продолжить сборку`.

Не показывать: «идеальная капсула», оценку тела/цветотипа, процент завершённости без определённого denominator, число потенциальных комбинаций вместо реально валидированных образов.

Desktop grid: 3 колонки при ширине ≥1100px, 2 колонки 720–1099px. Mobile: одна колонка, horizontal carousel запрещён для основного списка. Sort/filter появляются только при достаточном количестве данных; исходный V1 порядок — recent personal, затем demo-example.

## 5. Detail капсулы

### 5.1 Hero

- Badge `Личная` / `Демо · не сохраняется`.
- H1 — пользовательское либо безопасное системное название.
- Summary: `12 вещей собраны в 8 готовых образов для офиса и выходных.`
- Context chips: повод, сезон/температура, настроение; chips не выглядят как кнопки, если не интерактивны.
- Primary: `Посмотреть образы`.
- Personal secondary: `Изменить состав`; demo secondary: `Перейти в мой гардероб` (явная граница, без скрытой записи).
- Tertiary menu: переименовать/архивировать/удалить — только после отдельного product/data contract; до него действия не проектируются как доступные.

### 5.2 Состав

Группа `В капсуле` показывает карточки подтверждённых вещей по категориям. На каждой: фото/placeholder, название, категория, source badge при demo. Недоступная или удалённая вещь остаётся видимой в snapshot как `Вещь больше недоступна`, но не участвует в новых комбинациях. CTA `Добавить вещь` не обещает, что добавление бесплатно: рядом по необходимости отображается реальный `used/limit` и reset date из entitlements.

Readiness блок формулирует конкретный разрыв: `Не хватает закрытой обуви для образов на прохладную погоду`. Он предлагает `Добавить обувь` или `Изменить условия`, но не заставляет загружать фото: ручное описание остаётся допустимым fallback.

## 6. Матрица образов

### 6.1 Модель взаимодействия

Матрица — это responsive collection готовых outfit snapshots, а не spreadsheet. Desktop: слева компактные фильтры, справа сетка 2–3 колонок. Mobile: filter button открывает bottom sheet/dialog; результаты идут одной колонкой.

Фильтры V1:

- `Все`;
- повод — только значения, реально присутствующие в результатах;
- погода — только если контекст включён;
- состояние `Готовые` / `Нужно заменить`.

Каждая outfit-card содержит:

- flat-lay/grid состава с 3–5 вещами; порядок предсказуем: anchor/верх/низ или платье/верхний слой/обувь/аксессуар;
- название или контекст `Офис · прохладно`;
- categorical label `Подходит условиям` / `Есть компромисс` / `Нужно изменить`, без числа;
- короткую подтверждённую причину, максимум 2 строки;
- source labels на demo/personal assets, если режим допускает их отображение; смешанный mode не создаётся;
- primary `Открыть образ`, secondary personal `Заменить вещь`.

Активные фильтры видны chips над результатами, имеют `Сбросить`. Количество результатов сообщается через polite live region, но не на каждое нажатие клавиши. Пустой filter-result не уничтожает капсулу: `По этим условиям готовых образов пока нет` + `Сбросить фильтры` + `Изменить условия`.

### 6.2 Detail образа

Порядок: визуал → состав → `Почему это работает` → `Что можно поменять` → feedback. Сохранённый personal outfit — immutable snapshot; замена создаёт новый candidate/версию, не переписывает прошлый сохранённый образ.

Действия соответствуют текущему контуру: `Спокойнее`, `Ярче`, `Официальнее`, `Комфортнее`, `Заменить обувь`. Copy обязано уточнять: `Поищем вариант`, а не обещать существование подходящей замены.

## 7. Объяснения

Карточка `Почему это работает` использует disclosure:

- collapsed: summary + 1–2 strongest confirmed facts;
- expanded: четыре существующих allowlist-раздела renderer, практический совет и ограничение;
- unsupported section: `Пока недостаточно подтверждённых данных, чтобы объяснить эту часть без догадок.`

Формат каждого supported пункта: `Факт → роль в образе → допустимое изменение`. Например: `Прямой верх и более свободный низ сохраняют баланс объёмов. Если хочется собраннее, попробуйте заменить низ.` Это допустимо только при соответствующем подтверждённом reasoning fact.

Запрещены свободные AI-объяснения вне renderer, body/demographic claims, score/confidence number, `вам точно идёт`, а также погода, которой нет во входном контексте. Ошибка объяснения не блокирует сам образ.

## 8. Состояния

### Loading

- Overview: 3 skeleton-card с сохранённой геометрией; `aria-busy=true`, текст `Загружаем капсулы…`.
- Capsule generation: determinate progress показывается только при реальном server progress. Иначе — этапы без фальшивых процентов: `Проверяем состав` → `Собираем валидные образы` → `Готовим объяснения`.
- Long wait >8 s: `Это занимает чуть дольше. Состав капсулы сохранён.` — только если сохранение подтверждено; в demo: `Вы можете вернуться к примеру позже в этой вкладке.`
- Skeleton не shimmer при `prefers-reduced-motion`; back доступен.

### Empty

| Состояние | Текст | CTA |
|---|---|---|
| Нет personal-капсул | `Здесь появятся небольшие наборы под вашу реальную жизнь.` | `Собрать первую капсулу` |
| Недостаточно personal-вещей | `Для устойчивой капсулы пока не хватает вещей разных ролей.` | `Посмотреть, чего не хватает` |
| Нет валидных образов | `Из этого состава пока не получается честно собрать образ под выбранные условия.` | `Изменить состав` |
| Фильтр дал 0 | `По этим условиям готовых образов нет.` | `Сбросить фильтры` |
| Нет facts | `Образ доступен, но подтверждённых данных для объяснения пока недостаточно.` | без блокирующего CTA |

### Error/offline

- List error: `Не удалось загрузить капсулы. Ваши данные не изменены.` CTA `Попробовать снова`.
- Generation error: `Не получилось собрать капсулу с первого раза. Состав и условия на месте.` CTA `Повторить`; secondary `Изменить условия`.
- Partial: `6 образов готовы, ещё 2 не удалось проверить.` Показываются только валидные результаты; CTA `Повторить проверку`.
- Offline demo: сохранённый в текущей вкладке demo-preview можно открыть, если он реально доступен; personal stale data не маркируется как синхронизированное.
- Offline personal mutation: `Сейчас нет связи. Изменения не сохранены.` Draft не выдаётся за server-confirmed.
- Error container — `role=alert`; retry идемпотентен и не создаёт дубликат капсулы.

## 9. Mobile и accessibility

- Breakpoints задаются поведением, не моделью устройства: single-column ≤719px; touch target ≥44×44px; gutter 16px.
- Hero CTA на mobile может быть sticky, но учитывает `env(safe-area-inset-bottom)`, fixed nav и экранную клавиатуру. Он перестаёт быть sticky возле footer.
- Outfit flat-lay сохраняет целиком все вещи (`object-fit:contain`); названия не накладываются на фото. Tap не зависит от hover.
- Filter bottom sheet имеет dialog semantics, title, close, focus trap, Escape и возврат фокуса. На высоте 568px содержимое скроллится, CTA остаётся достижимым.
- Card/list semantics, heading hierarchy и landmark names уникальны. Интерактивная карточка не содержит вложенных конфликтующих controls.
- Full keyboard path, visible focus ≥3px, native button/link/radio/checkbox semantics. Drag-and-drop никогда не единственный способ менять порядок/состав.
- Контраст обычного текста ≥4.5:1, крупных элементов/UI graphics ≥3:1. Badge и status отличаются не только цветом.
- Live regions: loading/result count — polite; blocking error — alert. Не анонсировать skeleton и декоративные изображения.
- Горизонтальный overflow = 0 на 320/360/390/412/430/768/1280/1440 и при 200% zoom; длинные названия, цены и локализованные даты переносятся без обрезания.

## 10. Визуальные tokens

| Token | Значение | Использование |
|---|---|---|
| `canvas` | `#F7F8F3` | фон страницы |
| `surface` | `#FFFFFF` | карточки |
| `surface-sage` | `#E9F0E5` | selected/readiness/evidence |
| `sage-700` | `#405943` | primary, focus, strong text |
| `sage-500` | `#6F8970` | accents, non-text selected state |
| `ink` | `#1F2A22` | основной текст |
| `muted` | `#617064` | вторичный текст |
| `warning` | `#765B2F` | tradeoff, не error |
| `danger` | `#9A4038` | error/destructive only |
| Radius | `18 / 26 / 34px` | controls/cards/hero |
| Shadow | `0 18px 50px rgba(49,73,53,.10)` | только поднятые surfaces |

Motion 160–240ms, только opacity/transform; generation не изображается как магический бесконечный shimmer. System sans — UI, display serif — H1/H2. Main text measure ≤62ch.

## 11. PASS / HOLD

### PASS — можно передавать в product/design review

- Информационная архитектура, входы, card/detail/matrix hierarchy и responsive behavior.
- Green visual direction и базовые tokens, совпадающие с утверждённым первым-wow UX.
- Честные demo/personal boundaries, private-by-default и unknown-safe explanations.
- Copy/state model для loading, empty, partial, error и offline.
- Accessibility и mobile acceptance ниже.

### HOLD — нельзя считать готовым к production

- Создание/сохранение/редактирование капсул: отсутствует утверждённый `Capsule`/version/snapshot API и idempotency contract.
- Любой auth/Supabase path и deep-link restore: отдельный workstream; CAPSULE-03 их не меняет.
- Paywall и сравнение 499/999 ₽: не утверждены точные entitlement differences, billing period, monthly 10–15 rule, reset и то, что расходует квоту.
- Смешанные personal + demo капсулы: текущий проектный контракт их запрещает; разрешение потребует отдельного product/privacy/data decision.
- Удаление/архивирование/шаринг капсул: нет lifecycle contract; sharing — non-goal V1.
- Production PASS: нужны real backend/provider evidence, реальные данные, mobile/browser/a11y QA и moderated usability test.

## 12. Риски и зависимости

| Риск | Последствие | Снижение / зависимость |
|---|---|---|
| UI опережает capsule domain contract | потеря состава, дубли, переписанные snapshots | сначала schema/API/version/idempotency/lifecycle |
| Demo визуально похож на personal | ложное ожидание сохранения и privacy confusion | постоянный source badge, разные CTA, guard на запись |
| Матрица обещает комбинаторику | невалидные или бессмысленные образы | считать только прошедшие hard gate candidates |
| Explanation drift | убедительный, но неподтверждённый текст | renderer allowlist + golden tests + unknown fallback |
| Paywall до ценности | провал активации и недоверие к 499/999 ₽ | первый результат до paywall; server-owned entitlement |
| Большие collage/card grids на mobile | overflow, мелкие targets, тяжёлый decode | 1-column, responsive thumbnails, performance budget |
| Offline/stale personal state | пользователь считает draft сохранённым | explicit local/pending/server-confirmed statuses |
| Недостаточный wardrobe coverage | пустые капсулы и повторяющиеся образы | readiness reasons и manual add fallback |

Зависимости: Capsule domain/API owner; entitlement/pricing decision; current candidate + explanation contracts; photo/privacy gate; demo/personal policy; weather context; legal copy; design token owner; QA fixtures с длинными названиями и missing assets.

## 13. Acceptance criteria

- [ ] Все пять разрешённых entry paths ведут в ожидаемый режим; Back возвращает в origin context.
- [ ] Signed-out deep link не раскрывает personal metadata или previews.
- [ ] Каждая капсула имеет видимый `Личная` либо `Демо · не сохраняется`; demo не появляется в personal storage/history.
- [ ] Попытка добавить personal item из demo требует явного mode transition; смешанный набор не создаётся.
- [ ] Карточка показывает только реальные item/outfit counters; potential combinations не выдаются за готовые образы.
- [ ] Матрица показывает только hard-gate-valid candidates; public numeric score отсутствует.
- [ ] Outfit detail сохраняет snapshot semantics; замена не переписывает сохранённый прошлый образ.
- [ ] Каждое утверждение explanation связано с confirmed allowlist fact; unknown получает нейтральный fallback.
- [ ] Ошибка explanation не блокирует просмотр образа; partial results явно маркированы.
- [ ] Empty states различают no capsules, insufficient coverage, no candidates, zero filter result и no facts.
- [ ] Retry идемпотентен; UI не создаёт визуальный дубль после повторной команды.
- [ ] Offline personal mutation не маркируется как сохранённая/синхронизированная.
- [ ] Цена 499/999 ₽ не показывается без billing period и server-confirmed differences; первый результат доступен до paywall.
- [ ] Keyboard-only проходит overview → capsule → filters → outfit → explanation → back; focus не теряется.
- [ ] Touch targets ≥44×44px; normal contrast ≥4.5:1; focus indicator ≥3px; status не кодируется одним цветом.
- [ ] Overflow = 0 на 320/360/390/412/430/768/1280/1440 и при 200% zoom; sticky CTA не перекрывает nav/content.
- [ ] Screen-reader announces loading/result count/error корректно; decorative collage не создаёт шум.
- [ ] `prefers-reduced-motion` отключает shimmer/сдвиг; long loading сохраняет доступный Back.
- [ ] QA включает empty/error/offline/partial/missing-image/long-Russian-copy и 3–5 items per outfit.
- [ ] Production PASS не выставляется по макету или synthetic tests без backend, real-device screen reader и browser evidence.

## 14. Следующие задачи

1. `CAPSULE-04 — Domain/API`: определить `Capsule`, membership, conditions, generation job, snapshot/version, lifecycle, idempotency и stable error codes.
2. `CAPSULE-05 — Entitlements`: утвердить различия 499/999 ₽, период, initial 50, monthly 10–15, reset и операции расхода; подготовить honest plan copy.
3. `CAPSULE-06 — Content prototype`: без production-интеграции собрать wireflow overview/detail/matrix/states на существующих demo fixtures и проверить 5–7 moderated sessions.
4. `CAPSULE-07 — Privacy review`: data classification, analytics allowlist, deep-link redaction, retention/delete и demo/personal guards.
5. `CAPSULE-08 — Implementation`: только после отдельного разрешения, за feature flag, без изменения auth provider; contract tests прежде UI wiring.
6. `CAPSULE-09 — QA gate`: keyboard, axe, screen readers, 200% zoom, mobile matrix, offline/retry/idempotency, stale state и performance with large wardrobe.
7. `BACKLOG — VK ID research`: feasibility/threat/privacy/legal review без обещания способа входа и без implementation dependency для капсул.

## 15. Основание спецификации

Согласовано с текущими проектными источниками: `MVP-MAGIC-02-first-wow-ux-spec.md`, `auth-profile-onboarding-product-contour-v1.md`, `stylist-explanation.md`, `stylist-candidate-engine-v1.md`, `MVP-MAGIC-05-real-stylist-contract.md`, `domain-model.md`, а также runtime boundary `demoPersonalFlow.js`. При конфликте будущая утверждённая domain/API/entitlement версия должна обновить эту спецификацию до реализации.
