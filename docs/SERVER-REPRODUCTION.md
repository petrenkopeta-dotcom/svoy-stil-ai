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
