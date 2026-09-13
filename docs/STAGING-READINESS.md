# Готовность закрытого staging — 13.09.2026

**Решение: NO-GO для пользовательских фото и платного запуска.** Хостинг не
покупался и не развёртывался в рамках этой проверки; фото пользователей не
передавались, реальные Telegram/email уведомления не отправлялись.

Актуализировано с согласия координатора по main
`3b1202677e7721d1d32a4089a6fcbdaf44f00759`,
[IMPLEMENTATION-2026-09-10](IMPLEMENTATION-2026-09-10.md),
[runtime/cv/README](../runtime/cv/README.md) и коду. Этот документ заменяет
устаревшее описание bootstrap без декодирования и моделей; факт закрытого CLI
остаётся верным. Смета и порядок запуска:
[BUDGET-AND-LAUNCH](BUDGET-AND-LAUNCH.md).

## Реализация и её ограничения

| Область | Реализовано | Чего это не доказывает |
|---|---|---|
| Memory-only runtime | Decode/orientation/metadata stripping; GroundingDINO/SAM2 адаптеры; отдельные presence/semantic verifier; проверка точных PNG и SHA-256; нулевой скрытый RGB | Реальные веса не запускались; независимость/качество checkpoint-набора и полный transitive lock не приняты |
| Worker lifecycle | Одна задача, deadline с cold start, отмена, hard kill зависшего процесса, fault без autorestart | Нет cold/warm/load замеров реального inference; 10с цель и 20с предел не доказанный CPU SLO |
| Garment photo flow | Server-owned owner-bound кандидаты, TTL/memory bounds, повторная верификация при confirm, хранение точных разрешённых PNG в SQLite | Release predicate закрыт; клиентский флаг безопасности не даёт допуска |
| HTTP API | VK session/session/wardrobe/logout; ограниченные photo analyze/confirm/read; ограничения тела/параллельности/deadline | В штатном CLI бюджет закрыт; запросы получают HTTP 503; environment bypass нет |
| VK frontend | Opt-in VITE_VK_STAGING=true, восстановление сессии, приватные метаданные, save/read-back/logout, удаление launch query из истории | Одобренного пользовательского photo flow в этом UI пока нет; реальный VK launch не проверен |
| Legacy source boundary | Старый disk-based CV path отключён; reference draft в памяти, без новых записей исходника в IndexedDB | Исторические пользовательские browser records не удалялись; очистка требует отдельного решения |
| Budget | Durable default block и outbox 3500/4000 для Telegram+email; блокировка сохраняется после рестарта и смены месяца | Нет провайдерского ingestion/shutdown и реальных транспортов; свежий API response не гарантирует полноту начислений |
| Linux deployment | Шаблоны deploy/, запрет autorestart/core dumps | Шаблоны не развёрнуты; host-level no swap/temp/proxy spooling/network и российская локация не приняты |

`productionApproved: false` и default-deny не снимаются на основании успешных
синтетических тестов, даты конфигурации или self-report модели. Требование
гардероба: хранить только одежду без человека/лица/фона, подтверждённую независимой
проверкой именно сохранённых байтов. Текущие пороги моделей ещё не калиброваны.

## Доказательства проверок

- **Сообщение координатора 13.09.2026:** повторный `npm run verify` на указанном
  main прошёл: 489 Node tests, build, format и bundle checks. Автор этой
  документационной итерации этот полный прогон не повторял.
- **Исторические результаты из поручения:** 7 Python и 6 browser tests прошли.
  Это не свежий прогон данной ветки и не гарантия CI на её exact head.
- Python проверяет настоящие синтетические PNG/JPEG/WebP pixels и image encoding,
  но инъецирует модельные контракты. Node lifecycle действительно завершает
  зависший OS process. HTTP tests используют локальные сокеты/SQLite и synthetic
  VK signatures; browser tests — отрисованный UI с synthetic responses.
- Реальные веса, модельное качество, host-level no-disk, latency и реальный
  VK phone journey такими тестами не подтверждены.

Результаты текущих документационных проверок записываются в итоговом отчёте/PR,
не подменяют результаты исходной кодовой базы.

## Оставшиеся acceptance gates

| Приоритет | Gate | Необходимое доказательство |
|---|---|---|
| P0 | Независимая модельная безопасность | Четыре роли/checkpoint-набора, проверенные хеши всех файлов, лицензии и совместимость; presence с person+face и semantic с garment labels; реальные adversarial испытания |
| P0 | No-disk исходников на хосте | Запрет swap/core/temp/proxy buffering; отсутствие исходников в логах, дампах и backups; OS-level network denial worker |
| P0 | Budget ≤5000 ₽ с тестами | All-in котировка, bound задержки биллинга, provider controller/stop, два канала, остаточные disks/IP/backups, без auto topup/scale/resume/month-reset |
| P0 | Сохранность после budget stop | Явный срок и резерв хранения; никакого удаления по молчанию владельца; запрет использовать нулевой баланс как механизм остановки |
| P0 | Российская инфраструктура | Выбранный российский регион/договор, TLS, isolation, доступ только согласованным тестерам; отдельное разрешение расходов и развёртывания |
| P1 | Полный пользовательский сценарий | После release gates завершить photo UI; реальный VK launch, два владельца, save/read-back/logout и телефон при выключенном ноутбуке |
| P1 | Реальная производительность | Cold/warm p50/p95/p99, peak RAM, нагрузка и overload; время всех четырёх моделей и повторного confirm verifier; соблюдение 20с с hard kill |
| P1 | Linux reproducibility | Полный dependency lock и checks на exact PR head; успешный CI не означает разрешение деплоя |
| P1 | Правовая готовность | Квалифицированная оценка оператора, согласий, уведомлений, сроков и цепочки обработки; наличие российского хоста само по себе не заключение |

## Воспроизведение после отдельного разрешения среды

Для чистого Linux checkout с Node 22/24, без установки ML weights:

```sh
npm ci --ignore-scripts
npm run verify
npx playwright install --with-deps chromium
CI=true npm run test:browser
python -m pip install -r runtime/cv/requirements-test.txt
python -B -m unittest discover -s runtime/cv -p 'test_*.py'
```

Это команды для проверки, не выполненный в данной итерации запуск и не
разрешение создавать платную инфраструктуру. В CI присутствуют отдельные
`verify`, `cv-contract`, `browser-smoke`; текущий статус конкретного PR следует
проверить отдельно. `.cv-auto-runtime`, model weights и ML-зависимости не
восстанавливать на ноутбуке автоматически.

`server/stagingServer.mjs` требует `STAGING_DATA_DIR`, `STAGING_ORIGIN` (HTTPS),
`VK_APP_ID`, `VK_APP_SECRET` в приватном окружении. `node server/stagingServer.mjs`
оставляет бюджетный gate закрытым; нормальные API-маршруты существуют для
переданных зависимостей, но это не разрешение заменить gate на `true`.

Перед реальным запуском проверить весь TLS vhost и запрет access/query logs:
launch URL содержит credentials. Не включать автоматический старт после budget
block. Доказать отсутствие исходников в swap, tempfiles, proxy spooling, core
dumps и backups. SQLite/бэкап содержит только разрешённые PNG и необходимые
метаданные; исходные изображения в них не допускаются.

## Бюджет: новая проверка вместо старой предварительной оценки

В [BUDGET-AND-LAUNCH](BUDGET-AND-LAUNCH.md) приведены три расчётных конверта,
источники 13.09, все неподтверждённые строки и будущая последовательность запуска.
Публичный месячный тариф Timeweb Cloud-80 в СПб 2000 ₽ проверен непосредственно
переключателем «1 мес без скидки», а не только делением годовой цены на 0,9.
Но полная принятая котировка и hard cap пока отсутствуют.

Критические ограничения: Timeweb удаляет ресурсы через 7 дней после блокировки
за отсутствие средств и автоматически включает их после пополнения; Selectel
VDS продолжает начисления при выключении/блокировке и удаляет при непогашенном
долге через 14 дней; Yandex stop прекращает compute, но не disks/snapshots/IP.
Официальные ссылки и последствия разобраны в бюджетном документе.

**Следующий шаг:** согласовать all-in котировку и post-stop retention с владельцем
через координатора, затем реализовать и проверить provider controller. Параллельно
продолжать бесплатную подготовку модельных/инфраструктурных gates. Никаких платежей,
публикации, расширения лимита или снятия default deny автоматически.

## Сообщённые изменения параллельной серверной ветки

13.09 профильная серверная задача сообщила о подготовке `docs/SERVER-REPRODUCTION.md`,
loopback health на 8789 (`/healthz=200`, `/readyz=503`) и preflight с постоянным
`exit 2`/`deploymentReady=false`. Эти изменения **ещё не сверены здесь и не входят
в базу 3b12026**. Автор указал
[SHA 05dc895a](https://github.com/petrenkopeta-dotcom/svoy-stil-ai/commit/05dc895a295edb650adf872dd0ac03a286638f25);
PR ещё не создан. Diff и Linux CI должен проверить координатор при интеграции.
Default billing/photo deny остаются. Шаблоны tmpfs/no swap/core/network не
доказывают no-disk реального хоста.

Та же задача сообщила: сначала Windows прогон дал 490/491 из-за perf p95
1641 >1500 мс; после concurrency=2 — 491/491, format/build/bundle PASS.
Это результат другой ветки со слов её автора, не реальный model SLO и не
повторный прогон main. Локального Docker у неё нет; Linux Docker CI ожидается.
Не переносить эти числа в основной раздел доказательств без exact SHA.

## Историческая локальная граница

Исторические inventory/QA/eval и датасеты остаются локальными и исключены из Git.
Ранее упомянутые 389 tracked/5719 ignored и staging inventory относятся к снимку
10.09, не к текущему checkout. Старые коммиты `aaa9be3`, `b7803bf`, `87baece` —
история той проверки, не актуальная база. Исходная папка OneDrive используется
только read-only; разрешённые Git worktree операции изменяют общие Git metadata,
но не пользовательские исходники. Секреты не публикуются, пользовательские файлы
не удаляются. Интеграцию и merge этой волны выполняет координатор.
