# Воспроизведение серверной сборки — 13 сентября 2026

Статус: подготовка, **не разрешение на развёртывание**. Исходная ревизия
`3b1202677e7721d1d32a4089a6fcbdaf44f00759`. CPU/GPU и российский хост
не выбраны. Бюджет — максимум 5000 рублей в месяц вместе с тестами;
покупок, платных API, загрузки весов и установки Torch здесь нет.

## Чистая сборка Linux

На уже разрешённой Linux-машине, в свежем checkout этой ветки:

```sh
node --version # v24.17.0; требуется встроенный node:sqlite
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
docker build --file deploy/server.Dockerfile --tag stylist-verification .
```

Это команды сборки, не запуска сервиса. Не выполняйте их на платной машине
без отдельного согласования. CI использует ubuntu-24.04 и Node 24.17.0;
Docker проверяет серверные тесты, сборку UI и размер bundle. Общий Node suite
выполняется отдельным CI job. Python CI устанавливает только requirements-test,
не requirements-models; browser job не устанавливает ML-модели.

package-lock v3 фиксирует транзитивные npm-версии и integrity. Prettier закреплён
точно 3.9.6 и в package.json, и в lock. `npm ci` запрещает рассинхронизацию.
В packageManager сохранён npm 10.9.2; локальная проверка использовала npm 11.13.0.
Node tag Docker и ubuntu runner не являются неизменяемыми digest образов.
Это повторяемый рецепт, не обещание побитовой идентичности: для release надо
зафиксировать проверенный digest, архитектуру, npm и системные пакеты.

Docker context использует отдельный allowlist. В runtime попадают только
серверный JS и два entrypoint-скрипта; нет исходных пользовательских фото,
датасетов, весов, .env, SQLite, node_modules или UI build-инструментов.
Не помещать пользовательские данные в исходный код или четыре разрешённых
статических UI-изображения. Собирать только из проверенного свежего checkout.
Runtime-образ — закрытый Node/SQLite сервер, **не готовый CV runtime**.
Он слушает loopback; стандартный Docker port publishing не является готовой
схемой маршрутизации. Не запускать с host network ради обхода этого ограничения.

## Конфигурация и состояние

`deploy/staging.env.example` не содержит секрета. Реальный файл находится вне Git,
например `/etc/stylist/staging.env`, владелец root, права 0600. Не передавать его
как build ARG, не печатать через env/systemctl и не включать в диагностику.
`/var/lib/stylist` хранит SQLite с сессиями и метаданными; текущий CLI не подключает
photoFlow. Будущий путь хранения допускает только независимо проверенный PNG
одежды без человека и фона. Исходники фото не должны попадать в этот каталог.

`npm run server:start` запускает существующий закрытый staging listener на
127.0.0.1:8788 и отдельный status listener на 127.0.0.1:8789:

- `GET /healthz`: 200, только `{"live":true}` после старта приложения.
- `GET /readyz`: всегда 503, только `{"ready":false}` в этой ревизии.
- Другие методы, пути и query: 404 без отражения входных значений.

Health показывает жизнь процесса, не исправность моделей/SQLite/биллинга.
Readiness нельзя сделать зелёным переменной окружения. Не проксировать status
наружу. Nginx отдельно закрывает staging/photos и прежние фото-маршруты.

`npm run server:preflight` выводит только фиксированные имена и булевы проверки:
HTTPS origin без path/credentials, app id, наличие секрета, data directory, port,
Linux, Node/SQLite, отсутствие активного host swap. Всегда exit 2 и
deploymentReady=false: наличие конфигурации не является допуском к релизу.
Никаких изменений хоста, сетевых запросов или запуска моделей preflight не делает.

## Граница шаблона изоляции

systemd unit ограничивает writable paths, capabilities, devices, адреса сети,
core, swap cgroup, временные каталоги и размер памяти. Restart=no, остановка
убивает всю control group. Это шаблон только для закрытого CPU/Node сервера:
MemoryMax=1G и PrivateDevices несовместимы с неподтверждёнными требованиями CV/GPU.
PrivateTmp сам по себе не означает RAM; добавлены tmpfs для /tmp и /var/tmp.
Nginx buffering отключён, фото-вход закрыт. Эти настройки **не доказывают**
защиту реального хоста или no-disk при обработке фото.

Перед любым допуском нужен отдельный проверяемый протокол на выбранном хосте:

1. `systemd-analyze verify` и проверка эффективного unit/drop-ins, cgroup v2,
   memory.swap.max, `/proc/swaps`, core limit, crash collectors и tmpfs mounts.
2. Отсутствие hibernation, host/hypervisor memory snapshots, swap и дискового
   request spooling на каждом proxy; политики journald/APM/traces/backups.
3. Независимая network/filesystem изоляция CV-процесса: отсутствие доступа к
   SQLite, секретам и egress, read-only модели, только ограниченные RAM pipes.
   Текущий spawn worker не является отдельным security boundary. Loopback-only
   сетевые правила API не доказывают запрет доступа worker к локальным сервисам.
4. Негативные тесты write/egress/core/spooling с синтетическими данными, без фото
   пользователя; измерение cold/warm/load: цель 10с, жёсткий предел 20с.
5. Проверенный provider billing controller, релизные доказательства и явное
   решение координатора. Не использовать зелёный health как замену этих пунктов.

## Совместимость CV и оставшиеся блокеры

По согласованию с CV-задачей JSONL v1 и операции analyze/verify не меняются;
следующая CV-ревизия требует manifest schema_version:2 и отклоняет старый формат.
Четыре исследовательские роли: GroundingDINO tiny, SAM2.1 tiny, OWLv2 с queries
`a person`/`a human face`, ATR SegFormer B2. Это описание интерфейса соседней
задачи, не утверждение о наличии её изменений в данной ветке. Queries OWLv2
не доказывают face recall; SegFormer NVlabs п.3.3 ограничен research/evaluation.
Полного транзитивного Python lock пока нет: выбор CPU/CUDA,
архитектуры, четырёх checkpoints и лицензий принадлежит CV-задаче. После выбора
нужен платформенный lock всех wheels с hashes, проверка offline установки
`--no-index --require-hashes`, затем реальная интеграция. Не выдавать прямые pins
requirements-models за полный lock, не скачивать тяжёлые веса в CI или на ноутбук.
Исследуемая CV-связка не одобрена для сервиса; наличие модели с research-only
лицензией — блокер, а не основание включать фото.

Нужные исправления общего STAGING-READINESS переданы координатору: отделить
исторические mock/contract/browser прогоны от реальных моделей; убрать любые
выводы о готовом host no-disk/полном lock/SLO; отразить постоянный readiness 503,
неподключённый биллинг, невыбранный CPU/GPU и отсутствие deployment acceptance.
Общий отчёт и Notion в этой задаче не редактируются.

## Проверено в этой ветке

Windows, свежий worktree исходной ревизии, Node 24.17.0, npm 11.13.0:

- `npm ci --ignore-scripts --no-audit --no-fund`: 24 пакета, успешно.
- Первый `npm run verify`: 490/491; прежний performance-тест p95=1641мс
  при пороге 1500мс. Порог не изменён.
- После ограничения test file concurrency до 2: `npm run verify` успешно,
  491/491, format/repository boundary/build/bundle успешно; JS 541496 байт.
- Два новых теста проверяют реальные HTTP sockets status-сервера и отказ
  неоднозначной конфигурации без отражения секретов.
- `node scripts/server-preflight.mjs`: deploymentReady=false, exit 2 ожидаем;
  на Windows linux/noHostSwap=false. На хосте не запускался.

Docker build, systemd/nginx syntax и эффективная Linux-изоляция здесь не
проверялись: Docker отсутствует. Новый Linux CI job ещё должен пройти после PR.
Python/browser в этой задаче не повторялись; реальные модели не запускались.
Следующая конкретная задача — координатору проверить Linux CI этой ветки,
затем согласовать разрешённый модельный комплект, платформенный lock и отдельный
протокол приёмки российского хоста. Сейчас покупки/развёртывание от пользователя
не требуются; решения о платформе и лицензиях нужны до модельной интеграции.

## Совместная интеграция

Ветка `codex/integration-readiness` собрана от обновлённого origin/main
`3b1202677e7721d1d32a4089a6fcbdaf44f00759` без изменения main и чужих веток:

- CV `191bc6fda105585541dde65a968d8035807e36ff`;
- SEC-01 `2f1222827dac247c883fcef59e9514f29fc333f9`;
- VK `46ef738314a623b74a40ee8caf3ebc9bd6775324`;
- сервер `05dc895a295edb650adf872dd0ac03a286638f25`;
- бюджет/docs `5c56c2c81baa6713aee3b343a8b8a3c7db66ecb8`;
- security tests/docs `7f41e79963e05d097e4c2818d19acd4e53ce8676`.

Все перенесены без конфликтов. На промежуточном combined
`da0a988d6b98d29eb06530a1fc14a9ca6f043146`: Node 521/521, format/repo/build/bundle
PASS, JS 545960 байт. Предыдущий состав до security дал 497/498:
performance p95=1532мс при неизменном пороге 1500мс; это сохранённый исходный
результат, не доказательство production SLO. Python на совмещённом CV: 14/14.

Обнаруженный интеграционный пробел закрывается отдельным CI step:
`npx playwright test --config src/vkStagingClient.browser.config.js` после
`npm run test:browser`. Основной config обнаруживает 10 тестов, включая четыре
security, отдельный — два journey. Запуск последовательный, strictPort и
reuseExistingServer:false сохранены. Итоговый SHA после этой правки требует
нового полного verify, Python и обоих завершённых browser-прогонов, затем
независимой security-приёмки. Результаты точного SHA передаются координатору;
данные промежуточных прогонов не заменяют итоговую проверку.

Сверка контрактов: status wrapper сохраняет закрытые budget/photo defaults;
SEC-01 позволяет только проверенный logout при закрытом бюджете; capabilities
не открывают nginx photo ingress. CV JSONL v1 сохранён, manifest v2 пересоздаётся
вручную. Docker verify allowlist включает новые .py; shortlist JSON не требуется
ни коду, ни tests и не является manifest. Финальный Node-образ по-прежнему не
содержит Python/моделей и не предназначен для CV inference.

Linux Docker/systemd/nginx, реальный host no-disk и platform lock остаются
непроверенными. Git push работает через обычную настроенную Git-аутентификацию;
GitHub connector возвращает 403 при создании PR, GitHub CLI не установлен.
Легитимный путь к CI — создать PR опубликованной ветки в GitHub под своим
аккаунтом с правами либо через отдельно настроенный официальный CLI/API.
Извлечение credentials или обход отказа коннектора не выполнялись.

### Следующий кандидат после независимого perf FAIL

Предыдущий `cd0acb0ba00d6577036c8ee9260098ac1ea07e83` сохранён отдельной веткой
`codex/integration-readiness-cd0acb0`. Его независимый full результат — 520/521,
exit 1, p95 1610мс; isolated 8/8 не отменяет FAIL. Merge остаётся HOLD.

По разрешению координатора включены только followups: VK `a452a9a`, исследование
VK `854e834`, бюджет `addd68a` и `bf11419`, security report `8e9666f`, CV docs
`6dcba5f08ac14a52bdacd593a8d331f9a9d5ce00` и
`614bb63714da798ffe5320a36b594197c3ba3887`. Нового модельного production кода нет.

Runner теперь выполняет обычные файлы с concurrency 2, затем полный perf-файл
отдельной фазой. Проверка состава отклоняет отсутствие/повтор perf-файла и
дубли остальных файлов; неуспех любой фазы сохраняет nonzero. Четыре unit-теста
runner используют injected spawn и не запускают benchmark. Алгоритм, порог1500,
warmup1 и samples15 не менялись. Корректность и приёмка следующего кандидата
определяются одним полным прогоном после CPU handoff security-задачи; до него
исправление perf не заявляется. Все результаты, включая FAIL, передаются
координатору с точным SHA; повторов до зелёного не допускается.

### Итог проверенного кода 77178a7

Проверенный immutable SHA: `77178a7d55718a56cec43628f9693427dd2d224e`.
После подготовки runner включены согласованный SEC-02 fix `2dfa1bd` и
независимые regression-тесты `5e8c734`. Последующий документальный хвост включает
отчёты `31e594a` и `50931db`; он не меняет runtime, тесты или CI.

| Проверка                       | Авторский результат             | Независимый результат         |
| ------------------------------ | ------------------------------- | ----------------------------- |
| Полный двухфазный Node         | 524 + 8 = 532 PASS, exit 0      | 524 + 8 = 532 PASS, exit 0    |
| Python unittest, без моделей   | 14 PASS, явно сохранён exit 0   | 14 PASS, явно сохранён exit 0 |
| Основной browser               | 13 PASS, exit 0, 37.4с          | 13 PASS, exit 0, 26.4с        |
| Отдельный journey browser      | 10 PASS, exit 0, 20.1с          | 10 PASS, exit 0, 18.0с        |
| Format/repository/build/bundle | PASS, 546747 байт JS / 5 chunks | PASS, те же размеры           |

Node и browser выполнены по одной полной последовательной попытке на этом SHA.
Авторский первый Python сообщил 14 OK, но отдельный exit был потерян: общий
shell exit 1 получен после проверки отсутствующих port listeners. Исходный лог
сохранён. Координатор отдельно разрешил один Python-only повтор исключительно
для восстановления записи exit: 14 PASS, python_exit=0, command exit 0.
Это исключение явно учитывается; новых повторов до зелёного не было.

Четыре runner-теста подтверждают полный состав, отсутствие пропусков/дубликатов,
последовательность фаз и сохранение ошибок. Skip/todo — 0; весь perf-файл
содержит прежние 8 тестов, warmup1/samples15/порог1500 не изменены. Основной
browser содержит новый SEC-02 ровно один раз; отдельный journey содержит 10
случаев, включая параметризованные. Независимая проверка состава выполнена на
exact archive. Предыдущие full perf FAIL и SEC-02 FAIL остаются в истории.

Работа ограничена synthetic fixtures, локальными HTTP/SQLite/browser и кодом
без реальных весов. Это не доказательство качества CV, host no-disk или SLO.
Все тестовые серверы остановлены. Логи автора `integration-77178a7-*.log`
остаются локально вне Git; независимые факты и границы — в
[SECURITY-ACCEPTANCE.md](SECURITY-ACCEPTANCE.md).

Main остаётся `3b1202677e7721d1d32a4089a6fcbdaf44f00759`, интеграция не merged.
По последней проверке координатора PR отсутствует и Linux workflow для 771
не запущен; GitHub connector повторно отклонил создание PR с 403. Следующий
шаг владельца — стандартный Create pull request из `codex/integration-readiness`
в GitHub под своим аккаунтом, затем Linux/container CI **финального HEAD** и
решение координатора. Права не обходились, credentials не извлекались.

До этих шагов merge HOLD. Deploy NO-GO сохраняется независимо от локальных PASS:
модельное качество/лицензии и полный platform lock, host изоляция, реальный
provider hard cap 5000 ₽ с тестами и утверждённая UX palette не готовы.
Никаких покупок, установки моделей или развёртывания не выполнялось. После
финального документального push новые работы не начинаются без внешнего изменения.
