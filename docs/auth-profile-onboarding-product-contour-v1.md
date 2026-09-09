# AUTH / PROFILE / ONBOARDING V1 — продуктовый контур AI‑стилиста

**Статус:** proposal / decision-ready, production code не изменялся  
**Дата проверки источников:** 31 июля 2026  
**Контекст продукта:** тарифы 499/999 ₽; стартовый лимит 50 вещей, далее 10–15 вещей/мес.; быстрый сценарий «загрузить вещь и проверить сочетание»; Weather Comfort Outfit Core; аксессуары остаются частью outfit core без отдельного продуктового развития; Objective Extraction V3 — bounded beta.

## 1. Executive recommendation

Выбрать **try-first onboarding с отложенной регистрацией**: дать пользователю сразу выбрать/перетащить фото отдельной вещи, локально пройти существующий privacy gate, показать понятный preview будущей пользы и запросить аккаунт **перед первой серверной загрузкой/сохранением**, а не до знакомства с продуктом. После входа — один короткий обязательный шаг «город или без погоды» и переход к подтверждению первой вещи/первому комплекту. Все вкусы, посадка, размеры, чувствительность к холоду и цели собирать прогрессивно, только в момент, когда они меняют конкретную рекомендацию.

Минимум первой пользы:

1. Пользователь видит обещание результата и выбирает фото вещи без человека.
2. Файл проверяется локально; до разрешённого privacy decision сеть для изображения закрыта.
3. Система просит создать аккаунт, объясняя причину: «Чтобы безопасно сохранить вещь и продолжить с любого устройства».
4. Пользователь выбирает город вручную либо «Пока без погоды». Системная геолокация — отдельная, необязательная кнопка с just-in-time permission.
5. Пользователь подтверждает автоматически/вручную заполненную карточку.
6. Система показывает сочетание с demo-вещами или личным гардеробом, объясняет погодный комфорт, предлагает сохранить образ.

**Не делать сейчас:** длинный style quiz; обязательные ФИО, username, дата рождения, пол/гендер, рост, вес, параметры тела, фото человека; обязательная геолокация; импорт почты/чеков; социальный профиль; VTO; подбор размера покупки; отдельный onboarding аксессуаров; paywall до первой доказанной пользы.

## 2. Метод и ограничения конкурентного анализа

Использованы официальные сайты, FAQ, privacy/terms и публичные signup-страницы. Проверка выполнена 31.07.2026. Маркетинговые обещания ниже трактуются как описание заявленных функций, а не как доказательство качества или бизнес-эффекта. Где публичный источник не показывает реальный мобильный onboarding, отмечено «не подтверждено»; выводы о конкретных обязательных полях без первичного интерфейса не делаются.

## 3. Конкурентный обзор

| Продукт / рынок | Подтверждённый вход и момент аккаунта | Wardrobe / первая ценность | Профилирование, погода, тело | Privacy / paywall / retention | Вывод для нас |
|---|---|---|---|---|---|
| **Whering** (UK/global, digital wardrobe/social) | Публичный signup предлагает Google, Apple, Facebook или email; страна выбирается при входе. После signup показан один вопрос «Why are you here?» с вариантами цели. Guest-создание гардероба публично не подтверждено. | Добавление фото или импорт из базы/магазинов; затем outfits/lookbooks/planning. | Одновопросный intent profiling — хороший пример сокращения анкеты. Пол/тело/размеры как обязательные поля публично не подтверждены. | Профиль и отдельные части гардероба могут быть приватными; web доступен по тому же аккаунту. Бесплатность заявлена, точный paywall timing не подтверждён. | Спросить максимум одну цель, но после первой вещи; private-by-default. |
| **Acloset** (Южная Корея/global, AI wardrobe/VTO) | Privacy policy перечисляет email/password, nickname, birthdate, gender, picture, interests, sizing и др., но не доказывает, что все поля обязательны в onboarding. Recovery flow публично не найден. | Фото вещи → background removal/attributes; импорт из order pages/receipt email; рекомендации требуют достаточного числа разных категорий вещей. | Погода, чат со стилистом и VTO заявлены; body photo относится к VTO, а не к базовому гардеробу. | До 100 вещей бесплатно, затем подписка. Policy допускает широкий набор данных и social/public content; удаление аккаунта доступно в сервисе. | Не копировать широкий профиль. Разделить wardrobe core и VTO; paywall привязывать к исчерпанию лимита, не к onboarding. |
| **Stylebook** (US/global iOS, local-first closet) | Отдельная сервисная регистрация фактически не нужна для базовой локальной модели; sync идёт через iCloud. Recovery = device/iCloud restore, не password reset приложения. | Несколько способов добавить вещи: фото, album bulk import, web clipping, built-in catalog, AI text-to-image. Рекомендуется начать с часто носимых вещей. | Погода/антропометрия не являются центральным onboarding. | One-time paid app; данные и фото хранятся на устройстве/iCloud, разработчик заявляет отсутствие доступа к closet data. | Самый сильный privacy benchmark: минимум identity, быстрый bulk/alternative import, постепенное наполнение. |
| **Cladwell** (US/global, capsule wardrobe + weather) | Account существует; privacy policy описывает account information и удаление/экспорт по email. Точный экран регистрации и recovery публично не подтверждены. | Можно начать с шаблона/каталога без фото, потом добавить фото, screenshot или URL. Daily outfits учитывают weather/activity. | Для погоды продукт просит location; privacy policy допускает height/weight/size/date of birth, но не доказывает обязательность. | Управление closet заявлено бесплатным; рекомендации входят в paid offering. Location можно отключить на устройстве. | Дать ручной город и demo-каталог как альтернативы; не делать антропометрию обязательной. |
| **OpenWardrobe** (US/global, wardrobe + AI + community) | Account необходим для облачного wardrobe; точные sign-in/recovery методы публично не подтверждены. | Unlimited item upload, outfits, AI suggestions, planning; AI распознаёт attributes. | Есть color/body-shape/style features, но публичные обязательные поля onboarding не подтверждены. | Wardrobes private by default; granular sharing; in-app Delete Account удаляет account и associated data. Free core + paid Circle. | Private-by-default, явные scopes доступа и удаление в продукте — обязательные ориентиры. |
| **Indyx** (US, digital wardrobe + human stylists) | При регистрации policy подтверждает required email и name; location optional. Recovery публично не подтверждён. | Бесплатные unlimited wardrobe/outfits/tracking; style quiz рекомендуется для выбора стилиста, а не как gate базовой пользы. | Location optional. Style quiz связан с paid human styling. | Paid membership/человеческие стилисты появляются поверх бесплатного wardrobe; disconnect email account поддерживается; CSV export сейчас по обращению и может быть платным. | Quiz должен быть feature-triggered; name для нашего MVP не нужен; export лучше self-service и бесплатный. |
| **Pureple** (US/global, AI outfit planner/weather/VTO) | Policy: email, display name, auth credentials при создании аккаунта; точный guest/recovery flow не подтверждён. | Фото/web/database, auto-categorization, outfit suggestions и weather-appropriate looks. | City/country для weather; body photo только для «See on Yourself». | Перед передачей данных стороннему AI заявлено явное согласие; core wardrobe остаётся доступным при отказе. Wardrobe/images хранятся в Firebase; AI chat может отправлять provider’у сообщения, историю, wardrobe summary, city/country. | Consent должен быть purpose/provider scoped; отказ от AI не должен ломать ручной wardrobe. VTO — отдельный контур. |
| **Combyne** (Германия/global, outfit creation/community) | Terms упоминают registration service, но публичные точные варианты входа/recovery не подтверждены. | Outfit collages, own items, wardrobe/collections, social challenges. | Weather/body profiling не являются ядром публичного продукта. | Free plan даёт outfit creation/sharing/collections; premium — community extras/badge/wallpapers, то есть paywall не блокирует core creation. | Не ставить paywall перед созданием/сохранением первого образа; не смешивать social identity и wardrobe identity. |

### Проверенные официальные источники

- Whering: [signup methods and country](https://app.whering.co.uk/signup), [single intent question](https://app.whering.co.uk/signup/why-are-you-here), [how it works](https://whering.co.uk/how-it-works), [privacy controls](https://whering.co.uk/faq/how-do-i-make-my-whering-account-private).
- Acloset: [FAQ/features/free threshold](https://www.acloset.app/ko/support/), [Privacy Policy, effective 29.04.2026](https://www.acloset.app/privacy/), [Terms](https://www.acloset.app/terms/).
- Stylebook: [FAQ](https://stylebookapp.com/faq.html), [Privacy](https://www.stylebookapp.com/privacy.html).
- Cladwell: [app flow](https://cladwell.com/app), [pricing/weather](https://cladwell.com/pricing), [Privacy Policy](https://cladwell.com/privacy-policy).
- OpenWardrobe: [FAQ and private-by-default](https://www.openwardrobe.co/faq), [product and pricing overview](https://www.openwardrobe.co/), [delete account](https://www.openwardrobe.co/faq-delete-account).
- Indyx: [product/price overview](https://www.myindyx.com/home), [Privacy Policy](https://www.myindyx.com/privacy-policy), [FAQ including style quiz/export](https://www.myindyx.com/contact-us).
- Pureple: [features](https://pureple.com/about), [Privacy and AI consent](https://pureple.com/privacy.aspx).
- Combyne: [Terms/features](https://www.combyne.com/terms-of-usage), [plans](https://www.combyne.com/plans).

### Cross-product patterns

1. **Wardrobe labor is the main onboarding risk.** Products reduce it through templates, catalog search, web/album import, AI attributes and the explicit advice to start with favorites—not through longer quizzes.
2. **Weather can be valuable with low data cost.** City/coarse location is enough; precise background location is unnecessary for daily outfit comfort.
3. **Body data belongs to separate features.** VTO, fit and body-shape styling may justify specific inputs later; they do not justify collecting body photos or measurements for basic outfit compatibility.
4. **Core before paywall.** Several products expose wardrobe/outfit creation free and monetize scale, recommendations or services. For 499/999 ₽, first paid ask should follow a real recommendation or appear when a transparent quota is approached.
5. **Account minimization is viable.** Stylebook shows a local/iCloud model; cloud/social services use accounts, but required identity can remain email/passkey only.
6. **Private-by-default is differentiating.** OpenWardrobe and Whering provide privacy controls; our non-social MVP should have no public profile at all.
7. **Progressive profiling outperforms blanket forms conceptually.** One goal question (Whering), optional location (Indyx) and feature-specific AI/VTO consent (Pureple) are better patterns than collecting every conceivable attribute at signup.

## 4. Data taxonomy for our product

### A. Auth identity — minimal account/security data

| Attribute | Required | Purpose | Notes |
|---|---:|---|---|
| `user_id` | yes, system | stable opaque identity | UUID/ULID; never exposed as public username |
| `primary_email` | yes for email auth | login, recovery, service notices | normalized, verified before sensitive account changes |
| `email_verified_at` | conditional | trust/recovery | null until verified |
| `auth_methods[]` | yes | passwordless email and/or Apple/Google later | store provider subject, never access token in Profile |
| `account_status` | yes | active/locked/deletion_pending/deleted | security-owned |
| `created_at`, `last_login_at` | yes, system | security/operations | last_login not sent to recommender |
| `locale`, `time_zone` | derived/default | UX and scheduling | user-correctable; not identity proof |

Recommended launch method: **email magic link or email OTP**. If passwords are used, credential hashes remain inside the auth subsystem; Profile API never returns password fields. Social login can follow only if conversion data justifies it. Recovery for passwordless = re-authentication by verified email; changing email requires recent authentication and verification of new address.

### B. Required for first value

Strictly speaking, profile fields are not required to let a user upload a garment and receive a non-weather outfit. Required product state:

- accepted current Terms and acknowledged Privacy Notice;
- one permitted garment asset or a deliberate demo-mode choice;
- item category/essential objective attributes confirmed (manual path remains available);
- for weather-aware output: `weather_mode = manual_city | device_coarse | disabled`; if enabled, a resolvable coarse location.

No name, city, style archetype or demographic attribute is universally required.

### C. Progressive attributes

Ask only when the feature can demonstrate why:

| Attribute | Trigger | UX |
|---|---|---|
| `weather.city_id` | user asks for weather outfit / first recommendation | searchable city; explain it is used for forecast |
| `weather.cold_sensitivity` | after feedback «холодно/жарко» or weather setup | 5-point relative scale, optional; default neutral |
| `weather.rain_tolerance` | rainy forecast and repeated footwear/outerwear feedback | optional |
| `style.goals[]` | after first saved outfit or when opening profile | max 3; e.g. быстрее собираться, больше носить вещи, образы по погоде |
| `style.preferred_tags[]` / `avoided_tags[]` | user rejects recommendations | lightweight chips inferred only after explicit confirmation |
| `fit.preference` | when user flags volume/fit mismatch | fitted / balanced / relaxed; contextual, not body shape |
| `size_by_category` | only if future shopping/fit feature is launched | category + sizing system + value; never one universal size |
| `occasion_defaults[]` | repeated outfit requests | work/casual/event/travel/custom |
| `notification_preferences` | after demonstrated recurring value | separate service vs product reminders |

### D. Sensitive / optional, isolated

- `body_photo_asset_id`: **absent in V1**. Future VTO-only scope, separate consent, storage and deletion policy.
- body measurements, height, weight: **absent in V1**. Add only with validated fit feature and field-level justification.
- gender identity / sex: **absent in V1**. Product taxonomy and recommendation language should be gender-neutral.
- age/date of birth: no collection; use a launch eligibility statement/age gate only if legal review requires it, storing minimum attestation rather than DOB.
- accessibility needs: optional UI preference; keep separate from stylistic recommender unless user explicitly asks.
- precise GPS: not stored. If device permission is used, reduce to city/geohash-equivalent server input and discard raw coordinates.

### E. Derived system attributes

These are computed, explainable and user-correctable where they affect recommendations:

- `effective_warmth_bias` from explicit cold sensitivity + warm/cold feedback;
- `style_affinity_tags` from saved/rejected outfits, with provenance and confidence;
- `frequent_occasions`;
- `preferred_silhouette_tags`;
- `weather_city_id` from explicit city selection or coarse permission result;
- `onboarding_stage`, `activation_stage`;
- `wardrobe_coverage` by core categories;
- `recommendation_readiness`;
- `quota_used`, `quota_limit`, `quota_reset_at` from entitlement service;
- `profile_schema_version`, `consent_policy_versions`;
- item-level Objective V3 attributes remain clothing data, not person profile data.

Derived values must include `source`, `computed_at`, `model_or_rule_version`, `confidence` where meaningful, and allow reset. Never convert behavior into sensitive demographic guesses.

### F. Prohibited / not needed now

- full legal name, postal address, phone number, public username/avatar;
- contacts/social graph;
- exact birth date, gender/sex, race/ethnicity, religion, income;
- height, weight, body shape, measurements, face/body images;
- continuous or background GPS, home/work address;
- email inbox/order history import;
- biometric identifiers, face embeddings, identity matching;
- inferred health, pregnancy, disability or attractiveness;
- ad identifiers and cross-app tracking;
- free-text «tell us everything about yourself» profile;
- provider prompt/chat history inside the core profile;
- public wardrobe or sharing permissions.

## 5. Exact contract: `ProfileV1`

```json
{
  "schema_version": 1,
  "user_id": "usr_opaque",
  "locale": "ru-RU",
  "time_zone": "Europe/Astrakhan",
  "weather": {
    "mode": "manual_city",
    "city_id": "geo_provider_stable_id",
    "city_label": "Астрахань",
    "cold_sensitivity": 0,
    "rain_tolerance": null
  },
  "style": {
    "goals": ["weather_comfort"],
    "preferred_tags": [],
    "avoided_tags": [],
    "fit_preference": null,
    "occasion_defaults": []
  },
  "sizes": [],
  "notifications": {
    "product_reminders": false,
    "weather_outfit": false
  },
  "derived": {
    "effective_warmth_bias": 0,
    "style_affinity_tags": [],
    "frequent_occasions": [],
    "wardrobe_coverage": {
      "tops": 0,
      "bottoms": 0,
      "one_piece": 0,
      "outerwear": 0,
      "footwear": 0,
      "accessories": 0
    },
    "recommendation_readiness": "demo_assisted"
  },
  "created_at": "2026-07-31T00:00:00Z",
  "updated_at": "2026-07-31T00:00:00Z",
  "revision": 1
}
```

Contract rules:

- `weather.mode`: `manual_city | device_coarse | disabled`.
- `city_id/city_label` required only when mode is not disabled. Do not store raw latitude/longitude in Profile.
- `cold_sensitivity`: integer `-2..2`; `0` is neutral default, but UI must distinguish default/not-answered via field provenance or a nullable value until explicitly set. Preferred storage: nullable explicit field plus derived neutral fallback.
- `rain_tolerance`: nullable `-1..1`.
- `goals`: up to 3 allowlisted codes: `quick_match`, `weather_comfort`, `use_more_wardrobe`, `plan_ahead`, `refine_style`.
- tags use versioned taxonomy IDs, not arbitrary strings.
- `sizes[]`: `{category, sizing_system, value, fit_note?, updated_at}`; empty in V1.
- Auth email and credential/provider subjects are intentionally absent.
- Consent records are intentionally absent; Profile returns only a compact consent status link/summary if needed.
- Sensitive future extensions require a new subresource and privacy review, not silent fields in `ProfileV1`.

## 6. Exact contract: `OnboardingStateV1`

```json
{
  "schema_version": 1,
  "user_id": "usr_opaque",
  "flow_variant": "try_first_v1",
  "status": "in_progress",
  "current_step": "item_review",
  "completed_steps": [
    "value_intro",
    "local_file_selected",
    "auth_created",
    "legal_accepted",
    "weather_choice"
  ],
  "skipped_steps": [],
  "first_value": {
    "draft_id": "local_or_server_draft_ref",
    "first_item_id": null,
    "first_outfit_id": null,
    "first_value_at": null
  },
  "weather_choice": "manual_city",
  "style_goal_choice": null,
  "legal": {
    "terms_version": "terms-v1",
    "privacy_notice_version": "privacy-v1",
    "accepted_at": "2026-07-31T00:00:00Z"
  },
  "progress": {
    "required_completed": 3,
    "required_total": 4
  },
  "started_at": "2026-07-31T00:00:00Z",
  "updated_at": "2026-07-31T00:00:00Z",
  "completed_at": null,
  "revision": 4
}
```

State rules:

- `status`: `not_started | in_progress | activated | dismissed | blocked`.
- `current_step`: `value_intro | local_item_pick | auth | legal | weather_choice | item_review | first_outfit | done`.
- `completed_steps` are monotonic except when policy/version invalidates a consent-dependent step.
- `skipped_steps` may contain only `weather_choice`, `style_goal`, `notifications`; never auth/legal/privacy gate/item confirmation when server storage occurs.
- `activated` means first wardrobe item is ready **and** a first outfit result has been rendered; saving the outfit is a stronger activation event, not required to finish onboarding.
- Draft before auth is local-memory only, digest-bound, and expires on close/reload; no image bytes or blocked-file metadata are written to analytics/localStorage.
- Server state uses optimistic concurrency via `revision`/ETag and idempotency keys.

## 7. Chosen screen flow

### Screen 0 — value intro (one screen, no account)

Headline: **«Проверьте, с чем носить вещь — за пару минут»**  
Body: «Добавьте фото вещи без людей. Мы поможем оформить карточку и покажем сочетание, в том числе по погоде.»  
Primary CTA: **«Выбрать фото вещи»**  
Secondary CTA: **«Посмотреть на примере»**

No carousel, no permissions, no quiz, no price wall. «Посмотреть на примере» opens a demo outfit and then returns to upload.

### Screen 1 — local selection/privacy gate

Use the already specified fail-closed privacy gate. Explain: **«Сначала проверим фото на устройстве. До разрешения оно не загружается.»**  
CTA: **«Продолжить с этим фото»** only after upload-allowed decision.  
Alternative: **«Выбрать другое фото»**.

If blocked/uncertain, do not create an account wall; help select a valid garment-only photo. Never send filename, hash, pixels, EXIF, detector boxes/confidence to analytics before permission.

### Screen 2 — account, just before server save

Headline: **«Сохраните вещь в своём гардеробе»**  
Body: «Аккаунт нужен, чтобы не потерять вещь, образы и лимиты тарифа.»  
Primary: **«Продолжить по email»**  
If implemented: **«Продолжить с Apple»**, **«Продолжить с Google»**.  
Footer: links to Terms and Privacy; consent controls remain distinct from marketing.

Email flow: enter email → **«Получить код»** → code → **«Подтвердить и продолжить»**.  
Recovery: same OTP/magic-link entry point, copy **«Уже есть аккаунт? Войти»**; unknown and known emails receive non-enumerating responses. Rate limiting and recent-auth required for email change/delete/export.

### Screen 3 — weather choice (one decision, skippable)

Headline: **«Учитывать погоду в образах?»**  
Option A primary: search **«Введите город»**, CTA **«Использовать этот город»**.  
Option B: **«Определить примерный город»** → request coarse/while-in-use permission only after tap.  
Skip: **«Пока без погоды»**.

Never request precise/background location. Denial returns to manual city; denial is not an error and does not block onboarding.

### Screen 4 — item review

Show clean preview, objective attributes and low-confidence fields. Objective V3 is labelled beta where applicable; manual path always available.  
Primary: **«Добавить вещь»**  
Secondary: **«Исправить»**  
Safe alternative: **«Использовать ручное описание»**.

If explicit third-party AI analysis is offered, show provider/purpose/cost boundary and separate unchecked consent exactly at invocation. Refusal preserves manual wardrobe functionality.

### Screen 5 — first outfit / achieved value

Headline: **«Вот с чем можно носить вашу вещь»**  
Show anchor personal item plus permitted demo/personal pieces, badges distinguishing them, weather comfort explanation if enabled, and accessory only when structurally useful.  
Primary CTA: **«Сохранить образ»**  
Secondary: **«Заменить одну вещь»**  
Feedback: **«Подходит» / «Не подходит»**, with optional reason chips.

After save/render, compact prompt (not blocking): **«Сделать рекомендации точнее?»** with one contextual question, e.g. cold sensitivity when weather is active. CTA **«Ответить»**, skip **«Позже»**.

### Paywall timing

- Do not show before first item and first outfit.
- Show plan education after first saved outfit or when usage reaches a transparent threshold (e.g. 40/50 initial items or monthly quota exhausted).
- Copy must show current entitlement, what counts as an item, reset date, and 499/999 ₽ differences without urgency tricks.
- Objective V3 beta cost/availability must not be presented as an unlimited entitlement unless backend enforcement and pricing support it.

## 8. Onboarding alternatives and decision

Score: 1 low, 5 high. Impact is positive; effort/risk are costs.

| Variant | Description | Impact | Effort | Privacy/product risk | Key issue |
|---|---|---:|---:|---:|---|
| A. Account-first wizard | Auth → terms → city → goal → style quiz → upload | 2 | 3 | 4 | Fast implementation but high abandonment before value; encourages overcollection. |
| **B. Try-first, auth at save (chosen)** | Intro → local photo/privacy check → auth → city/skip → item → outfit | **5** | **3** | **2** | Requires careful ephemeral draft handoff, but aligns account ask with understandable need. |
| C. Full guest workspace | Upload/process/outfit anonymously, account only for persistence | 5 | 5 | 4 | Highest trial value, but anonymous server assets, abuse, deletion and consent linkage greatly expand backend/privacy complexity. |

**Decision:** B. It captures most of C’s experiential benefit while avoiding anonymous server image storage. Compared with A, it should improve time-to-first-value and auth conversion quality because the user has already committed to a valid item. Validate through a staged experiment only after baseline instrumentation; do not ship multiple flows without event contracts.

## 9. Lifecycle, consent, versioning, deletion and export

### Account/profile lifecycle

`anonymous_local_draft → active_unverified (optional, short TTL) → active_verified → locked → deletion_pending → deleted`.

- Prefer verified identity before accepting image upload.
- `deletion_pending` immediately revokes sessions and hides data; async privacy job deletes DB rows/object assets/derived features and provider metadata according to documented SLA.
- Tombstone retains only non-reversible minimal security/legal proof when a documented basis exists; never retain wardrobe images «just in case».
- Restore from deletion_pending only if policy explicitly allows a short window and no destructive job has crossed the point of no return; otherwise create a new account.

### Consent registry

Store append-only records:

```json
{
  "consent_id": "cns_opaque",
  "user_id": "usr_opaque",
  "purpose": "garment_ai_analysis",
  "policy_version": "garment-ai-v1",
  "decision": "granted",
  "scope_ref": "asset_or_operation_id",
  "granted_at": "server_time",
  "withdrawn_at": null,
  "evidence": {
    "ui_surface": "item_review",
    "client_timestamp": "optional",
    "locale": "ru-RU"
  }
}
```

Separate purposes: legal terms acceptance; garment upload privacy attestation; person-photo self-consent if ever allowed by the existing gate; third-party AI analysis; marketing; coarse location; product notifications; future VTO. Bundling is prohibited. A new purpose, recipient, retention term or materially changed processing raises policy version and requires re-consent before that operation.

### Profile versioning

- URI version `/api/v1/profile`; body `schema_version=1`.
- Additive fields only within V1; semantic breaking changes create V2.
- `revision` + ETag/If-Match protects concurrent edits.
- Every derived attribute stores its own rule/model version and can be recomputed or deleted.
- Client must preserve unknown additive fields by patching named paths, not replacing the entire object.

### Export

Self-service export from Profile → Privacy:

- JSON for profile, consents, onboarding state, items/outfits/feedback;
- CSV convenience views for wardrobe/outfits;
- original/clean user assets in a ZIP where lawful and safe;
- manifest with schema versions, creation time and checksums;
- async job, recent re-auth, expiring single-use download link, security event; no email attachment.

### Deletion

- In-product CTA **«Удалить аккаунт и данные»**, recent re-auth, clear inventory of consequences.
- Idempotent deletion job covers auth sessions, profile, onboarding, wardrobe, outfits/snapshots according to product policy, feedback, analytics identifiers, object storage, queues/caches, derived attributes, exports and processor metadata.
- Backups expire under documented schedule; deletion receipt contains job ID and expected completion date, not sensitive inventory.
- Item deletion and consent withdrawal are narrower operations and must not require full account deletion.

## 10. API boundaries

### Auth service

- `POST /api/v1/auth/email/challenge`
- `POST /api/v1/auth/email/verify`
- `POST /api/v1/auth/session/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/email/change`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/{session_id}`

Owns email/provider subjects, credentials, verification, sessions, rate limits, lockout and security audit. Never sends email to outfit/recommendation services.

### Profile service

- `GET /api/v1/profile`
- `PATCH /api/v1/profile` with allowlisted JSON Merge Patch and `If-Match`
- `DELETE /api/v1/profile/attributes/{attribute_group}` for reset

Returns user-editable and safe derived attributes. It does not expose auth secrets, raw consent evidence, provider tokens or precise coordinates.

### Onboarding service

- `GET /api/v1/onboarding`
- `POST /api/v1/onboarding/events` (idempotent state transitions, not analytics)
- `POST /api/v1/onboarding/complete`

Onboarding state references item/outfit IDs but does not own their lifecycle.

### Consent/privacy service

- `GET /api/v1/privacy/consents`
- `POST /api/v1/privacy/consents`
- `POST /api/v1/privacy/consents/{id}/withdraw`
- `POST /api/v1/privacy/exports`
- `GET /api/v1/privacy/exports/{job_id}`
- `POST /api/v1/privacy/deletions`
- `GET /api/v1/privacy/deletions/{job_id}`

### Weather boundary

- `GET /api/v1/geo/cities?q=...`
- `GET /api/v1/weather/current?city_id=...`

Profile stores stable `city_id` and label. Weather provider receives city/coarse grid only. Raw GPS is converted client-side or in a narrowly scoped geo endpoint and discarded. Outfit service receives normalized weather facts (`temperature_band`, precipitation/wind flags), not location identity.

### Entitlements

- `GET /api/v1/entitlements`

Server-owned source for plan, 499/999 ₽ entitlement codes, `initial_item_limit=50`, monthly increment/reset and Objective V3 beta eligibility. UI must not infer entitlements from profile or local counters.

### Recommendation boundary

Outfit service receives:

- opaque `user_id` or request-scoped subject;
- wardrobe item objective attributes/assets already allowed for that operation;
- normalized weather facts;
- explicit style/comfort attributes needed for the request;
- recent outfit signatures for repetition control.

It does **not** receive email, auth method, legal consent evidence, raw GPS, body data or marketing preferences.

## 11. Analytics and success metrics

Use pseudonymous analytics ID distinct from auth ID where feasible; no image/filename/free text/exact city/provider payload. Consent/permission denials are coded events, not personal explanations.

### Event funnel

- `onboarding_started`
- `demo_viewed`
- `item_picker_opened`
- `local_privacy_check_result` with coarse enum only
- `auth_started`, `auth_completed`, `auth_failed_code`
- `weather_choice_shown`, `weather_mode_selected`, `location_permission_result`
- `item_review_shown`, `first_item_ready`
- `first_outfit_rendered`, `first_outfit_saved`
- `onboarding_completed`
- `profile_attribute_set`, `profile_attribute_corrected`, `derived_attribute_reset`

### Metric definitions and initial targets

Targets are launch hypotheses, not historical baselines; recalibrate after 15–30 beta users and then a larger cohort.

| Metric | Definition | Initial guardrail/target |
|---|---|---|
| Time-to-first-value (TTFV) | median/p75 from `onboarding_started` to `first_outfit_rendered`, excluding background processing wait reported separately | median ≤3 min; p75 ≤5 min |
| Onboarding completion | `onboarding_completed / onboarding_started` for eligible sessions | ≥65% beta; diagnose by step |
| First wardrobe item | `first_item_ready / auth_completed` within 24h | ≥75% |
| First outfit | `first_outfit_rendered / first_item_ready` within same session and 24h | ≥80% same session |
| Permission drop-off | no continuation within 2 min after location prompt or denial | <10 percentage points incremental; manual city/skip visible |
| Profile correction rate | users correcting any explicit/derived profile attribute within 7d / users with that attribute | monitor; >20% per attribute = wording/default/model review |
| Objective field correction | corrected AI fields / confirmed AI fields by field/version | retain existing quality metric; no forced profile inference |
| D1 activation | activated users returning next calendar day and performing wardrobe/outfit action / activated cohort | beta directional; target ≥30% after baseline |
| D7 activation | activated users with ≥1 meaningful action on days 2–7 / activated cohort | target ≥25% after baseline |

Also report auth completion, resend rate, magic-link cross-device failure, item processing success, manual fallback use, weather mode split, save/feedback rate, quota education views and paywall conversion. Segment only by privacy-safe product choices, not inferred demographics.

## 12. Critical implementation backlog

### Phase 0 — research decision

1. Approve chosen B flow and exact definition of first value/activation.
2. Legal/privacy review for Russia: account basis, image processing, consent evidence, minors, localization, processors, deletion/backups and cross-border transfer.
3. Confirm 499/999 ₽ entitlements, what consumes initial 50 and monthly 10–15 quota, reset semantics and Objective V3 beta availability.
4. Prototype five screens and run 5–7 moderated tests using synthetic/no-person garment assets; measure comprehension and friction.

**Exit:** signed decision record; no unresolved required person/body data; quota contract fixed.

### Phase 1 — contract

1. Publish JSON Schemas/OpenAPI for ProfileV1, OnboardingStateV1, consent, entitlement and safe analytics events.
2. Define data classification/retention/deletion matrix and processor register.
3. Define auth threat model, session model, rate limits, non-enumerating errors, CSRF/CORS/cookie policy.
4. Define city provider abstraction and normalized weather facts.

**Exit:** frontend/backend independent mock tests pass; privacy owner approves fields/purposes.

### Phase 2 — backend auth/profile

1. Email OTP/magic-link challenge/verify, sessions, logout-all, recent-auth.
2. Profile CRUD with ETag/revision, allowlists and field reset.
3. Onboarding transition service with idempotency.
4. Consent registry and current-policy endpoint.
5. Entitlement service with 50 initial + plan monthly quota rules.
6. Export/deletion jobs and storage-wide deletion adapters.
7. Security and privacy-safe audit logs.

**Exit:** unit/integration tests cover replay, enumeration, expiry, concurrent patches, stale policy, deletion idempotency and authorization isolation.

### Phase 3 — frontend onboarding

1. Value screen/demo.
2. Existing local privacy gate integration before auth/upload.
3. Auth modal with OTP resend/cross-device recovery.
4. Weather city/manual/skip and just-in-time coarse permission.
5. Item review/manual fallback; Objective V3 beta disclosure/consent only when invoked.
6. First outfit screen with personal/demo badges, weather explanation and save.
7. Resume state, accessible error/focus handling, no dark patterns.

**Exit:** keyboard/mobile/accessibility checks; no network for blocked/uncertain files; every optional step has a working skip.

### Phase 4 — migration/test users

1. Map legacy/local demo users to accounts only after explicit sign-in.
2. Preview import count and conflicts; idempotent import with rollback.
3. Never silently upload local assets or infer consent from historic use.
4. Seed 15–30 beta accounts with explicit test-user labeling and synthetic/licensed no-person assets.

**Exit:** repeated migration produces no duplicates/loss; user can decline and keep local data unchanged.

### Phase 5 — analytics/privacy QA

1. Validate event schema and funnel dashboards.
2. Inspect logs/traces/crash payloads for email, tokens, filename, image bytes, exact city/GPS and free text.
3. Exercise consent grant/refusal/withdrawal and stale-version flows.
4. Run deletion/export end-to-end including objects, cache, queue, derived profile and analytics deletion mapping.
5. Verify notification/marketing consent separation.

**Exit:** privacy QA checklist signed; zero prohibited fields in sampled telemetry; export and deletion SLA proven.

### Phase 6 — browser E2E

1. Chromium/WebKit/Firefox desktop + mobile viewport happy path.
2. Email OTP expiry/resend/wrong code/network retry.
3. Location allow/deny/unavailable/manual/skip.
4. Privacy gate no-person/blocked/uncertain/file replacement/reload.
5. Objective V3 unavailable/refused/error → manual completion.
6. First outfit personal/demo asset labeling and save idempotency.
7. Quota boundary, paywall timing, logout/login resume.
8. Account export/delete, session revocation, cross-account authorization.

**Exit:** critical suite passes in staging with fake providers; no OpenAI/DPAPI/live credential calls are part of this acceptance.

## 13. Acceptance criteria

1. A new user can reach a rendered first outfit in ≤5 user-facing screens after the value intro (privacy substate and OTP code are interaction states, not questionnaire pages).
2. Before auth, no image leaves the device; before privacy gate approval no image/hash/filename/EXIF or detector detail is logged or persisted.
3. Server upload requires verified user, current policy/attestation and digest-bound authorization.
4. The only auth identity required is verified email or equivalent provider subject; name and username are absent.
5. Weather is usable by manual city, coarse device location or disabled mode; denial never blocks first outfit.
6. Height, weight, sex/gender, body measurements and person photo do not exist in ProfileV1 or onboarding payloads.
7. User can finish via manual item description when Objective V3 beta is unavailable or AI consent is refused.
8. First outfit is available before any paywall; entitlement counters and reset date are server-owned and transparent.
9. Profile fields are grouped by purpose, patchable with concurrency control, resettable and never silently inferred as sensitive demographics.
10. Consent records are purpose-, policy- and operation-scoped; optional purposes are unchecked and independently withdrawable.
11. Self-service export and deletion work with recent authentication; deletion revokes sessions immediately and completes idempotently across all stores.
12. Wardrobe/profile are private with no public profile/sharing in V1.
13. Analytics measure TTFV, completion, first item/outfit, permission drop-off, correction rate and D1/D7 without images, exact location, email or free text.
14. Browser E2E covers privacy, auth, weather fallback, manual AI fallback, entitlement and deletion; production OpenAI/DPAPI calls remain out of scope.

## 14. Conscious non-goals

- No social/community layer, public profiles, following or wardrobe sharing.
- No full wardrobe import from email/order history.
- No body/face VTO, body-shape classification or virtual model.
- No size recommendation for purchases.
- No gendered onboarding or gendered taxonomy gate.
- No long style quiz, color-season diagnosis or personality archetype before value.
- No always-on weather/location tracking.
- No separate accessory initiative; accessories remain optional components of the existing outfit core.
- No automated learning that cannot be explained, corrected or reset.
- No claim that Objective V3 beta is production-grade or unlimited.
- No production code changes, user-image inspection, credentials, OpenAI calls or DPAPI calls as part of this proposal.

## 15. Highest risks and mitigations

| Risk | Severity | Mitigation / gate |
|---|---:|---|
| Account wall still interrupts perceived momentum | High | Preserve local preview, explain why account is needed, one passwordless step, measure auth drop-off. |
| Anonymous pre-auth draft leaks image data | High | Memory-only, digest-bound, no analytics/storage; upload only after verified auth and privacy gate. |
| Broad profile quietly becomes a sensitive dossier | High | Schema allowlist, separate sensitive subresource requiring privacy review, no free text, reset/provenance. |
| Location permission causes drop-off | Medium | Manual city first-class, coarse only, skip, ask on explicit action and measure incremental abandonment. |
| AI/provider consent is bundled with core service | High | Operation-scoped unchecked consent; manual wardrobe/outfit path remains functional. |
| Objective V3 beta quality damages trust | High | Clear beta label, field confidence/review, manual fallback, correction metrics by version. |
| Quota/paywall feels bait-and-switch | High | First outfit before paywall; exact counters, reset and plan benefits; no fake urgency. |
| Delete/export is incomplete across assets/backups | Critical | Storage inventory, idempotent jobs, processor adapters, backup expiry, staging proof before beta. |
| Russian legal/localization requirements unmet | Critical | Formal legal review before public launch; no assumption that generic consent text is sufficient. |
| Derived preferences become uncorrectable stereotypes | Medium | Provenance/confidence, user-visible correction/reset, decay and versioned recomputation. |

