# CAPSULE-04 — безопасный поиск товаров

**Статус:** **PASS на контрактный прототип без сети; HOLD на production-запуск и реальные каталоги**  
**Дата:** 2026-08-21  
**Область:** поиск похожей вещи и недостающей категории в магазинах; без scraping, сетевой реализации, изменений auth/Supabase и production-кода.

## 1. Решение

Ввести retail search как изолированный read-only контур над разрешёнными retailer feed/API. Он получает не фото и не весь гардероб, а минимальный `RetailSearchIntent`: подтверждённые структурированные признаки якоря или требования к недостающему слоту, coarse-регион, ценовой диапазон и версию правил. Результаты сначала проходят hard-фильтры наличия, региона, цены и совместимости слота, затем ранжируются по **приросту числа и разнообразия валидных образов**, которые покупка добавит к личному гардеробу.

Structured attributes — основной путь. Embeddings допустимы только как опциональный candidate-recall/rerank слой внутри каталога поставщика и никогда не заменяют hard constraints или объяснимые признаки. При недоступном/устаревшем каталоге продукт честно возвращает категорию и чек-лист для самостоятельного поиска, а не выдумывает товары, цены или наличие.

## 2. Совместимость с текущим продуктом

- Сохраняется try-first UX: demo может показать обезличенный пример поиска, но персональный поиск по гардеробу является `shopping`-действием и проходит существующий честный personal/auth gate.
- `source=demo` не смешивается с личным гардеробом. Demo-результаты маркируются и не сохраняются в личные образы; retail-вещь до явного сохранения остаётся внешним временным якорем.
- Текущий shopping-flow уже требует `source=personal`, держит магазинную вещь временной и сохраняет её только после отдельного подтверждения. Новый поиск должен использовать те же инварианты, не обходя их.
- Candidate engine остаётся источником валидности комплектов: `top + bottom + shoes` либо `dress/one_piece + shoes`, hard constraints до ranking, anchor во всех вариантах, отсутствие публичного числового score.
- В объяснения попадают только подтверждённые/поставщиком заявленные факты. Неизвестное остаётся `unknown`; маркетинговый текст продавца не превращается в объективный факт.
- Фото, object/data/blob URL, EXIF, filename, detector confidence и необязательные чувствительные характеристики не передаются retailer/provider. Текущий local-review/no-network photo contract не расширяется этой капсулой.
- Права тарифа являются server-owned entitlement. Для 499/999 ₽ не фиксировать разные возможности или квоты поиска, пока Product/Billing не утвердят коды, лимиты, reset и cost model. UI обязан показать реальное право и не обещать unlimited.

## 3. Пользовательские сценарии

### A. Найти похожее

Пользователь выбирает личную или временную магазинную вещь и уточняет допустимые отклонения: категория неизменна; цвет/материал/посадка/цена — строгие либо мягкие ограничения. Выдача объясняет сходство структурированными фактами: «та же категория и посадка; цвет близкий; материал не подтверждён».

### B. Найти недостающее

Candidate engine возвращает стабильный missing-slot reason. Поиск строится вокруг слота (`shoes`, `top`, `bottom`, `outerwear` и т. п.), контекста и личных вещей. Карточка отвечает не только «похоже», но и «что добавит»: например, «завершает 4 валидных образа, из них 2 с редко используемыми вещами» — качественно в UI, без псевдоточного публичного score.

### C. Нет безопасного результата

Показываются причина и следующий шаг: изменить регион/цену, ослабить только выбранный soft-фильтр, открыть checklist для магазина или повторить позже. Нельзя подменять пустую выдачу общими affiliate-ссылками.

## 4. Контракты

### 4.1 `RetailSearchIntentV1`

```json
{
  "schema_version": "retail-search-intent.v1",
  "request_id": "opaque-uuid",
  "mode": "similar|missing_slot",
  "slot": "shoes",
  "anchor": {
    "category": "shoes",
    "subcategory": "loafers",
    "colors": [{"role": "dominant", "family": "black"}],
    "material": "leather",
    "fit": "regular",
    "formality": "smart_casual",
    "season": ["demi"],
    "warmth": "light",
    "pattern": "solid",
    "confirmed_fields": ["category", "colors", "fit"]
  },
  "constraints": {
    "region_code": "RU-AST",
    "currency": "RUB",
    "price_min": 3000,
    "price_max": 12000,
    "sizes": [],
    "retailers": [],
    "must_be_in_stock": true
  },
  "outfit_context": {
    "occasion": "everyday",
    "season": "demi",
    "required_item_ids": ["opaque-local-id"],
    "generator_version": "candidate-engine-version"
  },
  "ranking_policy": "outfit-uplift-v1"
}
```

Правила минимизации:

- передавать только признаки, реально нужные фильтру/ранжированию;
- `required_item_ids` остаются внутренними opaque ID и не уходят retailer; provider получает агрегированный query без пользовательских идентификаторов;
- размер — только по явному вводу для текущего запроса; не выводить его из фото/тела;
- точную геолокацию не собирать: регион выбирается явно или берётся из ранее разрешённого coarse location;
- provenance каждого поля: `user_confirmed | retailer_claim | derived_rule | unknown`.

### 4.2 `RetailOfferV1`

Обязательные поля: `offer_id`, `retailer_id`, `product_id`, canonical URL, title, structured attributes с provenance, `price {amount,currency,observed_at}`, `availability {status,region_code,observed_at}`, варианты/размеры при наличии, image URL только с разрешённого retailer-домена, `feed_version`, `fetched_at`, `expires_at`.

Запрещено: произвольный HTML, tracking query в сохраняемом canonical URL, скрытые affiliate-переходы, пользовательские/гардеробные ID, claims о fit/совместимости без источника. `unknown` лучше догадки.

### 4.3 Provider boundary

```text
RetailSearchService
  -> QueryPlanner (минимизация + hard/soft constraints)
  -> RetailCatalogAdapter[] (только allowlisted feed/API)
  -> Normalizer + provenance
  -> Freshness/availability/region/price hard filters
  -> Structured recall
  -> optional embedding recall/rerank
  -> OutfitUpliftRanker
  -> SafePresenter (qualitative reasons, freshness, disclosure)
```

Каждый адаптер имеет manifest: владелец договора, разрешённые endpoint/domain, auth method, rate limits, permitted caching/retention, attribution, affiliate disclosure, SLA, schema mapping, deletion process и kill switch. Роботы, браузерный scraping и обход антибот-защиты запрещены.

## 5. Structured attributes и embeddings

Минимальная каноническая таксономия коррелирует с `GarmentStyleFeatures`: category/subcategory, color roles/family/lightness/saturation/temperature, pattern, texture/material, fit, volume, length, formality, season, warmth, accentness. Дополнительно для retail: brand, variant/size system, composition claims, care claims, price, currency, availability, region and timestamps.

Нормализация должна быть детерминированной, версионированной и обратимой до retailer value. Неизвестные значения не маппятся в ближайшее «похожее». User-confirmed и retailer-claimed поля хранятся раздельно.

Embeddings разрешены только если одновременно выполнено следующее:

- отдельный privacy/security/vendor review и зафиксированная модель/версия;
- embedding строится из allowlisted каталожных полей или разрешённого каталожного изображения, но не из фото пользователя/личного flat-lay;
- вектор не содержит user ID и не используется для cross-user профилирования;
- hard-фильтры category/region/stock/price применяются независимо от similarity;
- structured-only выдача остаётся рабочим fallback;
- offline eval доказывает прирост recall/nDCG без ухудшения constraint violation rate и без необъяснимых top results.

## 6. Ranking по приросту образов

Для каждого безопасного offer создаётся **эфемерный нормализованный кандидат**, не личная вещь. Candidate engine запускается локально/в доверенном сервисе на личном гардеробе плюс этот anchor. Retailer никогда не получает гардероб.

Внутренний `OutfitUpliftScoreV1` может включать:

1. `valid_outfit_gain`: число новых валидных комплектов относительно baseline, capped/log-scaled;
2. `coverage_gain`: сколько целевых поводов/сезонов/слотов закрыто;
3. `wardrobe_reuse`: использование существующих, особенно редко задействованных вещей;
4. `diversity_gain`: новые силуэты/палитры без near-duplicate inflation;
5. `personal_compatibility`: только разрешённые явные предпочтения и consented learning;
6. `catalog_confidence`: полнота атрибутов, freshness, точность availability;
7. штрафы: цена вне soft target, неизвестный size/материал, stale offer, near duplicate.

До scoring применяются hard exclusions: неправильный слот, недоступный регион, `out_of_stock`, цена вне hard budget, нарушенный явный constraint, unsafe URL/source, истёкший offer. Tie-breaker детерминирован: freshness, completeness, normalized price, retailer/product ID. Affiliate margin, комиссия и рекламный boost не влияют на organic ranking; sponsored placement, если появится, отделяется и маркируется.

Пользователь видит `high | useful | limited` и 2–3 факта: что завершает, с какими личными вещами проверено, что неизвестно. Внутренний score/trace остаётся аудируемым, но не публикуется как ложная точность.

## 7. Наличие, цена и регион

- Цена и наличие — снимок, а не обещание; рядом показывается `Проверено <время>` и ссылка `Проверить у магазина`.
- Offer истекает по retailer SLA. После `expires_at` он исключается или маркируется `не удалось подтвердить`; stale цена не сортируется как актуальная.
- Регион обязателен для stock result. При отсутствии региона возвращается nationwide/online-only результат либо запрос выбора региона — без IP geolocation по умолчанию.
- Валюта не конвертируется без утверждённого rate source и timestamp; MVP фильтрует в одной выбранной валюте.
- Размер `unknown` не равен available. Если retailer даёт лишь общее наличие, UI не пишет «ваш размер есть».
- Перед outbound переходом URL повторно проверяется по allowlist; пользователь видит магазин, цену, freshness и факт внешнего перехода.

## 8. Fallback и error taxonomy

| Код | Поведение |
|---|---|
| `CATALOG_UNAVAILABLE` | Последние данные только если ещё fresh; иначе structured checklist и retry |
| `NO_REGION` | Предложить выбрать coarse-регион или показать online/nationwide |
| `NO_SAFE_OFFERS` | Пустая выдача с сохранёнными фильтрами, без рекламной подмены |
| `NO_EXACT_MATCH` | Явно предложить ослабить один soft constraint; hard constraint не менять автоматически |
| `STALE_PRICE_OR_STOCK` | Скрыть purchase CTA, оставить «Проверить у магазина» либо исключить |
| `INSUFFICIENT_ATTRIBUTES` | Понизить confidence; не запускать embedding как способ выдумать факты |
| `OUTFIT_ENGINE_NO_CANDIDATE` | Объяснить, какой слот/constraint не закрыт; показать checklist |
| `EMBEDDING_UNAVAILABLE` | Продолжить structured-only без деградации privacy |
| `RATE_LIMITED` | Backoff/retry-after; не fan-out повторно |
| `PROVIDER_POLICY_BLOCKED` | Kill switch конкретного адаптера, остальные адаптеры продолжают работу |

Последний безопасный fallback всегда продуктовый: «Ищите: чёрные лоферы, regular fit, demi-season, до 12 000 ₽; проверьте материал и наличие размера». Он строится только из подтверждённых constraints.

## 9. Privacy, security и коммерческая честность

- Separate purposes/consents: личный wardrobe matching, optional learning, retailer outbound/affiliate analytics. Отказ от learning не блокирует базовый structured ranking.
- Не отправлять retailer историю образов, реакции, профиль, email/телефон, фото или точный регион. Запрос к retailer не должен быть user-linkable; proxy/cache logging минимизирован и имеет retention.
- Analytics — allowlisted события без query text, URL, SKU+user сочетания, фото и wardrobe IDs: `retail_search_started`, `results_state`, `offer_opened`, `fallback_shown`; coarse buckets для latency/result count/price.
- Canonical URL и изображения проходят SSRF/domain/content-type/size проверки; никакого retailer HTML в DOM.
- Feed payload считается недоверенным: schema validation, length limits, Unicode normalization, escaping, malware-safe asset policy.
- Пользователь управляет сохранением retail-вещи. До подтверждения она temporary; отмена удаляет intent/draft согласно retention contract.
- Партнёрские отношения и sponsored results раскрываются до клика. Цена подписки 499/999 ₽ не смешивается с ценой товара; экономия не заявляется без доказуемой baseline.

## 10. Тарифы 499/999 ₽

До решения Product/Billing действует один безопасный контракт:

- поиск не делает локальных предположений о плане;
- API получает opaque entitlement codes и серверные remaining/reset values;
- basic fallback/checklist доступен даже при исчерпанной сетевой квоте;
- demo не расходует personal entitlement и не создаёт личные данные;
- UI заранее объясняет, что считается запросом, остаток и reset date;
- нельзя заявлять разные retailer coverage, embedding quality, unlimited search или приоритет для 499/999 ₽ без утверждённой экономики и enforcement.

**Зависимость HOLD:** утвердить матрицу, например `retail_search_structured`, `retail_search_embedding`, `retail_search_monthly_limit`, но не привязывать её к конкретному плану в этой спецификации.

## 11. Acceptance criteria

### Contract / unit — достаточно для PASS прототипа

- [ ] JSON Schema для intent/offer/provider manifest принимает canonical fixtures и reject-ит unknown version, unsafe URL, отрицательную/чужую валюту цены, отсутствующие timestamps и неизвестную provenance.
- [ ] Query minimizer доказывает snapshot-тестом отсутствие photo/user/contact/precise-location/wardrobe payload.
- [ ] Demo и personal corpora физически/логически разделены; mixed input fail-closed с устойчивым кодом.
- [ ] Все hard constraints применяются до embedding/ranking; property tests дают 0 выдач с wrong slot/region, out-of-stock, hard-budget violation.
- [ ] Structured-only режим формирует детерминированную выдачу и работает при отключённых embeddings.
- [ ] Outfit uplift считается через существующий candidate contract, сохраняет anchor invariant и не публикует numeric score.
- [ ] Tie-breaker стабилен при перестановке входных offers; duplicate variants не раздувают uplift.
- [ ] Stale/missing price, stock, size и attributes никогда не отображаются как подтверждённые.
- [ ] Каждый empty/error code имеет честный fallback; нет fabricated offers или silent filter relaxation.
- [ ] Temporary offer не попадает в личный гардероб/образы без отдельного явного save confirmation.
- [ ] Entitlement adapter использует только server response; demo и checklist корректны при unavailable/denied/quota-exhausted.

### Integration / launch — обязательны для снятия HOLD

- [ ] Подписан минимум один retailer feed/API contract с правом показа, кеширования, цены/наличия и attribution; scraping отсутствует.
- [ ] Security/privacy/legal review покрывает vendor, data map, retention, affiliate disclosure, URL/image safety и kill switch.
- [ ] Freshness SLA и мониторинг измеряют feed age, stock/price mismatch, adapter errors и emergency disable.
- [ ] Offline relevance set содержит similar/missing-slot, разные бюджеты/регионы/пустые результаты; зафиксированы Recall@K, nDCG@K, valid-outfit gain и constraint violation rate = 0 для hard rules.
- [ ] Embedding rollout, если нужен, проходит отдельный A/B gate против structured-only; rollback не ломает поиск.
- [ ] UX QA на 320/360/390/412/430/1280: loading/empty/stale/offline/quota, keyboard/SR, touch targets ≥44 px, без horizontal overflow.
- [ ] Реальные переходы показывают retailer, актуальность и disclosure; redirect allowlist и canonicalization протестированы.
- [ ] Product/Billing утвердили различия 499/999 ₽, лимиты, reset, cost ceiling и copy; backend enforcement подтверждён.
- [ ] Production auth/Supabase остаются отдельным release gate; VK ID не является зависимостью и остаётся research backlog.

## 12. Риски и меры

| Риск | Уровень | Мера / gate |
|---|---:|---|
| Устаревшие цена и stock | высокий | timestamps, TTL/SLA, hide CTA, mismatch monitoring |
| «Рекомендация» выглядит рекламой | высокий | organic rank без комиссии, sponsored separation/disclosure |
| Утечка гардероба/фото retailer | критический | minimizer, proxy boundary, negative payload tests, no photo embeddings |
| Нарушение лицензии каталога | критический | contract manifest, no scraping, kill switch |
| Embedding обходит hard rules | высокий | hard filters before/after ANN, structured fallback, violation gate = 0 |
| Uplift предпочитает однотипные вещи | средний | baseline delta, dedupe, diversity/rare-item reuse, cap/log scale |
| Ошибочные retailer attributes | высокий | provenance, unknown-safe UI, user confirmation before save |
| Регион/размер создают sensitive profile | средний | explicit coarse region, request scope, no body inference, retention |
| Сетевая стоимость не сходится с 499/999 ₽ | высокий | server entitlements, quotas/cost telemetry, no unlimited promise |
| Demo загрязняет personal ranking | высокий | separate repositories/source validation, fail-closed mixed input |

## 13. Зависимости

1. **Product/Billing:** entitlement и экономика тарифов 499/999 ₽.
2. **Retail partnerships/legal:** разрешённые feed/API, лицензия, attribution/affiliate rules, SLA.
3. **Stylist engine:** стабильные missing-slot codes, ephemeral-offer adapter, внутренний ranking trace.
4. **Taxonomy/data:** versioned retailer mapping, provenance, dedupe/canonical product identity.
5. **Privacy/security:** minimization, retention, vendor review, proxy logging, URL/image validation.
6. **UX/content:** stale/unknown/empty copy, disclosure, region/budget controls, demo/personal labels.
7. **QA/evals/observability:** gold set, hard-constraint tests, feed freshness and mismatch monitoring.
8. **Auth/platform:** только существующий personal-action gate; реализация auth/Supabase вне CAPSULE-04. VK ID — только research backlog.

## 14. Следующие задачи

1. **CAPSULE-04-CONTRACT-01:** утвердить taxonomy, JSON Schemas intent/offer/provider manifest и stable error codes на fixtures без сети.
2. **CAPSULE-04-RANK-02:** сделать offline evaluator outfit-uplift поверх синтетического каталога; сравнить category/filter baseline, structured rank и optional embeddings.
3. **CAPSULE-04-PRIVACY-03:** threat model/data map, payload minimizer tests, retention и allowlisted analytics review.
4. **CAPSULE-04-FEED-04:** выбрать одного партнёра и заполнить provider manifest; подтвердить договор/TTL/region/price/stock semantics без интеграции.
5. **CAPSULE-04-UX-05:** кликабельный no-network prototype для similar/missing/stale/empty/quota/demo; moderated test на понимание «что добавит к гардеробу».
6. **CAPSULE-04-PLAN-06:** Product/Billing decision record для 499/999 ₽: codes, limits, reset, checklist fallback и максимальная себестоимость запроса.
7. **CAPSULE-04-SEC-07:** URL/image/feed validation design, adapter kill switch и incident runbook.
8. **CAPSULE-04-LAUNCH-08:** только после снятия HOLD — отдельное разрешение на production-код и сеть, canary одного provider, monitoring и rollback.

## 15. Итоговый gate

**PASS:** архитектура, контракты и offline/no-network prototype безопасно совместимы с текущими structured stylist contracts, временным shopping anchor, personal-only wardrobe, demo/personal separation и privacy boundary.

**HOLD:** production-каталог, embeddings и пользовательский запуск до одновременного выполнения retailer/legal, privacy/security, freshness/eval, entitlement 499/999 ₽ и отдельного разрешения на изменение production-кода. Auth/Supabase и VK ID не входят в реализацию CAPSULE-04.
