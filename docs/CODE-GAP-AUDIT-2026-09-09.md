# Аудит незавершённого кода — 2026-09-09

Статус репозитория: исходный код, migrations, CI, тесты и runtime-ассеты перенесены. Локальные QA/eval evidence, реальные данные, browser profiles, A/B contact sheets и исторические отчёты намеренно не публикуются.

Проценты ниже — инженерная оценка готовности к production, а не доля написанных файлов. `Local` означает проверяемый сценарий на одном устройстве; `production` требует живой инфраструктуры, наблюдаемости и эксплуатационных гарантий.

| Контур                       | Local | Production | Главный незакрытый разрыв                                                           |
| ---------------------------- | ----: | ---------: | ----------------------------------------------------------------------------------- |
| Гардероб и локальный профиль |   90% |        45% | нет подтверждённого cloud read/write и миграции реального пользователя              |
| Подбор образов и объяснения  |   85% |        50% | нет production quality/eval контура на репрезентативных данных                      |
| Фото вещи                    |   80% |        30% | BFF transport для бинарной загрузки не реализован; реальная CV-точность не доказана |
| Auth и account lifecycle     |   75% |        35% | BFF-сессии и rate limits находятся в памяти процесса; live OTP/RLS не проверены     |
| Privacy: export/reset/delete |   85% |        45% | local delete подтверждён, но live cloud zero-residue/revoke — нет                   |
| Капсулы                      |   75% |        30% | local/default-off; нет pilot value, cloud и entitlement-контракта                   |
| Метрики                      |   70% |        20% | collector и dashboard локальные, внешнего ingestion/alerting нет                    |
| Mobile/a11y                  |   75% |        55% | автоматические проверки есть, real-device и screen-reader gate не закрыты           |
| Retail/checkout/payments     |   15% |         5% | runtime-интеграции отсутствуют; есть только продуктовые контракты                   |

## Критический backlog

1. **P0 — durable BFF session store.** Заменить `Map` в `server/authBff.mjs` на server-side store с TTL, rotation, revoke и multi-instance semantics. Текущий процесс теряет все сессии при рестарте.
2. **P0 — единый photo upload через BFF.** `SupabaseDataPort` умеет `rawBody/returnResponse`, а `BffAuthAdapter` этот режим fail-closed отклоняет. При BFF-auth production-загрузка фото не завершена.
3. **P0 — live Supabase gate.** Применить migrations в отдельном проекте и автоматизировать negative A/B-owner проверки RLS, private bucket, delete/revoke. Наличие SQL в Git не является evidence работающей политики.
4. **P1 — production observability.** Добавить structured request/audit logs без PII, correlation ID, latency/error counters и alert thresholds для BFF. Локальный telemetry collector не заменяет серверный мониторинг.
5. **P1 — расширить browser gate.** Сейчас smoke покрывает минимальный local path. Нужны сценарии auth recovery, photo privacy/delete и mobile critical path на чистом профиле.
6. **P1 — вынести orchestration из `src/main.jsx`.** Файл остаётся крупной точкой связанности и усложняет безопасные изменения, тестирование и lazy loading.
7. **P1 — CV release contract.** Зафиксировать одобренную модель, provenance/version, ресурсные лимиты и quality thresholds; `productionEvidence: false` должен оставаться до независимой проверки.
8. **P1 — production analytics boundary.** Определить consent, минимальную схему событий, retention, deletion и owner dashboard до подключения внешнего ingestion.
9. **P2 — dependency/update policy.** Добавить плановый dependency review и renovate/dependabot policy, сохраняя lockfile и обязательный verify gate.
10. **P2 — коммерческий контур.** Не реализовывать checkout до owner-решений по тарифам, entitlement, возвратам, retailer data rights и legal/privacy review.

## Следующий технический пакет

Максимальная отдача: пункты 1–4 как отдельные небольшие PR. Сначала интерфейс durable session store и тесты без выбора vendor, затем BFF photo proxy, live-RLS workflow для owner-controlled environment, после этого observability. Это снимает основные архитектурные блокеры, не выдавая локальные тесты за production readiness.
