# Security acceptance — 13 сентября 2026

Профильная задача: независимые отрицательные проверки; production и CI здесь не
изменяются. Базовый SHA: `3b1202677e7721d1d32a4089a6fcbdaf44f00759`.
Наличие зелёных синтетических тестов не разрешает фотографии, расходы или деплой.

## Интеграция тестов и SEC-01

**Тестовый commit требует предварительной интеграции final VK journey
`46ef738314a623b74a40ee8caf3ebc9bd6775324`, включающего исправление SEC-01
`2f1222827dac247c883fcef59e9514f29fc333f9`.** Два обычных SEC-01 acceptance-теста
намеренно падают на исходном main; skip/todo и ослабления ожиданий отсутствуют.
Первоначальные characterization-тесты воспроизводили баг и были заменены
обязательными проверками безопасного поведения. Их старый зелёный результат
не является acceptance.

Дефект: при `budgetAllowed=false` оба слоя (`stagingServer`, `stagingApi`)
возвращали 503 до logout. Сессия оставалась действующей. Минимальный repro:

1. Синтетически подписанный VK login при разрешённом admission → cookie.
2. Запретить бюджет; POST logout с корректными Origin/CSRF/cookie → **503**.
3. Восстановить admission; GET session со старым cookie → **200**.

Исправленный invariant: authenticated POST logout с корректным CSRF доступен
при запрещённом бюджете; удаляет сессию, отменяет кандидаты, очищает cookie.
Чужой Origin или отсутствующий CSRF → 403 без отзыва. Старый cookie после
успешного logout и восстановления admission → 401. Остальные операции остаются
под budget deny. Исправление сделал владелец VK; эта задача его не редактировала.

**SEC-01 VERIFIED на точном SHA `2f122282…`**: 22/22 независимых Node
теста прошли без skip/todo, включая API и настоящий локальный HTTP/SQLite.
Повтор на final journey `46ef738…`: те же22 PASS плюс новый HTTP journey test
PASS. Новые capabilities/list тесты и capability revoke browser требуют final
journey; baseline намеренно не удовлетворяет им.

## Матрица

| Граница                | Исполняемая проверка                                                                                             | Результат и предел доказательства                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Auth/CSRF              | Нет cookie, поддельный cookie, чужой Origin, нет intent                                                          | Отказ до вызова worker; API и частично реальный HTTP                         |
| Owner                  | Чужой candidate; query owner; чужой metadata read                                                                | Нет чужого результата или записи; owner берётся из сессии                    |
| Crop proof             | Нет proof, неверный digest, person/face=true, checked=false, garmentOnly=false, не-PNG                           | Кандидат не выдаётся, SQLite записей 0; worker синтетический                 |
| Повторная проверка     | Другой digest во втором ответе worker                                                                            | Отказ, кандидат потреблён, повтор не сохраняет                               |
| Отмена                 | Abort, logout/cancel, TTL и release revoke во время ожидающего confirm                                           | Поздний результат не записывается                                            |
| Ресурсы                | Candidate maxBytes, TTL освобождение, input >10 MiB, 101 metadata items                                          | Отказ/освобождение проверены; memory/RSS и model load не измерены            |
| Ранний HTTP deny       | Объявлено 10 MiB, отправлены только headers, тело не отправляется                                                | Budget503, без auth401, неизвестный маршрут404 до тела; deadline проверки 2с |
| Budget                 | Нет состояния, NaN, unsafe integer, отрицательная стоимость, старые/будущие данные, другой месяц, ровно500000коп | Deny; это локальная арифметика, провайдер не подключён                       |
| Logout при budget deny | API + настоящий HTTP, CSRF и повтор старого cookie                                                               | FAIL на baseline; PASS на SEC-01 fix                                         |
| Metadata storage       | photo/owner поля, data URL в color, список сверх лимита                                                          | Не записываются; обычный metadata list изолирован по owner                   |
| Browser persistence    | Перехват Storage.setItem, IDB add/put, проверка local/sessionStorage                                             | В VK metadata сценарии записей нет; это не аудит всех браузерных/OS кешей    |
| Browser login/ошибки   | Query удалён, launch POST только в same-origin vk-session, console без synthetic marker, отказ save/logout       | Проверяется настоящий UI с синтетическими HTTP-ответами, не VK runtime       |
| IndexedDB bypass       | Blob + клиентский safety + отсутствующий/false/throw validator                                                   | Отказ до IDB put; не проверка точности валидатора                            |
| No-disk original       | Код Python использует BytesIO; HTTP отказывает до body при закрытых gates                                        | Host swap, core dump, proxy spool, browser cache и crash recovery **OPEN**   |
| Model acceptance       | Никаких реальных весов или фото                                                                                  | **OPEN**, synthetic proof не доказывает отсутствие человека/фона             |
| SLO/5000руб            | Нет запуска моделей/реального billing                                                                            | **OPEN**, 10с цель/20с предел и месячный ceiling не подтверждены хостингом   |

## Воспроизводимость и журнал

Рабочий каталог тестов:
`C:/Users/petre/.codex/worktrees/cc12/AI-стилист 2`.
Архивы проверяемых SHA и диагностические результаты находятся только в ignored
`artifacts/`; никаких QA/eval datasets в Git. Все credentials/изображения в
тестах синтетические. Тестовые SQLite создаются в уникальных temp-каталогах;
перед удалением проверяется их префикс. Пользовательские файлы не удаляются.

| SHA / серверный cwd                                                    | Порт               | Команда / результат                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseline `3b12026`, cwd выше                                           | ephemeral loopback | `node --test server/acceptance.security.test.js server/transport.security.test.js`: финальные assertions **20 PASS, 2 FAIL SEC-01**                                                                                     |
| `2f1222827dac247c883fcef59e9514f29fc333f9`, `artifacts/security-sec01` | ephemeral loopback | `git archive` указанного SHA; копия двух независимых тестовых файлов; `node --test artifacts/security-sec01/server/acceptance.security.test.js artifacts/security-sec01/server/transport.security.test.js`: **22 PASS** |
| baseline UI, cwd выше                                                  | **4297**           | Собственный `VITE_VK_STAGING=true node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4297 --strictPort`; отдельный ignored Playwright config без общего webServer                                               |
| Неатрибутированный UI общего порта                                     | 4200               | Получен UI другой параллельной ветки; результат **исключён из acceptance**                                                                                                                                              |
| baseline Node, cwd выше                                                | —                  | Первый `npm test`: **510/511**, существующий perf FAIL: p95=1734мс при лимите1500мс (параллельно browser). Тогда SEC-01 тесты ещё были characterization                                                                 |
| baseline Node, cwd выше                                                | —                  | Изолированно `node --test src/stylistCandidateEngine.test.js`: **8 PASS**, порог не менялся; повтор не отменяет первичный FAIL                                                                                          |
| baseline build, cwd выше                                               | —                  | `npm run build`, `npm run bundle:check`, `npm run format:check`: **PASS**, bundle541496B/5JS chunks                                                                                                                     |

Для нового интегрированного SHA запускать обычные Node tests и
`npx playwright test e2e/security-vk-staging.spec.js` на изолированных портах.
Config по умолчанию использует4199/4200/4201; параллельные задачи должны согласовать
эти порты либо использовать отдельный локальный config. UI должен происходить
из того же проверяемого checkout. Номер порта сам по себе SHA не доказывает.
Browser-тест импорта `/src/photoStorage.js` рассчитан на Vite dev, как текущий CI.

## Частичный review серверного воспроизведения

По поручению координатора рассмотрен точный
`05dc895a295edb650adf872dd0ac03a286638f25` через `git archive` в
`artifacts/security-server`. Production не менялся.

- Мои три HTTP admission теста: **3 PASS**; status/preflight тесты автора:
  **2 PASS**. Ещё две независимые локальные проверки status routes/methods/query
  и CLI preflight: **2 PASS**.
- Health200 означает `{live:true}`; readiness503 `{ready:false}`. Query/method
  не открывают readiness; ответы no-store. CLI preflight exit2,
  deploymentReady=false и synthetic secret не выводится.
- Статический diff: server-start не передаёт разрешающий budget callback;
  nginx блокирует photos; runtime image не включает модели/QA каталоги.
  Dockerignore допускает перечисленные source extensions/assets, поэтому
  это не гарантия отсутствия частных данных внутри разрешённых исходников.
- `--test-concurrency=2` меняет число параллельных файлов; discovery сохраняет
  все src/server tests и добавляет scripts; exit status дочернего runner
  передаётся наружу. Статический review не равен повтору полного491-test прогона.
- Docker build, Linux/systemd enforcement, egress/no-swap и фактический состав
  build context **OPEN**. Плавающий base-image tag не равен digest lock.
  Это частичная приёмка, не разрешение деплоя.

## Следующие действия

Координатор интегрирует final VK journey до этих acceptance-тестов, затем
проверяет интегрированный SHA. До реальных независимых модельных/хостинговых
доказательств default deny остаётся. Сейчас от пользователя не нужны оплата,
фото или установка моделей.

## Финальная независимая приёмка VK

SHA `46ef738314a623b74a40ee8caf3ebc9bd6775324`, архив
`C:/Users/petre/.codex/worktrees/cc12/AI-стилист 2/artifacts/security-vk`.
Скопированы только три новых server security теста; production-файлы архива
соответствуют SHA. `node --test` этих файлов: **23 PASS**, включая реальный
HTTP/SQLite и повтор SEC-01. Полный `node scripts/run-tests.mjs` из этого архива
с добавленными23 security-тестами: **519/519 PASS, exit0, 14.6с**, без skip/todo.
Новый тест вставляет105 синтетических записей owner A
и1 owner B только в memory DB для проверки SQL, не заявляет проверку моделей.

Capabilities: authenticated GET, строго `{photos:boolean}`, no-store; список:
100 последних только своего owner, поля id/sha256 без PNG. Чужой read404;
POST/PUT/DELETE/HEAD и owner query404. При release deny capabilities photos=false,
список503; при budget deny обе операции503.

Из указанного cwd запущен свой Vite с `VITE_VK_STAGING=true`, **4297**, strictPort;
baseline-сервер предварительно остановлен. Ignored config
`artifacts/security-browser.config.mjs` использует только этот URL, Edge,
без общего webServer, trace/screenshot/video off. Команда:
`npx playwright test --config artifacts/security-browser.config.mjs`.
**4 PASS, exit0, 11.7с**:

- launch/metadata не записываются в Storage/IDB и console; только same-origin;
- failed save/logout не выдают подтверждения;
- Blob + клиентский safety не обходят missing/false/throw validator до IDB put;
- после отзыва capability выбранный synthetic original не передаётся в analyze,
  file input очищается.

Предыдущий атрибутированный baseline browser4297: 3 PASS до добавления
capability-revoke теста. Общий4200 прогон по-прежнему исключён.
Security review final VK: **пригоден к интеграции/merge координатором с
сохранением default deny; не пригоден к фото-релизу/деплою**. Новых подтверждённых
security-дефектов помимо исправленного SEC-01 не найдено в проверенной области.

## Независимый review CV

SHA `191bc6fda105585541dde65a968d8035807e36ff`, архив
`artifacts/security-cv`. Bundled Python, `-B -m unittest discover -s
artifacts/security-cv/runtime/cv -p 'test_*.py'` до добавления локальных probes:
**14 PASS**; `node --test` memoryCvWorker/garmentPhotoFlow из этого архива:
**7 PASS**, включая убийство настоящего синтетического зависшего процесса.

Локальный `test_independent_security.py` (ignored evidence, вне Git) дал
**3 PASS, 1 SKIP**: path variants/ADS/traversal/types, старый manifest до импорта
torch, auto_map и одинаковые weight hashes между ролями отвергаются до
конструкторов. Tensor/model weights не загружались. Настоящий symlink создать
ОС не разрешила; symlink/junction enforcement **OPEN для Linux CI/хоста**, а не PASS.

Статически: полный manifest schema v2 с exact versions/roles/paths/hashes;
полный набор файлов и SHA256, запрет pickle/py и symlink/junction; strict model
type, unsafe loading keys отвергаются. Pipeline/worker_service не изменены
относительно baseline: JSONL v1 и productionApproved:false сохранены. Порог
0.995 и две композиции не сняты. Проверка hashes не устраняет TOCTOU, поэтому
immutability snapshot на approved host остаётся отдельным требованием.

CV пригоден к интеграции как закрытая research-заготовка с этими ограничениями.
Реальные loader/API/качество/recall/SLO/память не проверены. Commercial NO-GO
для semantic checkpoint и неполный transitive dependency lock сохраняются;
это не юридическая или host-compliance валидация.

## Совместный candidate cd0acb0 — независимый ретест

Проверка разрешена координатором для точного
`cd0acb0ba00d6577036c8ee9260098ac1ea07e83`. Динамические прогоны начаты после
сообщения интегратора «CPU ОСВОБОЖДЕН», выполнялись последовательно.
Авторские результаты не подменяют приведённые ниже независимые результаты.

Архив Git, серверный cwd:
`C:/Users/petre/.codex/worktrees/cc12/AI-стилист 2/artifacts/security-integration-cd0acb0`.
Production и тестовые файлы архива не редактировались. Использованы существующие
локальные npm dependencies; модели/платные ресурсы не устанавливались.

Сверка Git diff подтвердила отсутствие отличий в production VK от46ef738,
runtime/cv от191bc6f, deploy/scripts/package от05dc895 и security tests от7f41e7.
Новый CI step запускает два отдельных journey-теста после общего browser suite;
основной config сам их не обнаруживает. Concurrency2 сохраняет discovery и
ненулевой exit при отказе, что подтверждено настоящим full-run FAIL ниже.

| Проверка exact SHA                                                    | Независимый результат                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `node scripts/run-tests.mjs` из архива                                | **520/521 PASS, exit1**, единственный FAIL — существующий perf p95=1610мс при лимите1500мс, p50=828мс                   |
| `node --test src/stylistCandidateEngine.test.js` изолированно         | **8/8 PASS, exit0**; порог не менялся, full-run FAIL не отменён                                                         |
| Bundled Python `-B -m unittest discover -s runtime/cv -p 'test_*.py'` | **14/14 PASS**; синтетические модели/пиксели                                                                            |
| Format, build, bundle, demo build/boundary                            | **PASS**,545960B/5JS chunks                                                                                             |
| Repository boundary                                                   | **451 tracked PASS**, отдельный временный `GIT_INDEX_FILE` + `git read-tree` exact SHA; индекс рабочей ветки не менялся |
| Git diff check                                                        | **PASS**                                                                                                                |
| Основной browser                                                      | **10/10 PASS, exit0, 33.3с**                                                                                            |
| Отдельный journey browser                                             | **2/2 PASS, exit0, 8.0с**                                                                                               |

Full-run perf samples (мс):422,531,563,593,625,641,656,828,843,860,875,890,891,969,1610.
Прогон выполнен уже с concurrency2 и без параллельного собственного browser.
Причина вариабельности не доказана; заявлять полный независимый521/521 PASS
для этого candidate нельзя. Повторять весь suite до получения зелёного не стали.

Browser использовал собственные strictPort-серверы из указанного cwd:
обычный UI4295, demo preview4296, VK staging4297. Ignored config
`artifacts/integration-browser.config.mjs` импортирует exact основной config
и меняет только paths/ports, управление локальными серверами и global timeout;
mobile viewport, проекты, assertions, retries и тесты сохранены. Trace/screenshots/
video выключены. Отдельный journey использует тот же VK сервер4297 и config
`artifacts/integration-journey-browser.config.mjs`, последовательно после10 тестов.
Raw результаты находятся только в `artifacts/integration-cd0acb0-*.txt`.

GitHub connector для exact SHA вернул пустые workflow_runs и combined statuses;
workflow wrapper ограничен PR events, поэтому это не доказательство отсутствия
любых иных запусков. Интегратор также сообщил отсутствие PR и локального Docker.
**Linux/container CI не подтверждён и остаётся блокером финальной merge-приёмки.**

**MERGE-review:** security-контракты закрытой интеграции проходят проверенные
негативные сценарии, новых подтверждённых security-регрессий не найдено.
Безусловного одобрения merge нет: нужен обязательный Linux/container CI и явное
решение координатора по нестабильному perf-check. Авторский521 PASS и
изолированный8 PASS не заменяют независимый full-run520/521.

**DEPLOY-NO-GO:** default budget/photo gates не снимать. Реальные модели, licenses,
полный platform lock, provider billing, российский хост/no-disk/egress/swap,
symlink/junction enforcement и model SLO остаются OPEN.

Отдельно **OPEN в этом candidate** (repro сообщил владелец VK, здесь заново
не воспроизводились): двойной синхронный confirm даёт2POST при одной записи и
вторичный404 портит UI; после initial budget503 нет retry-login; LIMIT100 не
объясняется пользователю. Followup `a452a9a168efc6e9670eb77b4f4f32811f137aaf`
не входит в cd0acb0 и этой приёмкой не покрыт. Его проверка — только по отдельному
разрешению координатора. Нельзя трактовать этот отчёт как «все дефекты закрыты».
