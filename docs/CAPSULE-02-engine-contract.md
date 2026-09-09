# CAPSULE-02 — доменная модель и контракт детерминированного capsule engine

Статус: **PASS для контракта и изолированного прототипирования; HOLD для production/UI-интеграции**  
Версия: `capsule-engine/0.1`  
Дата: 2026-08-21

## 1. Решение и границы

Капсула — это не один образ и не новый способ оценивать человека. Это воспроизводимый снимок из **8–12 подтверждённых вещей**, выбранных так, чтобы покрыть заданный набор сценариев несколькими технически полными и различающимися образами. Capsule engine оркестрирует существующий `stylist-candidate-engine-v1`, но не меняет его контракты и не подменяет распознавание вещей.

**PASS:** модель, алгоритм, публичный результат, коды причин, критерии приёмки и тестовая матрица достаточно определены для отдельной реализации и golden-тестов.

**HOLD:** нельзя подключать капсулу к production-коду или обещать пользователю готовую персональную капсулу, пока не утверждены продуктовые параметры coverage, entitlement для тарифов 499/999 ₽, UX пробелов/докупки и стабильная taxonomy occasion. Авторизация, Supabase и VK ID находятся вне этой задачи; VK ID — только исследовательский backlog.

Контракт соблюдает действующие ограничения проекта:

- только `ready`-вещи и подтверждённые признаки; неизвестное не угадывается по фото, названию, телу или демографии;
- demo и personal никогда не смешиваются в одной капсуле, образе, trace или persistence record;
- погода использует нормализованные факты, без raw GPS и без передачи identity/location в engine;
- пользователь не видит числовой score, «процент совместимости» или псевдоточную оптимальность;
- первый реальный образ остаётся до paywall; цены 499/999 ₽ и права плана приходят только из server-owned entitlement-контракта, но сам алгоритм от цены не зависит;
- никаких изменений production recognition, auth, Supabase, provider-вызовов или хранения фото.

## 2. Сущности

### `CapsuleRequest`

```ts
type CapsuleRequest = {
  requestId: string;
  mode: "demo" | "personal";
  ownerScope: string;                 // demo session или opaque personal owner
  itemTarget: 8 | 9 | 10 | 11 | 12;
  wardrobe: GarmentStyleFeatures[];   // снимки подтверждённых признаков
  anchors: CapsuleAnchor[];           // минимум один обязательный якорь
  scenarios: CapsuleScenario[];       // нормализованные occasion × weather
  constraints?: {
    excludedItemIds?: string[];
    recentOutfitSignatures?: string[];
    maxAccessories?: number;          // default 2 в капсуле
    maxOuterwear?: number;             // default 2 в капсуле
  };
  preferenceContext?: unknown;        // только действующий versioned adapter
};
```

`itemTarget` задаётся явно и находится в диапазоне 8–12. Engine не увеличивает его молча. Если обязательные якоря или физическая полнота образов требуют больше вещей, результат — `hold` с пробелами, а не капсула из 13 вещей.

### `CapsuleAnchor`

```ts
type CapsuleAnchor = {
  itemId: string;
  required: true;
  minimumOutfitUses: number; // integer 1..scenario count
};
```

Каждый якорь обязан войти в capsule item set и появиться минимум в указанном числе валидных образов. Отсутствующий, неготовый, исключённый или принадлежащий другому scope якорь завершает запрос стабильным кодом; engine не подбирает «похожую» вещь без отдельного действия пользователя.

### `CapsuleScenario`

```ts
type CapsuleScenario = {
  scenarioId: string;
  occasion: string;                 // явный нормализованный token
  importance: "core" | "support"; // не скрытый числовой вес
  requiredLooks: number;            // integer >= 1
  weather: {
    temperatureBand?: "cold" | "cool" | "mild" | "warm" | "hot";
    precipitation?: "none" | "rain" | "snow" | "mixed";
    wind?: "calm" | "breezy" | "strong";
    outerwearRequired?: boolean;
    waterproofShoesRequired?: boolean;
  };
  activity?: "low" | "moderate" | "active";
};
```

Город, координаты и provider payload не являются частью сценария. Ручной/погодный UI обязан сначала преобразовать данные в этот нормализованный контекст. Неуказанная погода не получает выдуманный сезон: weather rules для неё помечаются `not_evaluated`.

### `CapsuleCandidate` (внутренний)

```ts
type CapsuleCandidate = {
  itemIds: string[];
  outfitPoolByScenario: Record<string, CandidateOutfit[]>;
  coverage: ScenarioCoverage[];
  anchorCoverage: AnchorCoverage[];
  ruleFacts: CapsuleRuleFact[];
  internalTrace: InternalCapsuleTrace; // никогда не сериализуется в UI DTO
};
```

### `CapsuleResult` (публичный)

```ts
type CapsuleResult = {
  schemaVersion: "capsule-result/0.1";
  engineVersion: "capsule-engine/0.1";
  requestId: string;
  mode: "demo" | "personal";
  status: "ready" | "partial" | "hold";
  itemIds: string[];                  // 8..12 только при ready/partial
  looks: Array<{
    scenarioId: string;
    itemIds: string[];
    rankingLevel: "excellent" | "good" | "needs_change";
    reasonCodes: string[];
  }>;
  coverage: Array<{
    scenarioId: string;
    requiredLooks: number;
    availableLooks: number;
    state: "covered" | "partial" | "uncovered" | "not_evaluated";
  }>;
  anchorCoverage: Array<{
    itemId: string;
    requiredUses: number;
    actualUses: number;
    state: "covered" | "partial" | "uncovered";
  }>;
  strengths: string[];                // allowlisted message keys
  tradeoffs: string[];                // allowlisted message keys
  missingPieces: MissingPieceSuggestion[];
  noResultReasons: string[];
};
```

`availableLooks` — честный целочисленный count, а не score. `ready` требует 8–12 вещей, полного покрытия всех core-сценариев и всех якорей. `partial` допустим для просмотра только если состав 8–12 существует, но support-сценарии или некритичные требования покрыты частично. `hold` не должен выглядеть как готовая капсула.

### `MissingPieceSuggestion`

```ts
type MissingPieceSuggestion = {
  slot: "top" | "bottom" | "dress" | "one_piece" | "outerwear" | "shoes" | "accessory";
  requirement: {
    occasion?: string;
    temperatureBand?: string;
    precipitation?: string;
    colorRole?: "base" | "support" | "accent";
    silhouetteRole?: string;
  };
  unlocks: Array<{ scenarioId: string; additionalLooks: number }>;
  reasonCodes: string[];
};
```

Это описание функционального пробела, не товарная рекомендация и не разрешение на shopping/provider-интеграцию. Нельзя придумывать бренд, цену, размер или точный цвет при недостаточных данных.

## 3. Инварианты

1. Все `itemIds` уникальны; capsule item set содержит ровно `itemTarget` вещей и всегда 8–12.
2. Все вещи принадлежат одному `mode + ownerScope`; `demo + personal` даёт `scope_mismatch` до генерации.
3. Используются только `ready` и не исключённые вещи. AI suggestion без user confirmation не считается фактом.
4. Каждый образ технически полный: `top + bottom + shoes` либо `dress/one_piece + shoes`; обязательная по погоде верхняя одежда включена. Аксессуар не закрывает базовый слот.
5. Все обязательные якоря входят в капсулу и достигают `minimumOutfitUses` либо результат не `ready`.
6. Каждый опубликованный образ проходит hard constraints occasion/weather/activity; soft tradeoff показывается причиной.
7. Один и тот же набор item IDs не считается двумя образами. Порядок IDs не меняет подпись.
8. Одинаковый канонический вход + версии правил всегда дают byte-equivalent канонический результат.
9. Неизвестный признак не становится положительным совпадением и не создаёт уверенного негативного вывода; соответствующее правило — `not_evaluated`/`insufficient_data`.
10. В публичном DTO нет `score`, `utility`, весов, decimal rank или процентов.

## 4. Алгоритм

### 4.1 Канонизация и fail-fast

1. Валидировать версии, `itemTarget`, уникальность scenario/anchor IDs и диапазоны.
2. Проверить scope, status, excluded IDs и существование якорей.
3. Нормализовать порядок: вещи по stable ID, сценарии по `scenarioId`, якоря по `itemId`.
4. Построить scenario-specific запросы к существующему candidate engine. Occasion и подтверждённая погода передаются явно; location identity отбрасывается.
5. Если хотя бы для одного core-сценария отсутствует структурная база (`shoes`, `top+bottom` или `dress/one_piece`, обязательный outerwear), продолжить только для расчёта пробелов и вернуть `hold`.

### 4.2 Пул образов

Для каждого сценария вызвать детерминированную генерацию кандидатов с hard constraints до ranking. Внутренние числовые компоненты существующего engine разрешены для стабильной сортировки, но capsule layer получает также факты/коды правил. Кандидаты `needs_change` не закрывают core coverage; для support могут быть показаны только как tradeoff и не считаются `covered`.

Пул ограничивается детерминированно: одинаковый лимит на сценарий, stable signature tie-break, versioned limit. Усечение обязано попадать в internal trace (`pool_truncated=true`), потому что оно может влиять на доказательство оптимальности.

### 4.3 Обязательные якоря

Сначала резервируются required anchors. Для каждого якоря строится множество валидных образов по сценариям. Если достижение `minimumOutfitUses` невозможно даже на полном допустимом гардеробе, запрос получает `anchor_coverage_impossible`; алгоритм не ослабляет требование автоматически.

При нескольких якорях один образ может покрыть несколько требований, только если сочетание прошло все hard constraints. Конфликтующие якоря приводят к `anchors_incompatible_for_required_coverage` с evidence IDs во внутреннем trace.

### 4.4 Выбор 8–12 вещей

Задача трактуется как bounded deterministic set-cover с ограничением мощности:

1. Начальный набор — обязательные якоря.
2. На каждом шаге для каждой ещё не выбранной вещи рассчитывается внутренний **marginal coverage gain**: сколько пока не покрытых обязательных единиц она позволяет закрыть в сочетании с уже выбранными вещами. Единица покрытия — конкретный `(scenarioId, lookOrdinal)` или `(anchorId, useOrdinal)`, а не абстрактный процент.
3. Приоритет сравнения, по порядку:
   - закрытие ранее невозможного core-сценария;
   - закрытие недостающего anchor use;
   - увеличение числа полных валидных образов для core;
   - увеличение diversity образов;
   - закрытие support-сценария;
   - меньшая функциональная избыточность;
   - stable item ID как последний tie-break.
4. Добавлять вещи до выполнения требований и `itemTarget`. Если требования закрыты раньше, свободные слоты заполняются вещами, которые увеличивают diversity/robustness, не нарушая hard constraints.
5. Выполнить детерминированный local-improvement pass: по очереди проверять замену одной неякорной вещи на одну невыбранную. Замена принимается только если она улучшает приведённый выше лексикографический вектор и не снижает уже достигнутое core/anchor coverage. Повторять до fixed point или versioned малого лимита проходов.

Это не заявление о глобальном математическом optimum. UI говорит «собрана капсула по вашим условиям», но не «лучшая из всех возможных».

### 4.5 Color и silhouette

Color/silhouette применяются после структурных, occasion и weather hard constraints:

- использовать существующие подтверждённые color roles/facts (`base`, `support`, `accent`; neutral/repeated/contrast/saturation facts);
- не выводить «вам идёт», цветотип или свойства внешности;
- не запрещать образ только из-за эстетического tradeoff, если нет явно утверждённого hard constraint пользователя;
- поддерживать в капсуле повторно комбинируемую базу и ограниченное число конфликтующих акцентов; решение выражать stable fact codes;
- silhouette оценивается по подтверждённым fit/volume/length и контекстным ограничениям, без body inference;
- unknown уменьшает доступное доказательство, но не маскируется нейтральным «совпадением».

### 4.6 Diversity

Diversity — свойство набора опубликованных образов, не самоцель. После выбора вещей движок выбирает looks детерминированно так, чтобы:

- не было одинаковых signatures;
- для одного сценария следующий образ по возможности менял минимум одну базовую вещь (`top`, `bottom`, `dress/one_piece` или `shoes`), а не только аксессуар;
- одна вещь не доминировала во всех looks, кроме обязательного якоря с соответствующим required use;
- recent outfit signatures понижались во внутреннем порядке и по возможности не публиковались повторно;
- diversity никогда не вытесняла hard weather/occasion/anchor coverage.

Во внутреннем trace допустимы counts пересечений и reuse; UI показывает конкретное «3 разных варианта для работы» или tradeoff «образы различаются в основном аксессуарами», но не diversity score.

## 5. Missing-piece marginal utility

Если результат `partial`/`hold`, engine моделирует виртуальные **архетипы слотов**, а не товары. Для каждого одного missing archetype он повторно проверяет coverage и считает точную дельту: какие сценарии и сколько дополнительных валидных signatures разблокируются. Архетип публикуется, только если дельта положительна.

Сортировка suggestions лексикографическая:

1. разблокирует core-сценарий;
2. закрывает anchor coverage;
3. больше `additionalLooks` суммарно;
4. помогает большему числу сценариев;
5. более общий requirement (меньше неподтверждённых деталей);
6. стабильный slot/taxonomy key.

Публикуются максимум три различающихся предложения. Формулировка должна быть проверяемой: «непромокаемая обувь добавит 2 дождливых образа», а не «эта покупка улучшит капсулу на 37%». Две отсутствующие вещи одновременно не моделируются в v0.1: комбинаторные shopping-гипотезы дают ложную определённость.

## 6. Коды результата

Минимальный allowlist:

- `invalid_request`, `unsupported_schema_version`, `invalid_item_target`;
- `scope_mismatch`, `demo_personal_mix_forbidden`;
- `anchor_not_found`, `anchor_not_ready`, `anchor_excluded`;
- `anchor_coverage_impossible`, `anchors_incompatible_for_required_coverage`;
- `missing_shoes`, `missing_outfit_base`, `missing_required_outerwear`;
- `core_scenario_uncovered`, `support_scenario_partial`;
- `occasion_data_insufficient`, `weather_not_evaluated`, `color_data_insufficient`, `silhouette_data_insufficient`;
- `target_size_insufficient`, `target_size_exceeded_by_requirements`;
- `candidate_pool_truncated`, `only_low_quality_candidates`;
- `recent_repeat_avoided`, `diversity_limited_by_wardrobe`.

UI copy хранится отдельно от engine и проходит редакторскую/privacy-проверку. Свободный provider-текст в facts/result запрещён.

## 7. Internal trace и observability

Internal trace хранит версии адаптеров/rulesets, canonical input hash без image/location/PII, размеры пулов, truncation flag, выбранные signatures, coverage units, rule facts и лексикографические решения marginal gain. Trace не является пользовательским score breakdown и не должен попадать в analytics целиком.

Allowlisted telemetry: mode, item-count bucket, scenario-count bucket, status, reason codes, latency bucket, pool-truncated boolean. Запрещены image bytes/hash/filename, email, owner ID, точный город/GPS, свободный occasion-текст и полный wardrobe payload.

## 8. Demo/personal, privacy и тарифы

- Demo capsule строится только из demo-каталога, живёт в session scope и не сохраняется как personal.
- Переход с demo-якоря на личную вещь создаёт новый personal request после явной domain transition; никаких смешанных snapshots.
- Personal capsule использует только данные, доступные authenticated/personal command boundary согласно текущему проектному контуру; этот документ не реализует boundary.
- Погода может быть manual/provider-derived, но engine видит только нормализованные факты. При skip капсула честно маркирует weather как `not_evaluated`.
- Алгоритм одинаков для планов 499 и 999 ₽. Различаться могут только утверждённые entitlement limits (например, число сохранённых капсул/пересборок), полученные с сервера. Цена, локальный counter или inferred plan не являются входом ranking.
- До утверждения entitlement matrix UI не должен обещать различия 499/999 ₽ для capsule feature. First outfit before paywall остаётся обязательным продуктовым ограничением.

## 9. Риски и зависимости

| Риск | Уровень | Решение / gate |
|---|---:|---|
| Псевдоточная оптимальность просочится в UI из внутренних weights | высокий | отдельный публичный DTO; contract test запрещает numeric score/utility/percent |
| Текущий candidate pool (до 5000) усечёт комбинации и изменит coverage | высокий | scenario limits/versioned trace; stress/golden gate; не заявлять global optimum |
| Taxonomy occasion сейчас допускает свободные строки | высокий | утвердить allowlist и mapping до UI-интеграции |
| Weather enums расходятся (`rain/snow/mixed` против отдельных engine flags) | высокий | единый adapter contract и tests на все состояния/skip |
| Неизвестные признаки выглядят как нейтрально подходящие | высокий | `not_evaluated` и insufficient-data facts; запрет default-positive в capsule layer |
| Якорь делает coverage физически невозможным | средний | fail честным кодом; предложить изменить требование, не менять его молча |
| Diversity создаётся сменой одного аксессуара | средний | base-slot diversity gate |
| Missing piece превращается в скрытую рекламу/шопинг | высокий | только архетип слота + точные unlocked counts; без бренда/цены/ссылки |
| Demo-вещи попадают в personal capsule/history | критический | scope invariant и storage contract tests |
| Тарифная логика захардкожена в engine | высокий | только server-owned entitlements; ranking price-agnostic |
| Чувствительные выводы о теле/внешности | критический | только confirmed garment/context facts; privacy negative tests |

Зависимости до снятия HOLD:

1. Product: утвердить default `itemTarget`, набор core/support scenarios, required look counts и смысл capsule entitlement для 499/999 ₽.
2. Domain: стабилизировать occasion taxonomy и mapping существующего `goal`/manual context.
3. Engine: предоставить rule facts/hard-constraint evidence из candidate layer без изменения публичного numeric-score запрета.
4. Weather: зафиксировать один adapter `ManualContext/Open-Meteo → CapsuleScenario.weather` и правила stale/skip.
5. UX/content: макет ready/partial/hold, coverage и missing-piece copy без процентов и shopping-обещаний.
6. Privacy/analytics: утвердить allowlist capsule events и retention internal trace.
7. Entitlements: server-owned contract; auth/Supabase реализация остаётся отдельным потоком.

## 10. Acceptance criteria

Контракт/изолированная реализация считается PASS, если:

1. Канонический одинаковый input 100 раз даёт одинаковый canonical result; перестановка wardrobe/scenario input не меняет результат.
2. Для `itemTarget` 8–12 `ready/partial` содержит ровно это число уникальных вещей; вне диапазона — fail-fast.
3. Ни один `ready` не существует без полного core coverage и всех required anchor uses.
4. Каждый look структурно полон и проходит hard occasion/weather/activity constraints; обязательный outerwear/waterproof shoes проверяются.
5. Demo/personal mix и cross-owner item дают fail до candidate generation и не создают persistence payload.
6. Отсутствующий/неготовый/исключённый якорь имеет отдельный стабильный reason code; engine не заменяет его молча.
7. Unknown color/silhouette/weather не создаёт positive fact; result явно содержит insufficient/not-evaluated state.
8. Публичный JSON Schema запрещает `score`, `utility`, `weight`, `percent`, decimal ranking trace и неизвестные поля.
9. Для каждого missing-piece suggestion golden test подтверждает указанный exact `additionalLooks`; предложение с нулевой дельтой не публикуется.
10. Diversity test требует различия базового слота между последовательными looks, если такой валидный вариант существует; hard constraints всегда важнее.
11. Recent signatures избегаются при наличии равно допустимой альтернативы; tie-break по stable IDs воспроизводим.
12. Empty/малый/несбалансированный гардероб, 1 и несколько якорей, конфликтующие якоря, дождь/снег/жара/холод/skip, dress-path и separates-path покрыты golden matrix.
13. Internal trace фиксирует versions и truncation, но allowlisted telemetry не содержит PII, города, изображений, свободного текста или wardrobe IDs.
14. Engine output одинаков для планов 499/999 ₽ при одинаковом wardrobe/request; entitlement меняет только доступ к операции/лимиты вне ranking.
15. Не изменены production-код, auth/Supabase, VK ID, фотообработка и существующие persistence contracts.

## 11. Следующие задачи

1. **CAPSULE-03 — schemas:** JSON Schema для `CapsuleRequest/CapsuleResult`, closed objects, reason allowlist и negative test на numeric UI score.
2. **CAPSULE-04 — taxonomy decision:** утвердить occasion tokens, core/support presets и weather adapter mapping.
3. **CAPSULE-05 — isolated engine spike:** bounded set-cover + local improvement поверх synthetic fixtures, без подключения `main.jsx`.
4. **CAPSULE-06 — golden matrix:** минимум 30 сценариев, включая anchors, dress/separates, weather, unknowns, diversity и marginal utility.
5. **CAPSULE-07 — candidate evidence adapter:** вернуть hard/soft rule facts из существующего candidate engine, сохранив текущий публичный контракт образа.
6. **CAPSULE-08 — UX/content:** ready/partial/hold и coverage counts; запрет процентов, fake precision и «лучшая капсула».
7. **CAPSULE-09 — privacy/telemetry review:** event allowlist, trace retention, demo/personal negative gate.
8. **CAPSULE-10 — entitlement decision:** продуктово определить доступ/лимиты для 499/999 ₽; реализацию auth/Supabase вести отдельно.
9. **CAPSULE-11 — performance gate:** большие гардеробы, pool truncation, deterministic latency/memory budgets.
10. Только после PASS задач 03–11 запрашивать отдельное разрешение на production/UI-интеграцию.

## 12. Итоговый gate

**PASS:** документ задаёт конкретную, воспроизводимую и privacy-safe модель капсулы 8–12 вещей, coverage, anchors, weather/occasion, color/silhouette, diversity и missing-piece marginal utility без UI score.

**HOLD:** production реализация и пользовательский запуск до фиксации taxonomy, UX, entitlement 499/999 ₽, evidence adapter, golden/performance/privacy gates. Auth/Supabase не трогать; VK ID оставить в исследовательском backlog.
