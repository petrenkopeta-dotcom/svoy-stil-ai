# CAPSULE-11 — demo → одна своя вещь → capsule preview → регистрация позже

Дата: 2026-08-21. Scope: продуктовый/UX-контракт и state machine; production-код, auth/Supabase и тарифная логика не изменялись. VK ID — только исследовательский backlog.

## Решение

**PASS — как целевой UX-контракт и прототипируемый сценарий без auth-реализации.** Пользователь должен получить понятную ценность до обязательного входа: демо-образ → добавить одну свою вещь → увидеть ограниченный capsule preview, где своя вещь является якорем, а остальные позиции явно маркированы как демо. На preview нет блокирующего auth-модала.

**HOLD — для production rollout.** Текущий production-контракт вызывает `requireAuth` до photo/manual intake первой личной вещи, `catalogForAuth` отдаёт гостю demo-каталог, а demo/personal state запрещает смешанный personal outfit. Перенос обязательной регистрации на более поздний шаг меняет auth, persistence и privacy boundaries; CAPSULE-11 не разрешает это изменение и не доказывает безопасное анонимное хранение/обработку фото. До отдельного решения владельцев продукта, privacy и auth нельзя ослаблять существующий gate или называть capsule preview личным сохранённым образом.

Рекомендуемая точка обязательного входа: **первая попытка сохранить/продолжить результат**, а не открытие preview. Это может быть «Сохранить капсулу», «Добавить вторую вещь», «Открыть капсулу после закрытия/на другом устройстве» или действие, требующее server persistence. Paywall не совмещать с регистрацией: тариф показывать после доказанной ценности и только при понятном entitlement/лимите.

## Что означает capsule preview

Capsule preview — временная, несохраняемая рекомендация из:

- ровно одной подтверждённой пользовательской вещи (`source=personal_ephemeral`, anchor);
- только разрешённых demo-вещей (`source=demo`) для заполнения недостающих категорий;
- явной маркировки происхождения каждой позиции;
- объяснения только по подтверждённым свойствам вещи и ответам пользователя;
- нулевого обещания, что preview сохранён, синхронизирован или доступен после закрытия.

Это не `personal_result` текущего `honestReadiness`: тот контракт требует, чтобы каждая вещь результата принадлежала personal wardrobe. Это также не текущий `demoPersonalFlow.confirmPersonalTransition`, который после перехода оставляет только одну personal-вещь и обнуляет outfit. Нужен отдельный тип результата, например `capsule_preview`, а не переиспользование `demo` или `personal` с подменой семантики.

## Целевой путь без тупиков

| Шаг | Экран/состояние | Primary CTA | Secondary/escape | Что нельзя делать |
|---|---|---|---|---|
| 1 | Первый demo-look после трёх ответов | **«Добавить свою вещь»** | «Посмотреть демо-гардероб», «Изменить ответы» | Не предлагать save demo; не открывать auth автоматически |
| 2 | Выбор способа | **«Выбрать фото вещи»** | «Описать вручную», «Вернуться к демо» | Не запрашивать аккаунт, геолокацию или маркетинговое согласие |
| 3 | Локальная privacy-проверка фото | **«Продолжить с этим фото»** | «Выбрать другое фото», «Описать вручную», «Вернуться к демо» | До явного разрешения не отправлять фото/метаданные в сеть |
| 4 | Review своей вещи | **«Показать мини-капсулу»** | «Исправить», «Выбрать другую вещь» | Не выдавать неизвестные признаки за распознанные; подтверждение обязательно |
| 5 | Capsule preview | **«Сохранить капсулу»** | «Добавить другую вещь», «Продолжить с демо» | Не называть demo-позиции своими; не писать «сохранено» |
| 6 | Отложенный auth gate | **«Продолжить по email»** | **«Не сейчас — оставить preview»** / закрыть | Закрытие не должно удалять видимый preview или запускать вход повторно в этой же сессии |
| 7 | После успешного входа (вне CAPSULE-11) | «Сохранить вещь и капсулу» | «Назад к preview» | Не мигрировать фото без отдельного согласия; не обещать cloud save без ack |

Если provider недоступен или offline, пользователь остаётся на capsule preview. Copy: «Вход сейчас недоступен. Preview останется открытым в этой вкладке, но после закрытия может исчезнуть». CTA: «Повторить»; escape: «Продолжить без сохранения».

## CTA и copy

### Demo-result

- Eyebrow: «Пример на демо-вещах».
- Title: «Посмотри, как стилист собирает сочетание».
- Body: «Добавь одну свою вещь — покажем мини-капсулу вокруг неё. Остальные вещи пока будут примерами».
- Primary: **«Добавить свою вещь»**.
- Secondary: «Посмотреть демо-гардероб».
- Tertiary/link: «Изменить ответы».

Текущие `«Добавить первую вещь»` и `«Сфотографировать в магазине»` конкурируют за один intent. Для этого funnel их следует заменить одним primary CTA, а выбор фото/ручного ввода перенести на следующий экран. Магазинный сценарий можно оставить отдельной ссылкой вне основного conversion path.

### Photo/manual intake

- Title: «Добавь одну вещь для мини-капсулы».
- Privacy: «Сначала проверим фото на этом устройстве. До твоего разрешения оно никуда не отправляется».
- Manual alternative: «Без фото: укажи тип и цвет вручную».
- Person/unknown failure: «Не удалось безопасно подтвердить, что в кадре только вещь. Выбери другое фото или опиши вещь вручную».

Сохраняется текущая fail-closed политика: одна вещь целиком, без человека; JPEG/PNG/WebP; неизвестный person-state не принимается; ручной путь всегда доступен.

### Capsule preview

- Eyebrow: «Preview мини-капсулы».
- Title: «Вот с чем носить твою вещь».
- Body: «Твоя вещь — основа. Позиции с меткой “Демо” — примеры, а не вещи из твоего гардероба».
- Inline notice: «Preview пока не сохранён и может исчезнуть после закрытия вкладки».
- Primary: **«Сохранить капсулу»**.
- Secondary: «Добавить другую вещь».
- Escape: «Продолжить с демо».

### Отложенный auth gate

- Title: «Сохрани вещь и мини-капсулу».
- Body: «Аккаунт нужен, чтобы вернуться к ним позже и учитывать лимиты тарифа. Без входа preview останется только в этой вкладке».
- Primary: **«Продолжить по email»**.
- Escape: **«Не сейчас — оставить preview»**.
- Footer: ссылки на условия и privacy; согласие на маркетинг отдельно и unchecked.

Не использовать: «Зарегистрируйся, чтобы увидеть результат», «Остался один шаг», countdown, fake scarcity, повторный modal сразу после закрытия.

### Тарифы 499/999 ₽

На capsule preview цена не должна перекрывать результат. Допустима неблокирующая ссылка «Что входит в тарифы». После auth/save-intent показывать только подтверждённые сервером entitlements:

- «Тариф 499 ₽» / «Тариф 999 ₽» — только после утверждения состава обоих тарифов;
- текущий лимит, что считается вещью, дата/правило обновления лимита;
- стартовые 50 и последующие 10–15 вещей/мес. нельзя превращать в точный UI-контракт, пока владелец не утвердил различия и reset semantics;
- никаких «лучший выбор» или «успейте», если нет доказанного основания.

До фиксации entitlement matrix pricing UI — **HOLD**.

## State machine

```text
DEMO_RESULT
  ADD_OWN_ITEM -> ITEM_ENTRY
  OPEN_DEMO -> DEMO_WARDROBE
  EDIT_ANSWERS -> ONBOARDING

ITEM_ENTRY
  PICK_PHOTO -> LOCAL_PRIVACY_CHECK
  MANUAL -> ITEM_REVIEW
  CANCEL -> DEMO_RESULT

LOCAL_PRIVACY_CHECK
  SAFE_CONFIRMED -> ITEM_REVIEW
  UNCERTAIN_OR_PERSON -> PHOTO_RETRY
  CANCEL -> ITEM_ENTRY

PHOTO_RETRY
  RETAKE -> LOCAL_PRIVACY_CHECK
  MANUAL -> ITEM_REVIEW
  BACK_TO_DEMO -> DEMO_RESULT

ITEM_REVIEW
  CONFIRM -> CAPSULE_BUILDING
  EDIT -> ITEM_REVIEW
  REPLACE -> ITEM_ENTRY

CAPSULE_BUILDING
  SUCCESS -> CAPSULE_PREVIEW
  NO_CANDIDATE -> CAPSULE_PARTIAL
  ERROR -> CAPSULE_ERROR

CAPSULE_PARTIAL
  SHOW_SUPPORTED -> CAPSULE_PREVIEW
  EDIT_ITEM -> ITEM_REVIEW
  DEMO -> DEMO_WARDROBE

CAPSULE_ERROR
  RETRY -> CAPSULE_BUILDING
  EDIT_ITEM -> ITEM_REVIEW
  DEMO -> DEMO_WARDROBE

CAPSULE_PREVIEW
  SAVE | ADD_SECOND_ITEM | CROSS_SESSION -> AUTH_REQUIRED
  REPLACE_ITEM -> ITEM_ENTRY
  CONTINUE_DEMO -> DEMO_WARDROBE

AUTH_REQUIRED
  AUTH_SUCCESS -> PERSISTENCE_CONSENT
  CLOSE | NOT_NOW -> CAPSULE_PREVIEW (auth_prompt_snoozed=true)
  OFFLINE | PROVIDER_UNAVAILABLE -> AUTH_RECOVERABLE_ERROR

AUTH_RECOVERABLE_ERROR
  RETRY -> AUTH_REQUIRED
  CONTINUE_WITHOUT_SAVE -> CAPSULE_PREVIEW

PERSISTENCE_CONSENT
  CONSENT -> AUTHENTICATED_SAVE_PENDING
  DECLINE -> CAPSULE_PREVIEW

AUTHENTICATED_SAVE_PENDING
  SERVER_ACK -> PERSONAL_SAVED
  FAILURE -> CAPSULE_PREVIEW_WITH_SAVE_ERROR
```

### Инварианты

1. `DEMO_RESULT` и demo preferences не пишутся как personal state.
2. До auth личная вещь и фото живут только в памяти текущей вкладки; reload/close может их потерять, и UI сообщает это заранее.
3. `capsule_preview` может смешивать один ephemeral anchor и demo fillers только потому, что каждый source виден; он никогда не проходит guard личного сохранения.
4. Ни `catalogForAuth`, ни `personal_result`, ни saved history не получают ephemeral/demo mix.
5. Auth prompt открывается только после явного persistence/cross-session intent и закрывается без потери текущего preview.
6. После dismiss не показывать modal снова, пока пользователь не повторит gated intent; неблокирующая подсказка допустима.
7. Ошибка сборки не подменяется demo-результатом. Показывается partial/no-candidate/error с выходом.
8. Сохранение считается успешным только после подтверждённого persistence result; offline/local-memory не называется cloud save.
9. Фото, filename, hash, EXIF, detector boxes/confidence и free text не попадают в telemetry.
10. Оплата не является условием увидеть первый capsule preview.

## Устранение тупиков и навязчивых блоков

- Объединить два конкурирующих CTA первого результата в один intent «Добавить свою вещь».
- На каждом photo error дать ручной путь и возврат к демо.
- При недостатке категорий не требовать от гостя добавить 3–4 вещи: дополнить только demo fillers и честно пометить preview.
- Не отключать primary без объяснения; рядом показывать конкретно, чего не хватает или почему фото отклонено.
- Auth dialog должен иметь close/Escape/focus return и «Не сейчас» как реальный выход.
- После auth error сохранять ephemeral item/preview в памяти, не сбрасывать к landing/onboarding.
- Не показывать auth на открытии wardrobe/demo-навигации и не перенаправлять пользователя по кругу.
- Если пользователь уже отклонил хранение onboarding preferences, это не блокирует capsule preview; ответы остаются session-only.

## Privacy и demo/personal separation

Наиболее безопасный вариант без auth — полностью локальный/manual preview без сетевой обработки. Если реальная сборка требует server image analysis или anonymous upload, это отдельный **HOLD**: нужны purpose consent, TTL, deletion receipt, abuse controls, anonymous subject lifecycle и legal review. Текущий `upload_allowed` photo gate сам по себе не даёт такого разрешения.

При будущем входе:

- показать migration preview: какая вещь, какие атрибуты и есть ли фото;
- перенос фото — отдельный явный consent;
- copy-first/idempotent migration, local/ephemeral source не удалять до server ack;
- logout, delete local data и delete account остаются разными действиями;
- demo items не мигрируются и не расходуют тарифный лимит.

## Риски

| Приоритет | Риск | Митигация / gate |
|---|---|---|
| P0 | Ослабление текущего auth gate даст неавторизованные personal writes или upload | Отдельный ephemeral domain; production rollout HOLD до threat/privacy review |
| P0 | Mixed demo/personal preview ошибочно попадёт в history как личный | Новый `capsule_preview` kind + save guard + source badges + contract tests |
| P1 | Фото потеряется после reload и пользователь воспримет это как баг | До выбора и на preview явно сообщать session-only; не писать ложное «сохранено» |
| P1 | Серверная обработка до auth создаст anonymous asset lifecycle | Local/manual-only MVP либо отдельный backend/privacy проект с TTL/delete/abuse controls |
| P1 | Auth dismiss превращается в modal loop | `auth_prompt_snoozed` до следующего явного gated intent |
| P1 | Пользователь считает demo fillers покупательской рекомендацией/своими вещами | Badge на каждой карточке, legend и отсутствие save без входа |
| P1 | 499/999 ₽ показаны без утверждённых различий | Entitlements server-owned; pricing HOLD до product decision |
| P2 | Недостаточно demo-кандидатов вокруг редкой категории | Partial state, объяснение и смена anchor; не подменять результат |
| P2 | Telemetry связывает фото/identity до consent | Allowlist coarse events, pseudonymous session id, без payload/PII |
| P2 | Новый funnel ломает returning/local-pilot paths | Раздельные state machine ветки и regression matrix |

## Зависимости

1. Product owner: утвердить определение capsule preview, точку обязательного входа и политику «одна своя + demo fillers».
2. Privacy/legal: подтвердить session-only local photo/manual flow; отдельно решить anonymous server processing, если потребуется.
3. Auth owner: определить resumable continuation после OTP и dismiss semantics, не меняя provider в рамках CAPSULE-11.
4. Recommendation owner: контракт anchor + demo fillers, no-candidate/partial states, source provenance.
5. Data owner: отдельный ephemeral store без durable writes; migration consent и server acknowledgement.
6. Pricing owner: точные различия 499/999 ₽, лимиты, что считается вещью, reset/increment semantics.
7. Design/a11y: source badges, modal escape/focus, mobile 320–430 px, 200% zoom и screen-reader copy.
8. Analytics/privacy: event dictionary и funnel без PII/фото/free text.

## Acceptance criteria

### Contract PASS

- После demo-look есть один главный CTA «Добавить свою вещь»; demo остаётся доступным без входа.
- Гость может пройти photo-local-check или manual path, подтвердить одну вещь и увидеть `capsule_preview` без auth-модала.
- В preview ровно одна пользовательская anchor-вещь; каждая demo-позиция имеет видимую метку «Демо» и machine-readable source.
- Preview содержит текст «не сохранён» и не появляется в personal wardrobe/history/export.
- Save/add-second/cross-session intent вызывает auth; cancel/Escape/«Не сейчас» возвращает тот же preview без потери state.
- После dismiss auth не появляется снова без нового gated intent.
- Person/unknown photo state fail closed; manual fallback доступен; сеть до разрешения не используется.
- No-candidate/error не заменяется скрытым demo success и имеет retry/edit/demo exits.
- Onboarding consent decline не блокирует путь; ответы и preview остаются session-only.
- Pricing не блокирует первый preview; 499/999 ₽ показываются только с утверждённой entitlement matrix.

### Production rollout HOLD до выполнения

- Есть утверждённый ADR, который согласует новый поздний auth boundary с `authGate`, `authScreenPolicy` и demo/personal contracts.
- Есть threat/privacy review анонимного этапа; если фото покидает устройство — утверждены consent, TTL, delete и abuse-control contracts.
- Unit/integration tests доказывают отсутствие durable guest writes и невозможность сохранить mixed preview как personal.
- Browser evidence: 320/360/390/412/430/1280, keyboard, Escape/focus return, 200% zoom, offline/provider unavailable/reload.
- Telemetry funnel проходит privacy allowlist и не содержит PII/image metadata/free text.
- Live auth/provider и persistence ack проверены отдельно; synthetic/local pilot не повышает статус.
- Утверждены тарифы 499/999 ₽ и server-owned entitlement response.

## Метрики эксперимента

Считать только coarse события: `demo_result_viewed`, `own_item_started`, `item_review_confirmed`, `capsule_preview_rendered`, `capsule_partial`, `auth_intent_started`, `auth_dismissed`, `auth_completed`, `capsule_save_acknowledged`. Не включать названия вещей, фото, свободный текст и email.

Основные показатели: `capsule_preview_rendered / demo_result_viewed`, median TTFV до preview, photo→manual fallback, no-candidate rate, `auth_completed / auth_intent_started`, dismiss→повторный save intent. Сравнивать с текущим baseline только после фиксации одинаковых eligibility/session rules.

## Следующие задачи

1. **CAPSULE-12 — decision ADR (P0):** утвердить late-auth boundary, ephemeral semantics и разрешённость one-personal + demo preview; владельцы Product/Auth/Privacy.
2. **CAPSULE-13 — prototype/copy test (P0):** кликабельный локальный прототип пяти состояний, 5–7 moderated tests на синтетических фото без людей; production-код не менять.
3. **CAPSULE-14 — domain contract (P0):** схема `CapsulePreviewV1`, provenance, guards, partial/error states; тесты отдельно от `personal_result`.
4. **CAPSULE-15 — ephemeral privacy design (P0):** memory/TTL/reload/consent/deletion contract; выбрать local-only или подготовить anonymous backend review.
5. **CAPSULE-16 — auth resume contract (P1):** pending intent, dismiss snooze, OTP success resume, offline/provider errors; без смены provider.
6. **CAPSULE-17 — tariff decision (P1):** матрица 499/999 ₽, initial 50, monthly 10–15, reset и quota consumption; закрепить в entitlements API.
7. **CAPSULE-18 — analytics/QA (P1):** privacy-safe funnel, mobile/a11y matrix, demo/personal leakage tests и release HOLD checklist.
8. **VK-ID-RESEARCH (P2, backlog only):** feasibility, legal/provider requirements, account linking/recovery и сравнение с email; не включать в CAPSULE implementation.

## Контрольный вывод

Сценарий улучшает conversion только если регистрация действительно следует за увиденной личной ценностью и остаётся обратимой. Без отдельного ephemeral-контракта простое перемещение auth-модала ниже по экрану создаст более опасную неоднозначность: продукт начнёт принимать личную вещь до подтверждённого владельца, а существующие guards и demo/personal separation перестанут соответствовать UI. Поэтому дизайн — PASS, production — HOLD.
