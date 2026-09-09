# CAPSULE-07 — монетизация капсул

**Дата:** 21.08.2026  
**Scope:** продуктовая и экономическая спецификация; production-код, авторизация и Supabase не изменялись  
**Статус:** **PASS для customer-development и pricing experiments / HOLD для production-монетизации**

## 1. Управленческое решение

Зафиксировать трёхуровневую модель **Free / 499 ₽ / 999 ₽** и проверять капсулу как отдельный измеримый job-to-be-done, а не как искусственный лимит на базовый гардероб. Free обязан довести пользователя до первой доказанной пользы: demo → первая личная вещь → первый образ → сохранение. Paywall до этого момента запрещён действующим UX-контрактом.

Предлагаемая коммерческая архитектура:

1. **Free** — попробовать стилиста и поддерживать небольшой активный гардероб; без affiliate-ранжирования и без ухудшения рекомендаций ради продажи.
2. **499 ₽/мес.** — регулярный личный стилист и практические капсулы из своего гардероба.
3. **999 ₽/мес.** — более частые/сложные сценарии и расширенная работа с пробелами гардероба; не обещать Objective V3, распознавание или иные дорогие функции как unlimited до появления backend enforcement и подтверждённой себестоимости.
4. **Разовая капсула** — самостоятельная покупка результата для пользователя без подписки. Рабочая гипотеза цены: **499 ₽ за одну капсулу**. Альтернатива для теста — 399/599 ₽; ни одна цена пока не является утверждённой.
5. **Affiliate** — только дополнительная выручка после независимого stylist ranking, с явной маркировкой и без эксклюзивности. Не учитывать affiliate-доход в базовой окупаемости до фактической атрибуции возвратов и отмен.

**Почему production HOLD:** в проекте нет зафиксированного billing/refund/receipt-контура, server-owned entitlement enforcement, фактической cost telemetry по капсуле и доказанной willingness-to-pay. Текущие тарифы 499/999 ₽ — продуктовый контракт, но состав прав, квоты и reset semantics ещё требуют решения.

## 2. Определение продукта «капсула»

Капсула — версионированный результат под одну цель: сезон, поездка, рабочая неделя или событие. Она строится из подтверждённых personal-вещей и, при согласии пользователя, списка недостающих категорий.

Минимальный deliverable:

- цель, горизонт и ограничения капсулы;
- 8–15 подтверждённых вещей либо явно обозначенный неполный набор;
- не менее 10 технически валидных сочетаний при достаточном составе гардероба;
- объяснение роли каждой вещи и погодных/ситуационных ограничений;
- матрица повторного использования, а не обещание «идеального стиля»;
- список пробелов по категориям и объективным признакам, без навязывания конкретного продавца;
- статус каждого элемента: `personal`, `demo_reference` или `affiliate_candidate`;
- версия входного wardrobe snapshot и возможность пересобрать результат после исправления данных.

Если данных недостаточно, продукт не выдаёт ложную полноценную капсулу: показывает, чего не хватает, и предлагает ручное дополнение. Фото человека, выводы о теле/демографии и production recognition не требуются.

## 3. Тарифная матрица — гипотеза для проверки

| Возможность | Free | 499 ₽/мес. | 999 ₽/мес. | Разовая капсула 499 ₽ |
|---|---|---|---|---|
| Demo и первая личная ценность | Да | Да | Да | Да до покупки |
| Активный гардероб | Стартовый лимит 50 вещей; дальнейшая квота требует уточнения | 50 стартовых + гипотеза 10 вещей/мес. | 50 стартовых + гипотеза 15 вещей/мес. | Не меняет тарифную квоту |
| Обычные образы | Ограниченный прозрачный месячный объём; определить по cost baseline | Увеличенный объём | Максимальный bounded-объём | Только внутри купленной капсулы |
| Капсулы | Preview структуры, без полного результата | 1 активная пересборка/мес. — гипотеза | До 3 активных пересборок/мес. — гипотеза | 1 цель, 1 результат, 2 пересборки за 30 дней — гипотеза |
| История/объяснения/feedback | Базово | Полно | Полно | Для купленного результата |
| Gap list без магазинов | Краткий preview | Да | Да | Да |
| Affiliate-кандидаты | Только по явному запросу | Только по явному запросу | Только по явному запросу | Только по явному запросу |
| Дорогие beta-функции | Нет обещания | Только если entitlement явно выдан | Bounded beta, не unlimited | Не включены по умолчанию |

Число капсул, обычных образов и пересборок — **не факт и не готовое entitlement-решение**, а стартовые параметры эксперимента. «Активная пересборка» должна быть определена как вычислительная операция, а не просмотр уже сохранённого результата. Просмотр, экспорт и удаление купленного результата нельзя тарифицировать повторно.

### Защита от путаницы и каннибализации

- Разовая капсула не включает автопродление и не должна маскироваться под подписку.
- После покупки можно предложить зачесть уплаченную сумму в первый месяц 999 ₽ только как отдельный эксперимент с понятным сроком и без prechecked согласия.
- Подписка продаёт регулярность и обновление контекста; разовая покупка — конечный результат под одну цель.
- Downgrade не удаляет ранее созданные капсулы: они остаются доступны read-only/export/delete; новые пересборки следуют текущему entitlement.
- Quota UI показывает, что считается операцией, остаток и дату reset; никаких таймеров дефицита и скрытых ограничений.

## 4. Affiliate и конфликт интересов

### Неприкосновенный порядок принятия решения

1. Stylist engine строит категорийный gap и независимый ranking по пригодности.
2. Коммерческий слой ищет товары только после этого и только по явному действию пользователя «Показать варианты покупки».
3. Наличие комиссии не может поднять товар выше более подходящего некомиссионного варианта.
4. Если нейтрального сравнения нет, UI показывает категорию/критерии без товарной ссылки.

### Обязательная маркировка

Рядом с каждой коммерческой ссылкой: **«Партнёрская ссылка: мы можем получить комиссию. Цена для вас не меняется. Комиссия не влияет на рекомендации.»** Если цена для пользователя потенциально меняется, последнюю фразу про цену не использовать. Общая disclosure-страница не заменяет маркировку рядом с CTA.

Пользователь должен видеть:

- почему рекомендована категория и конкретный товар;
- продавца, актуальность цены и факт возможной комиссии;
- альтернативу «искать самостоятельно» и возможность скрыть магазины;
- sponsored placement, если он когда-либо появится, отдельно от stylist recommendation. Для первого релиза sponsored placement рекомендуется запретить.

### Governance

- ranking trace фиксирует score до commercial join и после него; допустимо только добавление availability/price, не affiliate rate;
- договоры с партнёрами не дают эксклюзивность категории и не требуют минимального трафика;
- weekly audit сравнивает affiliate и non-affiliate позиции по кликам, возвратам, отказам и пригодности;
- kill switch отключает партнёра, ссылки или весь commercial layer без потери самой капсулы;
- telemetry не содержит фото, filename, free text, точный город или raw shopping payload; affiliate partner не получает профиль/гардероб, только обычный переход с минимальным атрибуционным идентификатором после правовой проверки;
- marketing consent, garment processing consent и переход по affiliate-ссылке не объединяются.

## 5. Unit economics: модель, а не прогноз

Ниже — **явные допущения для sensitivity analysis**. Они не являются фактической себестоимостью, конверсией или прогнозом продаж. Все значения нужно заменить наблюдениями пилота.

### Формулы

```text
NetRevenue = GrossPrice × (1 − PaymentRate − RefundRate − TaxRate*)
VariableCost = AI + image/storage/egress + weather/catalog + support + fraud/refund ops
Contribution1 = NetRevenue − VariableCost
ContributionMargin = Contribution1 / NetRevenue
MonthlyLTV_contribution = ARPPU_net × ContributionMargin / PaidMonthlyChurn
AllowableCAC = MonthlyLTV_contribution × chosen_payback_share
AffiliateNet = confirmed_commission_after_returns − attribution/vendor_cost
```

`TaxRate*` зависит от юридической/налоговой модели и в baseline не подменяется выдуманным числом. До решения finance/legal считать сценарии **до налога** и отдельно показывать налог, а не объявлять contribution после налога.

### Учебный сценарий до налога

Допущения: payment fee 3%, refund/chargeback reserve 2%; переменная себестоимость — 90 ₽/мес. для 499, 230 ₽/мес. для 999 и 110 ₽ на разовую капсулу. Support включён в эти суммы как 30/60/40 ₽ соответственно. Fixed payroll, разработка, marketing CAC и налог не включены.

| SKU | Цена | Net до налога после 3% fee и 2% reserve | Переменная себестоимость | Contribution 1 | CM до налога |
|---|---:|---:|---:|---:|---:|
| 499 subscription | 499 ₽ | 474 ₽ | 90 ₽ | 384 ₽ | 81% |
| 999 subscription | 999 ₽ | 949 ₽ | 230 ₽ | 719 ₽ | 76% |
| Разовая капсула 499 | 499 ₽ | 474 ₽ | 110 ₽ | 364 ₽ | 77% |

Округление — до рубля. Высокая расчётная маржа здесь означает лишь, что выбранные допущения мягкие; это не доказательство жизнеспособности. Например, при себестоимости 400 ₽ contribution тарифа 499 падает примерно до 74 ₽ до налога и CAC, поэтому per-job cost cap обязателен.

### Обязательные измерения

- реальные payment fee, refund, chargeback и налоговый режим;
- compute/storage/egress cost на `outfit`, первичную капсулу и пересборку по версии pipeline;
- p50/p95 jobs на платящего пользователя и доля retry/failure;
- support minutes × fully loaded cost по SKU;
- paid churn отдельно для 499 и 999, reactivation и involuntary churn;
- CAC по каналу без смешения organic/affiliate;
- affiliate commission только после возвратного окна, отмен и расхождений атрибуции.

Affiliate-доход в base case равен **0 ₽**, пока нет трёх последовательных месячных reconciliation с продавцом. После этого показывать его отдельной строкой, а не субсидировать им видимую цену подписки.

## 6. Pricing experiments

Эксперименты запускаются последовательно после instrumentation и с заранее записанной гипотезой. Один пользователь видит одну непротиворечивую цену; уже купленный entitlement не ухудшается задним числом.

| ID | Гипотеза | Дизайн | Primary metric | Guardrails | Решение |
|---|---|---|---|---|---|
| P1 Packaging | 499 и 999 различаются регулярностью/сложностью понятнее, чем абстрактным «Pro» | 5–7 moderated tests + fake-door без оплаты | корректное объяснение различий | confusion, perceived pressure | Переписать, если <80% участников верно называют различия |
| P2 One-off demand | Разовая капсула привлекает пользователей, не готовых к подписке | random offer 399/499/599 после preview; без списания до готового billing | qualified purchase intent / eligible exposure; затем paid conversion | refund intent, support, subscription cannibalization | Выбрать не максимум конверсии, а лучший contribution при guardrails |
| P3 Subscription anchor | 999 повышает выбор регулярного продукта без deceptive anchoring | 499/999 с одинаковой честной структурой карточек; контроль — 499 + «не выбрано» | paid conversion и net revenue/eligible | 7/30-day cancellation, plan confusion | Оставить только при устойчивом net lift без guardrail harm |
| P4 Credit | Зачёт разовой капсулы в первый месяц 999 уменьшает риск перехода | после успешной разовой покупки: no-credit vs explicit 30-day credit | upgrade within 30d | refund, mistaken renewal, complaints | Запускать только с явным opt-in к renewal |
| P5 Affiliate UX | Нейтральный gap list сохраняет доверие лучше, чем товарная лента по умолчанию | user-triggered links vs links shown immediately | usefulness + qualified click | trust score, hide-shopping, returns | Предпочесть user-triggered, если коммерческий lift не компенсирует trust harm |

Fake-door собирает только privacy-safe событие интереса и показывает «функция исследуется»; нельзя собирать платёж или обещать дату поставки. Минимальный размер выборки определяется power analysis после baseline, а не произвольным числом. Результаты сегментируются по варианту продукта и источнику трафика, но не по выведенным демографическим/телесным признакам.

## 7. Kill criteria

### Немедленный kill / rollback

- любой случай скрытого автопродления, неверной цены, двойного списания или невозможности отменить/получить положенный refund;
- paywall блокирует первый сохранённый образ или demo смешивается с personal entitlement;
- entitlement вычисляется клиентом, расход квоты недетерминирован либо просмотр списывает операцию;
- affiliate rate влияет на ranking или партнёру передаются фото/гардероб/профиль без отдельного законного контракта;
- disclosure отсутствует рядом с коммерческим CTA;
- удаление аккаунта/экспорт/удаление купленного результата блокируются тарифом;
- p95 себестоимости одной операции может съесть contribution, а hard cost cap/kill switch отсутствует.

### Kill после пилотного окна

Пороговые значения ниже — **решающие гипотезы**, их надо утвердить до запуска:

- SKU HOLD, если нижняя граница согласованного confidence interval для Contribution 1 ≤ 0;
- price variant kill, если refund + chargeback >8% или 30-day complaint rate >3% при минимум 100 завершённых платежах;
- 999 packaging kill, если ≥15% опрошенных покупателей не могут верно объяснить отличие от 499 или если 7-day cancellation хуже 499 более чем на 10 п.п.;
- one-off kill/reprice, если медианная фактическая variable cost >50% net revenue либо ≥20% покупателей требуют ручной переделки сверх обещанных двух пересборок;
- affiliate partner kill, если confirmed return/cancel rate выше собственного non-affiliate baseline на 10 п.п., reconciliation расходится >2%, disclosure complaints >1%, либо audit находит хотя бы один commission-driven rank change;
- эксперимент kill, если любой privacy/security incident связан с его событиями или vendor payload.

Проценты не описывают текущие данные проекта; это предлагаемые pre-registered границы. При малой выборке решение остаётся HOLD, а не автоматически PASS.

## 8. Риски и меры

| Риск | Уровень | Мера |
|---|---|---|
| Пользователь платит за красиво оформленный, но технически слабый результат | P0 | capsule quality gate, incomplete state, refund/remake policy, frozen eval cases |
| Конфликт affiliate подрывает доверие к стилисту | P0 | ranking-before-commerce, disclosure, audit trace, partner/global kill switch |
| Локальный счётчик расходится с серверным правом | P0 | только server-owned entitlement; idempotent usage ledger; UI не источник истины |
| Смешение demo/personal/paid данных | P0 | source badge на вещах, отдельные snapshots, запрет сохранения demo как personal |
| Цена обещает функции, которых нет или чья цена неизвестна | P1 | bounded wording, feature-level entitlement, cost cap; Objective V3 только beta |
| Разовая капсула каннибализирует 999 | P1 | разные jobs, cohort net revenue/contribution, credit experiment вместо догадки |
| Непредсказуемая стоимость пересборок и retries | P1 | idempotency, per-job budget, cached immutable result, retry не списывает квоту |
| Dark patterns/ошибочное автопродление | P0 | explicit renewal consent, receipt, cancellation in-product, no prechecked boxes |
| Affiliate-атрибуция завышает доход до возврата | P1 | confirmed-only ledger, возвратное окно, base case = 0 ₽ |
| Privacy leakage через commerce analytics | P0 | pseudonymous scoped ID, event allowlist, no photos/free text/exact city |

## 9. Зависимости

1. Подписанное entitlement-решение: точный состав Free/499/999, что расходует лимит, reset timezone/date, grace/downgrade/refund semantics.
2. Capsule quality contract и evaluation dataset, согласованные с `MVP-MAGIC-05`: hard constraints, incomplete state, ranking trace, feedback/remake.
3. Billing provider/legal/finance decision: чеки, налоги, recurring consent, cancellation, refund, chargeback, minors и consumer disclosures.
4. Server-owned billing/entitlement/usage ledger и idempotency. Это будущая зависимость; CAPSULE-07 не разрешает менять текущую auth/Supabase-реализацию.
5. Privacy review для commerce analytics, attribution vendors и disclosure copy.
6. Cost telemetry с pipeline version и отделением demo/personal/paid jobs.
7. Product analytics: eligible exposure, offer, checkout, success/failure, entitlement grant, usage, refund/cancel — без запрещённых payload.
8. Partner due diligence: ассортимент, цена/availability freshness, возвраты, feed license, SLA, security, deletion и reconciliation.
9. Customer support runbook и owner для pricing/partner kill switches.

VK ID, OAuth/provider selection и Supabase находятся **вне scope**; VK ID остаётся только исследовательским backlog и не является зависимостью pricing research.

## 10. Acceptance criteria следующего gate

### Product/UX

- [ ] Пользователь получает первый demo и первый сохранённый личный образ до paywall.
- [ ] На одном экране однозначно показаны Free/499/999: права, лимиты, что считается операцией, reset и renewal.
- [ ] Разовая капсула явно не является подпиской; срок пересборок и refund/remake policy видны до оплаты.
- [ ] Купленный результат доступен для просмотра/export/delete после downgrade; платными остаются только новые вычисления.
- [ ] Personal/demo/affiliate assets визуально и в данных различимы; неизвестное не выдаётся за подтверждённое.
- [ ] Accessibility/mobile QA покрывает 320/360/390/412/430/1280, keyboard, screen reader, touch ≥44 px и отсутствие горизонтального overflow.

### Economics/billing

- [ ] Для каждого SKU утверждены формула и владелец COGS; dashboard показывает p50/p95 variable cost и Contribution 1 без affiliate.
- [ ] Entitlement и usage ledger server-owned, versioned и idempotent; retry/failure не создаёт двойного списания денег или квоты.
- [ ] Sandbox/payment E2E покрывает success, decline, timeout, duplicate callback, refund, chargeback, cancel, renewal, downgrade и restore purchase.
- [ ] Налоги/чеки/refund/recurring disclosure подтверждены finance/legal; forecast и observed данные явно разделены.
- [ ] До первого production experiment зафиксированы sample-size method, primary metric, guardrails и kill owner.

### Affiliate/trust/privacy

- [ ] Независимый stylist ranking сохраняется до commercial join; автоматический тест запрещает affiliate rate в ranking features.
- [ ] Disclosure находится рядом с каждой ссылкой; sponsored и organic никогда не выглядят одинаково.
- [ ] Есть non-affiliate/self-search fallback и настройка скрыть commerce.
- [ ] Vendor получает только минимальный атрибуционный payload; фото, wardrobe snapshot, free text, точный город и auth ID запрещены.
- [ ] Partner reconciliation учитывает отмены/возвраты; affiliate не входит в base case до трёх закрытых reconciliation periods.
- [ ] Partner и global kill switches проверены без потери personal capsule data.

### Release decision

- [ ] Ни один немедленный kill criterion не нарушен.
- [ ] Quality gate капсулы проходит на frozen synthetic corpus; пилот отдельно подтверждает воспринимаемую полезность, не выдавая её за synthetic факт.
- [ ] Независимый QA подтверждает demo/personal/privacy separation и отсутствие paywall regression.
- [ ] Решение PASS/HOLD подписано Product, Finance, Privacy/Legal и Engineering; отсутствие данных означает HOLD.

## 11. Следующие задачи

1. **CAPSULE-08 — entitlement decision record:** утвердить точные права Free/499/999 и разовой капсулы, квоты, reset, downgrade и credit policy.
2. **CAPSULE-09 — capsule quality contract:** схема результата, incomplete state, frozen eval corpus, remake/refund triggers и пользовательская оценка.
3. **BILLING-01 — provider/legal spike:** платежи, чеки, recurring consent, refund/chargeback и sandbox matrix; без production-интеграции до отдельного разрешения.
4. **ECON-01 — cost instrumentation spec:** словарь cost/usage events, формулы COGS/Contribution 1, dashboard и алерты p95.
5. **PRICE-01 — comprehension research:** 5–7 moderated tests на синтетическом гардеробе; проверить различимость 499/999 и понимание разовой покупки.
6. **PRICE-02 — preregister experiments:** P1–P5, power analysis после baseline, guardrails, owners и rollback.
7. **AFFILIATE-01 — neutrality contract:** ranking isolation, disclosure copy, vendor payload allowlist, reconciliation и kill switches.
8. **LEGAL-01 — Russia consumer/privacy review:** оферта, автопродление, возвраты, реклама/affiliate disclosure, обработчики и локализация.
9. **QA-CAPSULE-01 — release matrix:** billing failure paths, quota idempotency, mobile/a11y, privacy, demo/personal separation и downgrade retention.
10. **BACKLOG-RESEARCH-VK-ID:** оставить только исследованием; не связывать с монетизационным gate и не реализовывать в этой волне.

## 12. Финальный PASS/HOLD

**PASS:** модель Free / 499 / 999 + отдельная разовая капсула + опциональный affiliate пригодна для customer-development, fake-door и offline pricing research. Unit economics описана проверяемыми формулами, явными допущениями и kill criteria.

**HOLD:** любые реальные списания, автопродление, выдача paid entitlements и affiliate traffic в production. Снять HOLD можно только после выполнения acceptance criteria, появления наблюдаемой себестоимости и независимого QA неизменного release candidate. Ни одна приведённая конверсия, стоимость, churn или маржа не является прогнозом либо фактом проекта.

## 13. Внутренние контракты, с которыми сверено решение

- `docs/auth-profile-onboarding-product-contour-v1.md` — 499/999 ₽, 50 стартовых вещей, гипотеза 10–15 вещей/мес., paywall после первой ценности, server-owned entitlements, privacy-safe analytics.
- `docs/MVP-MAGIC-05-real-stylist-contract.md` — ограничения качества рекомендаций, synthetic evidence не доказывает субъективную полезность.
- `docs/MVP-MAGIC-02-first-wow-ux-spec.md` — честный demo-result и auth/personal boundary.
- `docs/AUTH-01-02-audit-and-ux-contract.md` — demo/personal separation и fail-closed personal commands.
- `docs/photo-intake-contract.md`, `docs/local-storage-boundary.md` — consent, local-first photo processing и запрет скрытой передачи данных.

