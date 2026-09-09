# OUTFIT-02 — доменная модель outfit composition

Статус: **PASS для доменного контракта; HOLD для production-интеграции**  
Версия: `outfit-composition/0.1`  
Дата: 2026-08-21

## 1. Назначение и границы

`OutfitComposition` — детерминированное описание состава одного образа из подтверждённых вещей личного гардероба. Модель отвечает на вопросы: какие слоты закрыты, какие обязательны в данном контексте, в каком порядке надеваются слои, включён ли выбранный якорь и достаточно ли известных фактов, чтобы опубликовать образ.

Контракт не распознаёт вещи, не делает выводов о человеке или его внешности, не реализует хранение, авторизацию, платежи, VK ID, Supabase и поиск товаров. Он не смешивает demo и personal данные. Числовые величины допустимы только как входные шкалы признаков и внутренние технические значения; публичный результат не содержит score, процентов совместимости или заявления «лучший образ».

## 2. Термины

- **вещь** (`CompositionItem`) — подтверждённая карточка гардероба, приведённая к канонической категории;
- **слот** (`Slot`) — функциональное место вещи в образе;
- **путь базы** (`basePath`) — один из двух взаимоисключающих способов закрыть основу образа;
- **слой** (`Layer`) — позиция вещи в порядке надевания и теплозащиты, не визуальный z-index;
- **якорь** (`anchor`) — явно выбранная пользователем вещь, которая обязана войти в результат;
- **доступность** (`availability`) — возможность использовать конкретную личную вещь в данном запросе;
- **ограничение** (`Constraint`) — проверяемое условие с известным источником и политикой при `unknown`;
- **полнота** (`complete`) — структурная полнота слотов, а не эстетическая оценка.

## 3. Агрегат `OutfitComposition`

| Поле | Тип | Смысл |
|---|---|---|
| `compositionId` | opaque local ID | идентификатор кандидата; не содержит PII |
| `schemaVersion` | string | версия закрытого контракта |
| `mode` | `personal` | в этом контракте разрешён только личный гардероб |
| `ownerScope` | opaque scope | единая область владельца для всех вещей; наружу не публикуется |
| `requestContext` | `CompositionContext` | нормализованные occasion/activity/weather и требования |
| `basePath` | `separates \| one_piece` | выбранная структура основы |
| `slots` | `SlotAssignment[]` | канонический состав без дубликатов |
| `anchor` | `AnchorRequirement \| null` | состояние явно выбранного якоря |
| `facts` | stable code[] | проверяемые публичные основания без свободного provider-текста |
| `unknowns` | stable code[] | признаки, которые нельзя честно оценить |
| `status` | `ready \| hold` | допустимость публикации |
| `reasonCodes` | stable code[] | причины `hold` или оговорки результата |
| `generatorVersion` | string | версия правил воспроизводимости |

Инварианты агрегата:

1. Все `itemId` уникальны, принадлежат одному personal owner scope и были переданы в текущем запросе.
2. В составе ровно один путь базы: `top + bottom` либо `dress/one_piece`; смешение путей не используется для закрытия обязательной базы.
3. `shoes` обязательны для публикуемого полного образа.
4. Обязательный по контексту `outerwear` должен присутствовать; аксессуар не может компенсировать отсутствующий обязательный слот.
5. Валидный якорь присутствует ровно один раз и не заменяется молча.
6. `unknown` не считается совпадением и не создаёт положительный факт.
7. `ready` означает только выполнение структурных и hard constraints. Это не публичная оценка вкуса, человека или качества вещей.

## 4. Канонические категории и слоты

Таксономия совместима с текущими `GarmentStyleFeatures`: `top`, `bottom`, `dress`, `one_piece`, `outerwear`, `shoes`, `accessory`, `unknown`.

| Слот | Допустимая категория | Кардинальность | Обязательность |
|---|---|---:|---|
| `base.top` | `top` | 1 | обязательно только для `separates` |
| `base.bottom` | `bottom` | 1 | обязательно только для `separates` |
| `base.one_piece` | `dress`, `one_piece` | 1 | обязательно только для `one_piece` |
| `footwear` | `shoes` | 1 | всегда обязательно для complete outfit |
| `outerwear` | `outerwear` | 0..1 | обязательно, если это требует контекст |
| `accessory` | `accessory` | 0..N | опционально; лимит задаёт versioned policy |

Категория `unknown` не назначается ни в один слот. Она остаётся в diagnostic input и приводит к `item_category_unknown`, если такую вещь требуют как якорь; иначе вещь исключается из candidate pool с фиксируемой причиной.

Подкатегория не меняет канонический слот сама по себе. Например, жакет считается `outerwear` только если подтверждённая каноническая категория — `outerwear`; свободное название не должно переопределять подтверждённую категорию на production boundary.

## 5. Обязательные и опциональные категории

### 5.1 Структурный минимум

Публикуемый образ обязан соответствовать одной формуле:

```text
separates = exactly_one(top) + exactly_one(bottom) + exactly_one(shoes)
one_piece = exactly_one(dress | one_piece) + exactly_one(shoes)
```

`outerwear` и `accessory` не входят в структурный минимум. Однако `outerwear` становится обязательным hard slot, когда нормализованный weather/activity/dress-code context явно требует защитного или верхнего слоя. Если контекст не оценён, движок не имеет права автоматически утверждать, что верхняя одежда не нужна.

### 5.2 Опциональные элементы

- аксессуар можно добавить только после закрытия всех обязательных слотов;
- опциональный слой не исправляет конфликт формальности, сезона или доступности базовой вещи;
- отсутствие аксессуара никогда не является причиной `hold`;
- несколько аксессуаров допустимы лишь при versioned cardinality policy и не должны создавать дубликаты одной вещи.

## 6. Модель слоёв

Слой задаётся отдельно от категории, потому что `top` может быть как нательным, так и средним слоем. Минимальный allowlist:

| `layerRole` | Порядок | Назначение | Типичная применимость |
|---|---:|---|---|
| `base` | 10 | основа/нательный слой | `top`, `bottom`, `dress`, `one_piece` |
| `mid` | 20 | дополнительный утепляющий или композиционный слой | подтверждённый `top` |
| `outer` | 30 | внешний защитный слой | `outerwear` |
| `footwear` | 40 | обувь | `shoes` |
| `accent` | 50 | необязательное дополнение | `accessory` |

Правила:

- `layerRole` берётся из подтверждённого атрибута или явного versioned mapping подкатегорий; при отсутствии данных — `unknown`, а не догадка по названию;
- порядок слоёв должен быть строгим и детерминированным; одинаковый порядок разрешается только независимым аксессуарам и стабилизируется по `itemId`;
- температурная достаточность оценивается по известным `warmth` и требованиям контекста, а не по количеству слоёв;
- слой не может одновременно закрывать два обязательных базовых слота;
- конфликт физической носимости слоёв является hard constraint только при подтверждённом правиле; иначе возвращается `layering_not_evaluated`.

## 7. Якорь

`AnchorRequirement` содержит `itemId`, `required: true` и, опционально, ожидаемый `slot`. Якорь — пользовательское намерение, а не boost ранжирования.

До генерации проверяется:

1. ID существует в переданном personal wardrobe scope;
2. owner scope совпадает с запросом;
3. вещь имеет разрешённое состояние доступности;
4. категория известна и может занять слот;
5. вещь не нарушает hard constraints;
6. ожидаемый слот, если указан, совместим с категорией.

Невыполнение любого условия даёт `hold`; движок не удаляет, не заменяет и не ослабляет якорь. Базовый якорь определяет `basePath`: `top/bottom` требует `separates`, `dress/one_piece` требует `one_piece`. Якорь `shoes`, `outerwear` или `accessory` не выбирает путь базы. Несколько якорей остаются вне v0.1 и должны быть отклонены как `multiple_anchors_unsupported`, а не частично применены.

## 8. Доступность вещи

Доступность вычисляется до композиции как закрытое состояние:

| Состояние | Можно использовать | Причина |
|---|---:|---|
| `available` | да | personal item подтверждён, `ready`, не архивирован и не исключён запросом |
| `unavailable` | нет | явно недоступна: стирка, ремонт, занята или user-excluded |
| `not_ready` | нет | draft/uploading/processing/needs_confirmation |
| `archived` | нет | исключена из активного гардероба |
| `deleted` | нет | не существует для генерации |
| `unknown` | нет | достоверное состояние не получено |

Источник availability должен быть локальным подтверждённым состоянием или явным действием пользователя. Отсутствие поля не превращается в `available`. Для legacy-карточек временный adapter может принимать `status=ready` только за отдельным versioned migration gate; это не норма нового контракта.

Если недоступная вещь — якорь, результат `hold` с точной причиной. Если это не якорь, вещь исключается до генерации, а агрегированные коды могут объяснить нехватку слота без раскрытия внутренних ID.

## 9. Сезон и погодный контекст

Поддерживается текущий allowlist сезона: `spring`, `summer`, `autumn`, `winter`, `all_season`. Сезон — грубый подтверждённый атрибут вещи, а погода — контекст конкретного запроса; погода имеет приоритет для hard safety/comfort constraints.

- `all_season` означает подтверждённую применимость во все сезоны, а не замену отсутствующего знания;
- отсутствующий или ненадёжный сезон должен адаптироваться в отдельное unknown-state, даже если legacy schema подставляет `all_season`;
- известное несовпадение сезона с запросом — hard reject только при утверждённой policy; иначе это объяснимый tradeoff;
- явные требования `outerwearRequired`, waterproof footwear, температурный диапазон и осадки проверяются как hard constraints;
- при пропущенной, stale или недоступной погоде результат содержит `weather_not_evaluated`; `ready` допустим только если запрос не объявляет weather evaluation обязательной;
- точный город, GPS и свободный provider payload в композицию не входят.

## 10. Формальность

Используется существующая подтверждённая шкала вещи `1..5`, где `1` — casual, `5` — formal. Контекст задаёт не «идеальную точку», а допустимый диапазон `formalityRange: { min, max }`.

Правила оценки:

- каждая обязательная базовая вещь и обувь должны попадать в hard range, если range явно задан;
- для outerwear действует тот же range, когда слой обязателен или визуально является частью события;
- аксессуар вне range может быть исключён без разрушения композиции;
- неизвестная формальность обязательной вещи даёт `formality_not_evaluated` и запрещает `ready`, если формальность объявлена hard constraint;
- допустимый небольшой разброс вещей внутри range не является конфликтом;
- модель не переводит формальность в публичный процент и не утверждает социальную приемлемость вне заданного пользователем контекста.

## 11. Ограничения и порядок применения

`Constraint` имеет `code`, `source`, `severity: hard | preference`, `target` и нормализованное значение. Разрешённые источники: `user_confirmed`, `request_context`, `wardrobe_confirmed`, `versioned_policy`. AI/provider inference без подтверждения не может создавать hard constraint.

Порядок обработки обязателен:

1. schema/version validation;
2. personal scope, owner и demo/personal separation;
3. availability и готовность вещей;
4. anchor validation;
5. structural slots и cardinality;
6. hard weather/activity/safety constraints;
7. hard season/formality/dress-code constraints;
8. layering feasibility;
9. preference rules: color, silhouette, recent-use и diversity;
10. стабильный tie-break по канонической signature.

Hard constraint нельзя компенсировать суммой preferences. Конфликт двух hard constraints даёт `hold` с обоими кодами. Свободные пользовательские формулировки сначала должны пройти утверждённый mapping; неизвестное ограничение возвращает `unsupported_constraint`, а не игнорируется.

## 12. Unknown-safe матрица результата

| Ситуация | Результат |
|---|---|
| неизвестна категория обязательной/якорной вещи | `hold` |
| неизвестна категория необязательной вещи | исключить вещь, зафиксировать diagnostic fact |
| неизвестен признак, нужный hard constraint | `hold` / `*_not_evaluated` |
| неизвестен признак только preference | кандидат допустим без positive fact; добавить `*_data_insufficient` |
| погода пропущена и не обязательна | допустим `ready` + `weather_not_evaluated` |
| сезон отсутствует, но legacy adapter дал `all_season` | не считать доказанным совпадением |
| availability неизвестна | вещь не использовать |

## 13. Статусы и стабильные reason codes

Минимальный allowlist:

- scope: `scope_mismatch`, `demo_personal_mix_forbidden`, `cross_owner_item`;
- input: `invalid_request`, `unsupported_schema_version`, `unsupported_constraint`;
- availability: `item_not_ready`, `item_unavailable`, `item_archived`, `item_category_unknown`;
- anchor: `anchor_not_found`, `anchor_not_ready`, `anchor_unavailable`, `anchor_slot_mismatch`, `anchor_constraint_conflict`, `multiple_anchors_unsupported`;
- structure: `missing_top`, `missing_bottom`, `missing_outfit_base`, `missing_shoes`, `missing_required_outerwear`, `slot_cardinality_conflict`;
- context: `weather_not_evaluated`, `season_data_insufficient`, `formality_not_evaluated`, `layering_not_evaluated`;
- hard conflict: `weather_constraint_conflict`, `season_constraint_conflict`, `formality_constraint_conflict`, `layering_constraint_conflict`.

UI-текст хранится вне доменного результата. Коды не содержат item IDs, PII, свободные заметки или provider messages.

## 14. Детерминизм, signature и снимок

Каноническая signature строится из `schemaVersion`, `basePath` и отсортированных пар `slot:itemId`; owner ID, изображения и PII в неё не входят. Перестановка входного массива не меняет состав или порядок результата. При равных допустимых кандидатах используется стабильный tie-break, а не случайность.

Сохранение образа создаёт immutable snapshot согласно существующей модели `OutfitSnapshot`: состав и подтверждённые признаки фиксируются на момент сохранения. Эта спецификация определяет payload composition, но не меняет persistence contract и не реализует сохранение.

## 15. Privacy и demo/personal separation

- Вход v0.1 — только личный гардероб; demo item приводит к `demo_personal_mix_forbidden` до генерации.
- Demo-образ может существовать только в отдельном demo contract/session и не конвертируется в personal snapshot заменой отдельных ID.
- В trace допустимы версии правил, counts, reason codes, unknown flags и canonical request hash без owner/item IDs.
- Запрещены фото/их hash и имена файлов, email, точная геолокация, свободный occasion-текст, полный гардероб и чувствительные выводы.
- Локальные данные остаются локальными; этот контракт не разрешает сетевую отправку или облачное сохранение.

## 16. Acceptance criteria

Доменный контракт считается реализованным, когда:

1. `separates` без ровно одного top, bottom и shoes не получает `ready`.
2. `one_piece` без ровно одного dress/one_piece и shoes не получает `ready`.
3. Обязательный outerwear и waterproof shoes проверяются до preferences.
4. Одна вещь не закрывает два обязательных слота; item IDs не повторяются.
5. Якорь всегда присутствует в `ready`; все состояния missing/not-ready/unavailable/conflict различаются кодами.
6. Cross-owner и demo/personal mix завершаются до candidate generation и не создают persistence payload.
7. Unknown availability никогда не допускает вещь; unknown hard fact никогда не становится positive match.
8. `all_season` не используется как fallback для неизвестного сезона в новом adapter contract.
9. Формальность проверяется диапазоном; public DTO не содержит numeric score/percent/ranking trace.
10. Layer order воспроизводим, а непроверяемая совместимость маркируется `layering_not_evaluated`.
11. Перестановка input не меняет canonical result; 100 повторов одинакового запроса дают одинаковую signature.
12. Snapshot сохраняет ровно опубликованный состав и не смешивает scope.
13. Negative privacy tests не находят PII, location, image metadata, свободный текст и item IDs в telemetry/trace.
14. Ни один тест или adapter этой задачи не требует изменений auth/Supabase/VK ID/payments/external retail.

## 17. Риски и зависимости

| Риск | Уровень | Gate |
|---|---:|---|
| Legacy adapter подставляет `ready`, `all_season`, formality `3` при отсутствии знания | высокий | отдельные provenance/unknown flags до production-интеграции |
| Категория и реальная роль слоя расходятся | высокий | подтвердить `layerRole` и versioned subcategory mapping |
| Свободный occasion/constraint молча меняет hard rules | высокий | закрытая taxonomy и mapping с `unsupported_constraint` |
| `outerwear` трактуется то как верхняя одежда, то как любой верхний слой | высокий | разделить category и layerRole в schema/tests |
| Preference score просачивается в UI | высокий | закрытый public DTO и negative schema test на score/percent |
| Demo или другой owner попадает в personal snapshot | критический | pre-generation scope gate и persistence negative tests |
| Weather skip выглядит как подтверждённая пригодность | высокий | явный `weather_not_evaluated` и product policy для ready/hold |
| Несколько якорей частично применяются | средний | fail-fast в v0.1; отдельная версия для multi-anchor |

Зависимости до снятия HOLD:

1. Schema: закрытые JSON Schema для `CompositionItem`, `CompositionContext`, `OutfitComposition` и reason allowlist.
2. Taxonomy: утверждённые occasion/activity/dress-code tokens и subcategory → layerRole mapping.
3. Data adapter: provenance для `status`, `season`, `formality`, `layerRole`; устранение default-positive legacy fallbacks.
4. Weather: единый нормализованный adapter и правила stale/skip/required evaluation.
5. Engine: hard-constraint evidence и детерминированные golden tests для обоих base paths и якорей.
6. Persistence/privacy: personal scope gate, immutable snapshot mapping, local trace retention и negative telemetry tests.
7. UX/content: отображение `ready/hold`, unknown/tradeoff и missing slots без score и обвиняющей лексики.

## 18. Итоговый gate

**PASS:** спецификация фиксирует слоты, обязательные/опциональные категории, слои, якорь, доступность, сезон, формальность, hard/preference constraints, unknown-safe поведение и personal-only privacy boundary.

**HOLD:** production/UI/persistence интеграция до закрытия schema, taxonomy, provenance, weather, golden, privacy и UX зависимостей. Auth/Supabase/VK ID/payments/external retail остаются вне задачи.
