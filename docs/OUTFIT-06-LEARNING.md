# OUTFIT-06 — preference / learning loop

Статус: **PASS — продуктовый и доменный контракт; HOLD — production evidence и устранение интеграционных расхождений**  
Дата: 2026-08-21  
Scope: только personal wardrobe; local-first; без auth/Supabase/VK ID/payments/external retail.

## 1. Решение

Learning loop принимает только явные действия пользователя над personal-рекомендацией: `would_wear`, `like`, `dislike`, `replace_item` и `undo`. Он может изменить порядок следующей выдачи, но не hard constraints, не подтверждённые свойства вещей и не diversity guardrail. Один отзыв остаётся слабым, обратимым и затухающим сигналом; постоянное правило появляется только после отдельного явного подтверждения.

Нельзя учиться на показах, паузах, отсутствии клика, сохранении, удалении, фото, demo-образах или скрытой телеметрии. Нельзя выводить предпочтения о теле, здоровье, поле, возрасте, этничности, доходе и других чувствительных признаках. Внешние товары отсутствуют в этом контуре.

Пользователю показываются понятные причины изменения выдачи и источник запомненного сигнала, но никогда внутренний числовой score, вес или «процент совместимости».

## 2. Термины и канонические действия

| UI-действие | Каноническое событие | Смысл | Влияние |
|---|---|---|---|
| «Надела бы» | `would_wear` | положительный сигнал именно об этом образе | слабое повышение совпадающих allowlisted traits |
| «Нравится» | `like` | лёгкая положительная реакция, не обещание носить | слабее `would_wear`; только после отдельной реализации |
| «Не нравится / Не моё» | `dislike` → runtime `not_for_me` | отрицательный сигнал с обязательной причиной | снижает совпадающие traits; не создаёт вечный ban |
| «Замени вещь» | `replace_item` | локальное недовольство конкретной вещью в образе | снижает конкретный `replaceItemId`, после чего выполняется новая генерация |
| «Отменить» | `undo` | компенсация ранее записанного события | исключает цель из активной проекции и пересчитывает ranking |

`not_for_me` — текущее доменное имя отрицательного runtime-действия. `dislike` является продуктовым/UI-алиасом и до изменения схемы нормализуется в `not_for_me`; одновременно хранить оба события для одного клика нельзя. `like` отсутствует в текущем `STYLIST_FEEDBACK_ACTIONS`, поэтому его отдельное влияние — **HOLD**. До реализации UI должен использовать подтверждённое `would_wear`, а не молча приравнивать обычный like к готовности носить.

Сохранение образа, добавление в избранное и отметка «носила» — отдельные факты. Они не становятся preference-сигналами без отдельного согласованного контракта.

## 3. Eligibility gate

Запись разрешена, только если одновременно истинны все условия:

1. `resultKind === "personal"`, а все target items имеют personal provenance и принадлежат текущему local owner.
2. Рекомендация существует, имеет стабильный `recommendationId` и trace на фактически показанный состав.
3. Learning consent явно включён и сохранена его версия; consent команды также `true`.
4. Переданы текущий ETag и owner-scoped `idempotencyKey`.
5. Payload проходит allowlist; неизвестные поля отклоняются fail closed.

Для `demo` feedback может жить только в памяти текущей сессии как оценка демо. Он не записывается в personal profile, не появляется в «Что стилист запомнил», не влияет на personal ranking и очищается вместе с сессией. Смешанная или неизвестная provenance даёт `ineligible_source`, а не best-effort запись.

Отзыв до consent не сохраняется «на потом». UI может предложить включить learning, но повторная запись выполняется только после осознанного подтверждения пользователя.

## 4. Event contract v1

Каноническая команда поверх текущего `recordRecommendationFeedback`:

```json
{
  "ownerId": "local-owner-id",
  "action": "would_wear | not_for_me | replace_item",
  "reason": "colors | too_dressy | fit | shoes | too_hot | too_cold | not_my_style | null",
  "subject": {
    "itemIds": ["personal-item-id"],
    "categories": ["shoes"],
    "styleTags": ["minimal"],
    "colorFamilies": ["neutral"]
  },
  "replaceItemId": "personal-item-id | null",
  "source": { "referenceId": "recommendation-id" },
  "recommendationSequence": 17,
  "idempotencyKey": "opaque-owner-scoped-key"
}
```

Правила:

- Для `not_for_me` и `replace_item` причина обязательна; для `replace_item` обязателен `replaceItemId`, входящий в показанный personal outfit.
- Для `would_wear` причина равна `null`. Subject описывает только подтверждённые признаки показанной рекомендации.
- Разрешены только `itemIds`, `categories`, `styleTags`, `colorFamilies`, каждый список нормализуется, дедуплицируется и ограничивается по размеру.
- Free text, фото/URL, raw prompt, имя, контакты, precise location, body/demographic fields и произвольная metadata запрещены.
- Серверное время в этом scope не заявляется. Локальная запись содержит `occurredAt`, `ruleVersion`, owner и provenance; это local evidence, не production evidence.
- `permanent: true` не должен приходить из обычного feedback-клика. Он допустим только из отдельного UI явной настройки с подтверждением и возможностью сброса. До такого UI — **HOLD**.

Успешная запись append-only увеличивает `revision`, возвращает новый ETag и immutable event. Повтор того же idempotency key возвращает исходное событие без новой ревизии. Stale ETag не выполняет merge автоматически: UI перечитывает профиль, проверяет актуальность намерения и безопасно повторяет команду с тем же ключом.

Стабильные ошибки: `owner_mismatch`, `consent_required`, `stale_profile`, `idempotency_key_required`, `unsupported_action`, `unsupported_reason`, `replace_item_required`, `provenance_required`, `privacy_fields_rejected`; интеграционный слой добавляет `ineligible_source` и `target_not_in_recommendation`.

## 5. Learning projection и decay

Активная проекция строится детерминированно только из неотменённых событий текущего owner и текущей schema/rule version.

Текущий подтверждённый runtime использует:

- базовый вес `would_wear = +5`, `not_for_me = -14`, `replace_item = -10`;
- возраст `age = max(0, currentRecommendationSequence - event.recommendationSequence)`;
- decay для непостоянного события `base × 0.82^age`;
- отсутствие decay только для отдельно подтверждённого `permanent`;
- `preferenceVersion = profile.revision`.

Эти числа — внутренние versioned rule parameters, не пользовательская оценка. Они не выдаются через публичный candidate contract, UI, экспортные summary или телеметрию. Candidate может раскрыть только качественные `rankingReasons`, event provenance и `preferenceVersion`.

Инварианты ranking:

1. Hard constraints и unknown-safe abstention выполняются до learning.
2. Learning не делает unknown trait известным и не меняет user-confirmed metadata.
3. Diversity selector выполняется после learning adjustment.
4. Отрицательный сигнал сильнее положительного, но обычный клик не исключает вещь навсегда.
5. Если subject пуст, неизвестен или больше не соответствует гардеробу, adjustment не применяется; событие остаётся в аудите с понятным limitation.
6. Если правила/схема неизвестной версии, профиль не интерпретируется эвристически: ranking работает без спорного adjustment и показывает безопасное состояние «предпочтение временно не учтено».

## 6. Replace flow

`replace_item` является одной транзакцией намерения, а не серией скрытых dislikes:

1. Пользователь выбирает конкретную вещь в текущем personal outfit и при необходимости причину.
2. Eligibility gate подтверждает, что item входил в source recommendation.
3. Записывается одно событие с recommendation + item provenance.
4. Следующая генерация исключает или понижает эту вещь только в рамках данного adjustment, сохраняет остальные hard constraints и diversity.
5. UI показывает новый образ и качественную причину замены. Сам факт показа нового образа ничего не записывает.
6. Undo отменяет learning-событие; он не обязан визуально вернуть уже покинутый экран, но повторная генерация с тем же входом должна получить baseline ranking при отсутствии других изменений.

Если безопасной замены нет, система честно возвращает no-candidate/partial state. Она не подмешивает demo, не создаёт несуществующую personal-вещь и не ослабляет hard constraint без явного действия.

## 7. Undo, reset, consent withdrawal

Undo — append-only событие `{type:"undo", targetEventId, ownerId, occurredAt, ruleVersion}`. Исходное событие сохраняется для локального аудита, но исключается из projection. Повторный undo возвращает `already_undone`; idempotent replay исходной undo-команды не создаёт дубль. Чужая или отсутствующая цель отклоняется.

UI показывает Undo сразу после записи и в панели «Что стилист запомнил». После успеха он обновляет revision/ETag и доступное объяснение; при ошибке не заявляет, что предпочтение отменено.

- `reset learning` удаляет/обнуляет preference aggregate текущего owner, но не гардероб и не saved outfits.
- `delete local data` следует общему local repository boundary и удаляет learning вместе с остальными выбранными локальными агрегатами.
- `export` содержит versioned profile, consent receipt, events, undo links и provenance, но не внутренние ranking weights/score, фото или чужие/demo данные.
- Отзыв consent немедленно запрещает новые записи и применение learning к новым выдачам. Существующие события не должны продолжать влиять скрыто; UI предлагает отдельно удалить или экспортировать их. Автоматическое физическое удаление при выключении consent не предполагается без явного подтверждения.

Текущий local repository поддерживает export/reset/delete, но атомарность consent-withdrawal + projection-disable и полный UX receipt требуют интеграционного теста — **HOLD**.

## 8. Provenance и пользовательское объяснение

Минимальная provenance каждого события:

- `ownerId`;
- event id, action и timestamp;
- `source.kind = recommendation` и стабильный `referenceId`;
- recommendation sequence;
- allowlisted subject и `replaceItemId`, если применимо;
- `ruleVersion`, schema version и revision/ETag;
- для undo — `targetEventId`.

Source recommendation trace обязан доказывать `resultKind=personal`, item IDs, generator/rules version и фактически показанный состав. Raw chain-of-thought не хранится.

Панель «Что стилист запомнил» показывает только активные события: человеческое действие, причину, затронутую вещь/категорию, источник «из образа …», временный/постоянный статус и Undo. Допустимый copy: «Ты попросила заменить обувь в образе X; это временный сигнал». Недопустимый copy: «Тебе на 86% не подходит обувь», «мы определили твой тип фигуры» или неподтверждённое «стилист уже знает твой стиль».

## 9. Consent и privacy UX

Learning consent отделён от photo processing, telemetry и любых будущих cloud/retail purposes. Базовая генерация из личного гардероба доступна без learning. До первого persistent feedback UI кратко сообщает:

- какие явные действия будут сохранены локально;
- что они меняют только следующие рекомендации;
- что один сигнал слабый и затухает;
- где посмотреть, отменить, экспортировать, сбросить и удалить данные;
- что demo не обучает personal profile.

Запрещены предварительно отмеченный checkbox, consent через бездействие и принуждение к learning ради базового результата. Версия и время consent сохраняются отдельно от feedback. При неизвестном/повреждённом receipt система считает consent отсутствующим.

## 10. State machine

```text
eligible personal recommendation
  -> feedback draft
  -> consent check
     -> missing: session-only / cancel
     -> granted: validate provenance + allowlist + ETag
        -> rejected: unchanged profile + safe error
        -> recorded: revision N+1 + visible Undo
           -> next ranking uses active decayed projection
           -> undo recorded: revision N+2 + projection recomputed
```

Ни один error state не мутирует profile и не должен маскироваться оптимистичным success-copy.

## 11. Acceptance criteria

- [ ] `would_wear`, `not_for_me` и `replace_item` записываются только для personal recommendation при явном learning consent.
- [ ] Demo, unknown или mixed provenance не попадают в personal profile даже после reload.
- [ ] Dislike требует allowlisted reason; replacement требует item из source outfit.
- [ ] Duplicate idempotency key не увеличивает revision; stale ETag не мутирует профиль.
- [ ] Один сигнал изменяет следующую ранжировку предсказуемо, но не hard constraints и не diversity.
- [ ] Непостоянное влияние уменьшается по versioned decay; обычный feedback не создаёт permanent ban.
- [ ] Undo компенсирует событие, сохраняет audit provenance и при прочих равных восстанавливает baseline ranking.
- [ ] Отозванный consent запрещает запись и применение learning; corrupt/unknown consent fail closed.
- [ ] Unsupported subject fields, free text, sensitive traits и чужой owner отклоняются без побочного эффекта.
- [ ] UI и public candidate не раскрывают numeric score/weight и не заявляют production learning.
- [ ] Export/reset/delete owner-scoped; export не содержит demo, фото, credentials или внутренних score.
- [ ] Reload/offline/quota/corrupt-storage сценарии показывают честный durable/not-durable status.
- [ ] Accessibility: feedback, reason picker, consent и Undo доступны с клавиатуры, имеют видимый focus, status/error озвучиваются через live region, touch target не менее 44×44 px.

## 12. Evidence, gaps и зависимости

Подтверждено в текущем tree:

- `src/stylistLearning.js`: три runtime action, owner/consent/ETag/idempotency gates, allowlisted subject, provenance, decay `0.82^age`, append-only undo, `productionEvidence:false`.
- `src/stylistLearningLoop.test.js`: изменение следующего ranking, undo → baseline, diversity, owner isolation, decay и fail-closed privacy fields.
- `src/stylistCandidateEngine.js`: learning adjustment с качественными `rankingReasons` и без публичного numeric total.
- `src/storageRepositories.js` и `docs/local-storage-boundary.md`: versioned local owner-scoped learning repository, export/reset/delete и migration boundary.
- `src/stylistLearningAdapter.js` / `src/main.jsx`: UI proposal, consent modal, «Что стилист запомнил» и Undo существуют, но требуют отдельной сквозной регрессии по этому контракту.

Открытые риски / HOLD:

| Приоритет | Риск | Требуемая зависимость / gate |
|---|---|---|
| P0 | UI adapter сам выставляет consent после checkbox; отзыв consent и запрет применения требуют доказанного end-to-end поведения | единый consent repository + reload/corrupt-state tests |
| P0 | Проверка, что item действительно входил в source personal recommendation, не является явным gate внутри `recordRecommendationFeedback` | recommendation snapshot/provenance resolver |
| P1 | Отдельный `like` не реализован; опасно семантически смешать его с `would_wear` | product decision + schema v3/migration + golden tests |
| P1 | `permanent:true` технически принимается обычной командой | отдельная explicit-setting command/UI либо запрет на adapter boundary |
| P1 | Domain reason taxonomy расходится с ранней `FeedbackEvent` taxonomy в `docs/domain-model.md` | additive canonical mapping, без потери audit trail |
| P1 | Decay привязан к recommendation sequence, а не времени; пропуски/сброс sequence могут менять поведение | monotonic owner-scoped sequence contract и migration tests |
| P1 | UI adapter добавляет legacy `interaction/signals` поля поверх v2 | единая projection/schema и fixtures v1→v2→next |
| P1 | Durable/offline/quota/corrupt storage и atomic reset/consent flows не доказаны этим документом | repository integration + browser regression evidence |

Зависимости для release PASS: стабильный personal recommendation ID/snapshot; подтверждённые wardrobe metadata и origin; единый consent receipt; monotonic recommendation sequence; owner-scoped local repository; candidate-engine diversity/unknown-safe gates; export/reset/delete UI; accessibility и browser regression harness.

## 13. Release verdict

**PASS**: контракт OUTFIT-06 согласован с существующим local learning engine и задаёт безопасный personal-only loop для `would_wear`, dislike/`not_for_me`, replacement, undo, decay, provenance и consent.

**HOLD**: нельзя заявлять production learning, отдельный `like`, доказанную проверку source snapshot, permanent preferences или полностью закрытый consent-withdrawal lifecycle до устранения P0/P1 gaps и появления сквозного evidence. Auth, Supabase, VK ID, платежи и external retail намеренно не входят в решение.
