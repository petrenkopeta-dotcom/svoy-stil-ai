# CAPSULE-09 — privacy/security threat model капсул и retail search

Дата: 21.08.2026  
Scope: капсулы, фото и гардероб, магазин/город, retail search, affiliate tracking, recommendations, poisoning, prompt/content injection, deletion/export и consent scopes.  
Ограничения: production-код не менялся; авторизация и Supabase не проектировались и не изменялись; VK ID остаётся только исследовательским backlog. Это security/privacy gate, а не юридическое заключение.

## Решение

**Итог: HOLD для production и любого сетевого retail/affiliate запуска.**

**PASS только для ограниченного local-first прототипа капсул**, если он использует подтверждённые пользователем личные вещи и явно маркированный demo-каталог, выполняет детерминированный локальный ranking, не отправляет фото/гардероб/город наружу, не включает affiliate redirects или сторонние изображения и сохраняет действующие export/delete/consent границы.

Причины HOLD: в текущем проекте нет доказанного production-контура retail search, договорного каталога и лицензий, модели affiliate attribution, полного manifest-based export, независимо подтверждённого zero-residue deletion для облака, vendor/legal review и защиты recommendation supply chain. Текущие local privacy проверки не являются доказательством production privacy. Тарифы **499/999 ₽ не меняют privacy baseline**: согласие, удаление, экспорт, безопасность, отсутствие скрытого tracking и объяснимость источника обязательны для обоих тарифов; нельзя продавать отказ от слежения как premium-функцию.

## Проверенный текущий контур

- Фото: local-first intake, проверка формата/качества, нормализованная копия без EXIF, отдельный processing/storage consent, IndexedDB/TTL и ручное подтверждение; сетевое AI/CV и generative inpainting не доказаны.
- Гардероб: personal и demo — разные смысловые области; demo нельзя выдавать за личную вещь или включать в персональную капсулу без явной маркировки.
- Магазин: сценарий временной shopping anchor существует как черновой контур; найденная вещь не должна становиться личной до отдельного save confirmation.
- Город: геолокация не запрашивается; при поиске название города передаётся Open-Meteo, долговременное сохранение — только после consent.
- Retail/QR: существующее feasibility-решение — HOLD/NO-GO для production; разрешён лишь закрытый spike с allowlist/mock, provenance и фото/ручным fallback.
- Export/delete: локальные контракты есть, но аудит data lifecycle фиксирует неполный экспорт и LIVE HOLD; cloud deletion/export без owner-scoped endpoint и независимого residue check не считается PASS.
- Recommendation/learning: запись требует отдельного consent и provenance recommendation id; ranking должен оставаться трассируемым и не смешивать недоказанные факты с предпочтениями пользователя.

## Активы, границы доверия и нежелательные результаты

### Активы

1. Фото вещей и случайно попавшие в кадр лица, документы, интерьер, отражения и геометки.
2. Личный гардероб, размеры/посадка, стилевые ограничения, история образов и feedback.
3. Магазин, город, время поиска, ценовой диапазон и последовательность кликов — потенциальный профиль покупок/перемещений.
4. Capsule composition, recommendation history и inferred preferences.
5. Affiliate click/order identifiers, partner sub-id, device/network identifiers и revenue attribution.
6. Consent receipts, export manifests, deletion receipts и provenance каталога/ruleset/model.

### Границы доверия

`browser session → localStorage/IndexedDB`; `personal ↔ demo`; `photo/QR input → parser/recognizer`; `app → Open-Meteo`; `app/BFF → retail provider`; `provider content → recommendation engine/UI`; `recommendation → affiliate redirect`; `local → future account/cloud`; `product logs/telemetry/crash reports → operator/vendors`.

### Security/privacy invariants

- До соответствующего consent нет долговременной записи и внешней передачи данных.
- Personal, demo и retail candidate имеют разные `origin`, `owner_scope`, `provenance` и lifecycle; преобразование между ними — только явным действием.
- Никакой внешний текст, URL, metadata, alt text или изображение не становится инструкцией модели/агента.
- Рекомендация не является рекламой «по умолчанию»: коммерческая связь и причина ranking показываются до клика.
- Отзыв consent останавливает будущую обработку; delete удаляет данные и производные индексы/кэши, но не маскируется под reset UI.

## Threat model и обязательные контроли

| ID | Угроза / abuse case | Результат | Gate-контроль | Статус |
|---|---|---|---|---|
| TM-01 | Фото содержит EXIF/GPS, лицо, документ, дом или отражение | deanonymization, утечка местоположения/третьих лиц | decode и re-encode локально; strip metadata; preview/crop; не логировать bytes/hash, если hash не обоснован; понятный retake/delete | local PASS по контракту; network HOLD |
| TM-02 | Upload/recognition начинается до consent или consent на хранение трактуется как consent на AI/vendor | незаконное расширение цели | раздельные versioned scopes: processing, local storage, external recognition, cloud sync; fail closed; network-before-consent = 0 | PARTIAL |
| TM-03 | Blob/thumbnail остаётся после удаления вещи, reset или истечения TTL | скрытый residue | единый manifest связей garment↔photo↔thumbnail↔cache; idempotent delete; post-delete count/read-back; quota/error tests | local PARTIAL; live HOLD |
| TM-04 | Demo-вещь попадает в personal capsule или feedback обучает личный профиль на demo без маркировки | ложная персонализация и contamination | типизированный origin; отдельные вкладки/labels; запрет implicit save; feedback хранит subject origin | PARTIAL |
| TM-05 | Retail result автоматически сохраняется как owned item | ложный гардероб, profiling | временный shopping anchor с TTL; editable review; отдельное save confirmation; provenance snapshot | контракт PASS; integration HOLD |
| TM-06 | Город + магазин + время + клики образуют трек перемещений | profiling/stalking risk | не запрашивать precise location; city coarse/manual; history off; короткий TTL; purpose-specific consent; не передавать affiliate-партнёру город без необходимости | HOLD |
| TM-07 | Third-party product images/pixels получают IP, referrer, cookies | скрытый tracking | не рендерить remote URL напрямую; vetted image proxy/cache либо placeholder; CSP; `Referrer-Policy`; strip query; no third-party cookies | HOLD |
| TM-08 | Affiliate redirect содержит stable user/profile/capsule ID | cross-site correlation | opaque one-time campaign token; без user id/email/city/wardrobe fields; короткий TTL; server-side mapping с retention; disclosure до клика | HOLD |
| TM-09 | Affiliate SDK/partner собирает клики до consent или сверх заявленной цели | нарушение purpose limitation | без SDK в клиенте; отдельный optional analytics/affiliate scope; vendor DPA/inventory; opt-out без потери core recommendation | HOLD |
| TM-10 | Комиссия повышает ranking без раскрытия | манипуляция, dark pattern | relevance score отделён от commercial boost; по умолчанию boost=0; label «партнёрская ссылка»; журнал reason codes; non-affiliate alternative | HOLD |
| TM-11 | Catalog poisoning: поддельные SKU/цены/цвета/наличие/изображения | вредная или ложная рекомендация | allowlist provider; signed/versioned ingestion where possible; schema + bounds; anomaly/quarantine; freshness; user verification; kill switch | HOLD |
| TM-12 | Feedback poisoning/Sybil/replay и массовые affiliate клики | ranking corruption/fraud | idempotency, rate limits, replay protection, provenance; не обучаться online напрямую; aggregation thresholds; rollback/versioning | HOLD |
| TM-13 | Prompt injection в title/description/review/QR/OCR/HTML: «игнорируй правила», tool-call bait | exfiltration/action injection | весь provider/user content — untrusted data; strict JSON schema/length/charset; escape output; no HTML; no dynamic system prompts; tool allowlist; no URL fetch from model | HOLD |
| TM-14 | Indirect injection в image metadata, OCR text или alt text | скрытые инструкции модели | metadata stripped; OCR isolated; label fields; model receives structured allowlisted attributes only; adversarial corpus | HOLD |
| TM-15 | XSS/open redirect/SSRF через product URL, QR или image URL | account/network compromise | no arbitrary fetch/open; HTTPS allowlist; canonicalize; revalidate redirects/DNS/IP; block private/link-local/loopback; response/time/size limits | HOLD |
| TM-16 | Recommendation раскрывает чувствительную inference («размер», тело, доход) или уверенно выдумывает факт | harm/discrimination | data minimisation; neutral copy; uncertainty/limitations; evidence-bound reason codes; no health/body inference from photo | PARTIAL |
| TM-17 | Один пользователь получает capsule/photo/export другого | critical cross-owner breach | owner-scoped repository/storage policies, object prefixes, signed URL limits, two-user negative matrix; не принимать client `user_id` | live HOLD; auth вне scope |
| TM-18 | Export неполный либо включает signed URLs, third-party IDs, чужие/demo данные | portability failure / leakage | versioned manifest по доменам; явно перечислять включения/исключения; owner-scope; photos as files/checksums; no secrets/URLs | local PARTIAL; live HOLD |
| TM-19 | Delete не удаляет derived recommendations, affiliate map, outbox, logs/backups | долговременный residue | deletion graph + receipt counts; revoke sessions; tombstone only when justified; backup expiry; processor propagation; retry-safe workflow | HOLD |
| TM-20 | Цена тарифа меняет доступ к delete/export/consent или включает tracking по умолчанию | coerced consent / unfair UX | одинаковые privacy controls для 499/999 ₽; granular opt-in; core capsule works without affiliate consent; no consent wall | policy required |
| TM-21 | Логи/crash/evidence содержат фото, query string, raw city/store, capsule text или token | вторичная утечка | event allowlist; redact/drop at source; no payload logging; environment separation; retention/access controls; synthetic QA fixtures | PARTIAL |
| TM-22 | Лицо младше 18 лет или фото третьего лица обрабатывается без понятного основания | повышенный legal/safety risk | age/audience decision до launch; UX «только свои вещи, без людей/документов»; reporting/delete path; отдельный legal review | HOLD |

## Consent matrix

Галочка «принять политику» не может покрывать все операции. Каждый receipt: `purpose`, `scope`, `policy_version`, `granted_at`, `revoked_at`, controller/vendor category, retention и способ отзыва.

| Scope | Default | Что разрешает | Не разрешает |
|---|---|---|---|
| `photo_session_processing` | session-only | локальная проверка/нормализация выбранного фото | хранение, vendor AI, cloud sync, analytics |
| `photo_local_storage` | off | IndexedDB copy с TTL для личной вещи | external recognition или cloud |
| `photo_external_recognition` | off | передачу указанному vendor для указанной цели | обучение vendor/model, indefinite retention, marketing |
| `profile_preferences_storage` | off | локально запомнить ответы | retail sharing/affiliate tracking |
| `city_context_storage` | off | сохранить подтверждённый город на устройстве | precise geolocation, отправку магазина/истории партнёрам |
| `recommendation_learning` | off | учитывать явно заданный feedback с provenance | скрыто учиться на views/clicks/purchases |
| `retail_search` | action-specific | отправить минимальный query allowlist-провайдеру | affiliate attribution и персональный marketing |
| `affiliate_attribution` | off | один раскрытый partner click с минимальным token | cross-site/profile tracking, изменение ranking |
| `product_analytics` | off | allowlisted обезличенные/псевдонимные события | фото, wardrobe/capsule text, city/store, URLs |
| `cloud_sync` | off / вне текущего scope | будущую owner-scoped синхронизацию выбранных доменов | автоматический перенос локальных фото; нужен отдельный photo consent |

Отзыв одного scope не должен отзывать остальные, но обязан немедленно остановить относящиеся к нему новые операции. Для уже переданных данных UI показывает, кому они были переданы, применимый срок и путь удаления/запроса.

## Recommendations: целостность и честность

Ranking pipeline должен принимать только структурированные поля с provenance и confidence. Минимальный trace на рекомендацию: `recommendation_id`, `ruleset/model_version`, входные item ids + origin, применённые hard constraints, reason codes, retail source/version/fetched_at, commercial relationship, alternatives и limitations. Сырые prompt/chain-of-thought не сохраняются и пользователю не обещаются.

Hard constraints пользователя применяются раньше коммерческих сигналов. Sponsored/affiliate candidate не может обойти размер, бюджет, доступность, запрет категории или personal/demo boundary. При stale price/stock UI говорит «проверьте у магазина». Product title, description, OCR, QR payload, reviews и merchant text не конкатенируются с system/developer instructions и не получают tool authority.

## Export, deletion и retention

### Export acceptance

Экспорт — versioned ZIP/JSON manifest, раздельно: profile/preferences; consent receipts; wardrobe metadata; photo manifest и сами фото либо явное проверяемое исключение; capsules/outfits; feedback/learning; shopping drafts; retail queries/results retained by operator; affiliate tokens/events; telemetry; cloud objects. Demo assets перечисляются как продуктовые, но не выдаются за данные субъекта. Нельзя включать credentials, session/OTP, signed URLs, raw provider payload, чужие данные или remote tracking URLs.

### Delete acceptance

Удаление строится как граф: primary rows/keys → photos/thumbnails → capsules/recommendation cache → shopping drafts → feedback/learning/outbox → affiliate mapping → telemetry identifiers → processor deletion → backup expiry. Операция idempotent, выдаёт receipt по доменам и после неё выполняется независимый read-back/count check. Ошибка одного processor не изображается успехом; UI показывает pending/failed и retry. Локальный delete и будущий account delete — разные действия и названия.

Рекомендуемые сроки до legal/product confirmation: session photo — до закрытия/отмены; unsaved shopping anchor — session/не более 24 часов; retail response cache — минимальный технический TTL; affiliate one-time map — до окна атрибуции, затем unlink/delete; security logs — отдельный документированный срок без payload. Точные сроки нельзя запускать как «вечные по умолчанию» и нужно закрепить в inventory/DPA/UI.

## Вопросы по 152-ФЗ для владельца и юриста

Ниже — launch-blocking вопросы, не вывод о законности.

1. Кто оператор для каждой цели: локальный прототип, production service, retail search, affiliate attribution и support; кто обработчик по поручению?
2. Являются ли фото, гардероб, город/магазин и их связка персональными данными в фактической архитектуре; не возникает ли специальная/биометрическая обработка, если фото используется для установления личности? Проект не должен заявлять biometric use без отдельного решения.
3. Какое основание по каждой цели и почему: договор, согласие или иное; можно ли выполнить core styling без необязательного retail/affiliate consent?
4. Требуется ли уведомление Роскомнадзора до начала обработки и корректно ли заполнены цели, категории субъектов/данных, меры защиты, места БД и трансграничная передача?
5. Где происходит первичная запись/систематизация/накопление данных граждан РФ; удовлетворяет ли архитектура требованиям локализации после изменений 2025 года?
6. Есть ли трансграничная передача в Open-Meteo, CDN, crash/analytics, AI/CV, retail и affiliate vendors; выполнена ли отдельная процедура/оценка до её начала?
7. Нужны ли отдельные согласия на обработку, распространение и рекламные/affiliate коммуникации; соответствует ли форма требованиям конкретности, информированности и однозначности?
8. Как исполняются доступ, исправление, отзыв, прекращение обработки и уничтожение; какие сроки, доказательства и исключения для обязательного хранения?
9. Как оформлены поручения обработки: список операций, цели, конфиденциальность, безопасность, incident notification, sub-processors, delete/return и audit rights?
10. Достаточны ли опубликованная политика, внутренние документы, назначение ответственного, threat model/уровень защищённости, журнал инцидентов и процесс уведомления регулятора?
11. Является ли affiliate placement рекламой/рекомендательной технологией и какие маркировка, disclosure и пользовательские настройки обязательны помимо 152-ФЗ?
12. Каков возрастной контур продукта и что делать с фотографиями/данными несовершеннолетних и третьих лиц?

Актуальность вопросов нужно проверить по официальному тексту закона и изменениям, включая Федеральный закон от 28.02.2025 № 23-ФЗ, до production design freeze. Официальные ориентиры: [опубликование № 23-ФЗ](https://publication.pravo.gov.ru/document/0001202502280034), [разъяснение Роскомнадзора об уведомлении оператором](https://82.rkn.gov.ru/directions/pers/p15375/). Поиск выполнен 21.08.2026; юридический владелец обязан проверить действующую редакцию и применимость.

## Acceptance criteria

### PASS для local-first capsule prototype

- [ ] Network egress для photo/wardrobe/capsule/retail/affiliate равен нулю; Open-Meteo остаётся отдельным подтверждённым city action.
- [ ] Все items имеют `origin=personal|demo|retail`, personal owner scope и provenance; UI визуально различает источники.
- [ ] Unsaved retail candidate/anchor не попадает в wardrobe, learning, export как owned item и исчезает по TTL/session close.
- [ ] Фото сохраняется только после versioned local-storage consent; delete garment/delete-all/TTL удаляют blob и thumbnails с zero-residue receipt.
- [ ] Capsule ranking детерминирован, constraints-first, показывает reason codes/limitations и не использует affiliate boost.
- [ ] Export перечисляет каждый local domain и omissions; delete/reset семантически различены и проверяются после reload.
- [ ] Demo и synthetic fixtures не содержат личных данных и не загрязняют personal feedback/metrics.
- [ ] Оба тарифа 499/999 ₽ имеют одинаковые privacy controls; отличие тарифа не связано с consent или базовыми правами субъекта.

### Дополнительный PASS для закрытой retail alpha

- [ ] Один allowlist provider, договор/DPA, data inventory, лицензии на карточки/изображения, documented retention/deletion и incident contact.
- [ ] Отдельные consent/action gates для retail query, remote images, external recognition, affiliate attribution и analytics; pre-consent network = 0.
- [ ] Remote content проходит schema/size/charset validation, HTML запрещён, URLs canonicalized; SSRF/open redirect/XSS тесты проходят.
- [ ] Poisoning corpus покрывает forged SKU, stale price/stock, prompt injection в каждом текстовом поле/OCR/metadata, duplicate/replay и adversarial image URL.
- [ ] Ranking trace доказывает, что commercial signal не меняет relevance и не обходит hard constraints; видны partner label и non-affiliate alternative.
- [ ] Affiliate token не содержит stable user/city/store/capsule/item identifiers; SDK/cookies/fingerprinting отсутствуют; opt-out не ломает core flow.
- [ ] Export/delete включают provider/affiliate/telemetry domains; processor deletion проверена receipt и истечением backup/cache.
- [ ] Feature flag + per-provider kill switch, rate limits, anomaly alerts и rollback ruleset/catalog snapshot проверены tabletop exercise.
- [ ] Privacy/security/legal owners письменно закрыли 152-ФЗ вопросы; production architecture не полагается на недоказанные auth/Supabase/VK ID контуры.

## Риски и зависимости

### P0 / release blockers

- Cross-owner disclosure/mutation; pre-consent photo/network; arbitrary URL fetch/open; prompt/content injection, приводящая к tool/network action; delete, заявленный успешным при остатках; скрытый affiliate tracking.

### P1

- Неполный export; demo/personal contamination; remote image tracking; stale/poisoned catalog; commercial bias без disclosure; чрезмерное хранение city/store/click history; vendor без DPA/delete SLA.

### Зависимости

1. Product: точный capsule/retail UX, различия 499/999 ₽ без privacy discrimination, affiliate disclosure.
2. Data: договорный catalog provider, provenance schema, freshness/SLA, image rights.
3. Security: BFF egress/URL policy, CSP/referrer policy, content schemas, kill switch, logs redaction, pentest corpus.
4. Privacy/legal: data map, основания, operator/processor roles, localization/transborder decision, notices/consents, retention, affiliate/recommendation review.
5. QA: browser privacy harness, two-user negative matrix после отдельного auth-разрешения, export/delete residue runner, poisoning/injection suite.
6. Operations: incident owner, provider revocation, deletion reconciliation, backup expiry evidence and audit records.

## Следующие задачи

1. **CAPSULE-SEC-01 — Data inventory/DPIA-lite (P0, privacy+product):** описать каждое поле, origin, purpose, consent/legal basis, recipient, storage, TTL, export/delete и тариф; результат — утверждённая matrix без `unknown` для alpha.
2. **CAPSULE-SEC-02 — Origin/provenance contract (P0, architecture):** JSON schema для personal/demo/retail, shopping anchor TTL, source snapshot и запрет implicit ownership; только спецификация до отдельного разрешения на код.
3. **CAPSULE-SEC-03 — Consent UX/spec (P0, product+legal):** тексты и receipts для scopes из matrix, revoke behavior и pre-consent network assertions.
4. **CAPSULE-SEC-04 — Retail provider gate (P0, business+legal):** договор, лицензии, DPA, российское покрытие, deletion SLA, image delivery и incident channel; иначе retail остаётся HOLD.
5. **CAPSULE-SEC-05 — Content/URL security test plan (P0, security):** fixtures для injection/XSS/SSRF/open redirects/decode bombs/poisoning и ожидаемые fail-closed outcomes.
6. **CAPSULE-SEC-06 — Recommendation integrity eval (P1, ML/product):** constraints-first golden set, affiliate neutrality, provenance completeness, stale/unknown handling и rollback threshold.
7. **CAPSULE-SEC-07 — Export/delete manifest v2 (P0, privacy+QA):** полная domain graph, omissions, receipts, failure states и reload/residue acceptance; cloud реализация только отдельной задачей и разрешением.
8. **CAPSULE-SEC-08 — Affiliate architecture decision (P0, product+legal+security):** либо no-tracking links, либо minimal one-time attribution; запрет client SDK/stable identifiers; public disclosure.
9. **CAPSULE-SEC-09 — 152-ФЗ legal memo (P0, counsel):** письменно ответить на 12 вопросов, проверить редакцию на дату запуска и зарегистрировать решения/владельцев.
10. **CAPSULE-SEC-10 — Alpha tabletop/kill switch (P1, ops):** сценарии poisoned catalog, vendor breach, wrong price, deletion failure и affiliate leak; доказать остановку провайдера без остановки local capsule.

## Финальный gate

- **Local-only capsule:** `PASS WITH CONDITIONS` после выполнения local acceptance checklist; до этого — **HOLD**.
- **Retail search, remote images, external AI/CV, affiliate tracking:** **HOLD / NO-GO**.
- **Production с аккаунтом/cloud:** **OUT OF SCOPE и HOLD** до отдельного разрешения и полного live owner-isolation/export/delete evidence.
- **VK ID:** только research backlog; не является dependency или обходным решением этого gate.

