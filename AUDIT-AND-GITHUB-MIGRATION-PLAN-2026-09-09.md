# Жёсткий аудит AI-стилиста и план миграции в GitHub

Дата: 2026-09-09
Статус решения: **NO-GO для публикации текущей рабочей папки; условный GO только после санитарной подготовки репозитория**

## Управленческий вывод

Сервис имеет сильный локальный прототип и необычно широкий набор контрактных тестов, но пока не является управляемым программным продуктом. Главная проблема не в количестве дефектов, а в отсутствии единого проверяемого контура поставки: фактический код, целевая архитектура, Notion, QA-артефакты и Git живут в разных состояниях.

Текущую папку нельзя целиком публиковать в GitHub. Это создаст раздутый и потенциально чувствительный репозиторий, зафиксирует незавершённую рабочую копию как историю проекта и создаст ложное впечатление production-ready системы.

## Что проверено

- Локальный Git, история, remote, tracked/untracked и ignore policy.
- `package.json`, build/test entry points, Vite-конфигурация.
- Frontend composition, auth/BFF boundary, persistence, Supabase migrations.
- Архитектурные документы и roadmap.
- Состав QA/eval/photo-артефактов.
- Notion: главная страница, архитектура, privacy/auth материалы и база задач.
- Фактические проверки: `npm test` — 432/432 PASS; `npm run build` — PASS с предупреждением о JS chunk 536.28 kB.

## Критические выводы

### P0 — блокирует миграцию

1. **Рабочая копия не является релизным baseline.** В Git всего 189 tracked-файлов и два коммита, но одновременно есть десятки изменённых tracked-файлов и сотни untracked-файлов, включая большую часть нового `src`, `server`, `supabase`, `docs`, `qa`, `eval-data` и evidence. Нельзя доказать, какие изменения составляют продукт, а какие являются экспериментом.

2. **Нет GitHub remote и нет отдельного GitHub-проекта.** Локальный репозиторий уже существует на ветке `master`, но внешний origin отсутствует. Миграция должна быть созданием очищенного канонического репозитория, а не механическим переносом папки.

3. **Не определена публикационная граница данных.** Только `qa-evidence`, `GARMENT-REAL-200-02` и `eval-data` содержат 822 файла примерно на 137 MB. В дереве есть пользовательские/owner-provided фотографии, корпуса, маски, contact sheets и browser screenshots. Даже если часть данных лицензирована, доказательство права публикации и consent manifest отсутствуют в едином машинно-проверяемом виде.

4. **Нет обязательного OSS/private-repo hygiene.** Отсутствуют `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS` и `.github/workflows`. Поэтому новый участник не может воспроизвести запуск, понять статус продукта, сообщить об уязвимости или проверить PR автоматикой.

5. **Документированная архитектура не соответствует реализации.** `docs/architecture.md` описывает FastAPI, PostgreSQL, Redis queue, object storage и workers как утверждённый контракт. Фактически работает Vite/React с локальным browser storage, локальным CV middleware и небольшим Node BFF; production backend из документа не реализован. Документ должен быть разделён на AS-IS и TARGET, иначе он вводит в заблуждение.

6. **Production auth boundary не закрыт.** Frontend по умолчанию выбирает `direct`, а BFF используется только при `VITE_AUTH_TRANSPORT=bff` (`src/main.jsx:243-244`). Это противоречит заявленной цели держать provider tokens на сервере. BFF хранит сессии в process-local `Map` (`server/authBff.mjs:10`), теряет их при рестарте и не готов к нескольким инстансам. Proxy принимает клиентские `command.path` и `command.method` (`server/authBff.mjs:34`) без endpoint allowlist — слишком широкая доверительная граница.

### P1 — блокирует стабильную разработку

7. **Frontend — монолит.** `src/main.jsx` содержит 1851 строку и одновременно занимается bootstrap, auth, persistence, navigation, onboarding, wardrobe, photo, shopping и dialogs. Это composition root, state container и UI в одном файле. Изменения становятся рискованными, а тесты отдельных модулей не гарантируют корректность оркестрации.

8. **Зависимости невоспроизводимы на уровне manifest.** React, React DOM, Vite, plugin-react и lucide-react заданы как `latest`. Lockfile стабилизирует текущую машину, но любое обновление lockfile становится неконтролируемым major-upgrade. Нужны явные semver ranges и Renovate/Dependabot.

9. **Default test gate неполный.** `npm test` запускает только `src/*.test.js` и `server/*.test.js`. Browser, privacy smoke, QA scripts, migrations и вложенные тесты не входят в обязательный gate. Большое число тестов создаёт ложную уверенность: заметная доля проверяет строки/DOM-контракты, а не реальный браузер, сеть и инфраструктуру.

10. **Bundle уже превысил предупреждающий порог.** Один JS chunk — 536.28 kB minified (167.46 kB gzip). Route/feature code splitting отсутствует; CV, auth, capsule, reference и shopping surfaces импортируются в главный entrypoint.

11. **Нет статических quality gates.** Нет ESLint, typecheck, coverage threshold, formatting check, dependency/security scan и secret scan в CI.

12. **Локальный Git требует обслуживания.** Найдены 17 garbage objects (~14.87 MB). Это не функциональный дефект, но симптом прерывавшихся операций/нестабильной рабочей среды. Очистку делать только после резервной копии и фиксации канонического baseline.

### P1 — управление продуктом и Notion

13. **Notion — журнал, а не source of truth.** Главная страница состоит из длинной последовательности локальных PASS/HOLD readouts. Актуальный статус приходится реконструировать из истории. Все ключевые страницы помечены unverified.

14. **Backlog просрочен и не обслуживается.** Из 17 задач только одна имеет статус «Готово»; открыты 7 P0, включая задачи со сроками 12–22 августа. Просроченные P0 не переведены в blocked/cancelled и не перепланированы.

15. **Есть продуктовые противоречия.** Канонические страницы используют тарифы 499/999 ₽, а открытая P1-задача — 399/599 ₽. Это означает отсутствие принятого pricing decision record.

16. **GitHub-миграция отсутствует в управляемом backlog.** Нет отдельного проекта/repository migration epic с владельцем, критериями готовности, data classification и rollback.

## Что сделано хорошо

- 432 локальных теста проходят, сборка воспроизводится на текущем lockfile.
- Domain logic в значительной степени вынесена из React в чистые модули.
- Privacy boundaries, demo/personal separation, explicit consent, unknown-safe reasoning и owner isolation глубоко представлены в контрактах.
- Supabase migrations и provider-neutral ports дают основу для будущего backend contour.
- Notion содержит критерии готовности и приоритеты; проблема в актуальности и дисциплине, а не в полном отсутствии структуры.

## Целевая граница первого GitHub-репозитория

В первый репозиторий включить только:

- `src/`, `server/`, `supabase/migrations/`, необходимые `schemas/`;
- минимальный набор воспроизводимых tests/fixtures без персональных фото;
- `package.json`, lockfile, Vite config, entrypoint;
- очищенные canonical docs: README, AS-IS architecture, TARGET architecture, privacy/security boundary, ADR index;
- CI и repository policy files.

Не включать в первую публикацию:

- `qa-evidence/`, `outputs/`, runtime/browser profiles;
- owner-provided и real-photo corpora до отдельной license/consent проверки;
- contact sheets, локальные отчёты прогонов и повторные screenshots;
- временные `tmp_*.py`, локальные machine paths и устаревшие handoff-отчёты;
- `.env.local` и любые реальные credentials.

Большие лицензированные eval-наборы позднее хранить отдельно: private object storage, Git LFS либо отдельный data repository с manifest, provenance, license и hashes. Git LFS не решает вопрос права публикации.

## План миграции

### Фаза 0. Заморозка и доказательство происхождения — 0.5 дня

- Не коммитить текущую папку целиком.
- Снять read-only manifest: путь, размер, SHA-256, Git status и классификация `source/test/generated/personal/licensed/unknown`.
- Сделать локальную резервную копию вне будущего GitHub checkout.
- Назначить владельца решения о публикации данных.

Gate: каждый файл будущего репозитория имеет понятное назначение; sensitive/unknown исключены.

### Фаза 1. Санитарная подготовка — 1 день

- Расширить `.gitignore` для QA evidence, corpora, runtime и временных скриптов.
- Создать `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`; выбрать лицензию или явно пометить private/proprietary.
- Закрепить версии зависимостей вместо `latest`.
- Разделить документацию на `architecture-as-is.md` и `architecture-target.md`.
- Добавить `docs/adr/` и зафиксировать auth transport, data boundary и repository split.

Gate: чистый `git status` в staging-копии; fresh-clone install/test/build работает по README.

### Фаза 2. Минимальный инженерный gate — 1–2 дня

- Добавить scripts: `lint`, `format:check`, `test:unit`, `test:browser:smoke`, `test:migrations`, `build`.
- Добавить GitHub Actions: install через lockfile, unit, build, smoke, secret scan, dependency review.
- Вынести ленивыми import крупные feature surfaces.
- Сделать BFF transport default для любого cloud/auth режима; в production запретить direct transport.
- Ограничить BFF allowlisted commands/endpoints; задать durable/central session strategy или явно оставить auth disabled.

Gate: PR checks обязательны; production config fail-closed; bundle budget формализован.

### Фаза 3. Создание GitHub repository — 0.5 дня

- Создать **private** repository; public до data/license review запрещён.
- Название: `ai-stylist` (или утверждённое владельцем); default branch `main`.
- Защитить `main`: PR required, checks required, force-push/delete disabled.
- Создать команды/доступы по least privilege, включить Dependabot и secret scanning.
- Импортировать очищенную историю: предпочтительно новый baseline commit с приложенным provenance report; старые два локальных коммита переносить только если они не содержат чувствительных артефактов.

Gate: clone в пустую директорию проходит install/test/build; секретов и запрещённых данных в Git history нет.

### Фаза 4. Перенос управления из Notion — 0.5–1 день

- Создать GitHub Project `AI Stylist Delivery`.
- Перенести только активные задачи; устаревшие закрыть/отменить в Notion с причиной.
- Поля: Priority, Status, Area, Risk, Target date, Notion source, Evidence link.
- Создать milestones: `Repository baseline`, `Local pilot`, `Cloud alpha`, `Production readiness`.
- Notion оставить для product research/decisions; GitHub сделать source of truth для кода, issues, milestones и release evidence.
- Зафиксировать один pricing ADR и удалить конфликт 399/599 vs 499/999.

Gate: у каждой активной P0/P1 задачи один владелец, один статус и один acceptance criterion.

### Фаза 5. Post-migration re-gate — 1 день

- Fresh clone на другой машине/runner.
- Unit + browser smoke + privacy + migration tests.
- Проверка history на secrets, PII, images и blobs.
- Создать signed/tagged baseline `v0.1.0-local-pilot` только если статус честно ограничен local pilot.
- Production release не открывать до live auth/RLS/storage/delete, monitoring, backup/restore и privacy/legal gates.

## Предлагаемая первая очередь GitHub Issues

1. P0 — Repository data classification and publication allowlist.
2. P0 — Create reproducible clean baseline from dirty worktree.
3. P0 — Add README/security/license decision and CI.
4. P0 — Make cloud auth BFF-only and restrict provider proxy.
5. P0 — Separate AS-IS and TARGET architecture.
6. P1 — Split `main.jsx` into feature composition modules.
7. P1 — Add required browser/privacy/migration gates.
8. P1 — Pin dependencies and enable automated updates.
9. P1 — Establish bundle budget and lazy loading.
10. P1 — Clean Notion backlog and resolve pricing contradiction.

## Финальный критерий готовности к миграции

Миграция считается готовой не после первого push, а когда private GitHub repository можно клонировать в пустую среду, собрать и проверить по README; история не содержит секретов/PII/неразрешённых фото; CI обязателен; архитектура описывает реальность; Notion и GitHub имеют явное разделение ответственности; production HOLD сохранён честно.

## Источники Notion

- [AI-стилист — управление проектом](https://app.notion.com/p/3b64f57a001481c8a0fbe6ef61ca4ccf)
- [Архитектура сервиса AI-стилист · фактическая и целевая](https://app.notion.com/p/3ba4f57a0014819aa0adc3998c45170a)
- [Политика приватности и данных AI-стилиста · каноническая](https://app.notion.com/p/3d24f57a001481099a3dc7535cb6baed)
- [Авторизация AI-стилиста · решение и бюджет](https://app.notion.com/p/3d24f57a001481c3b8e6e02037143ce1)
- [Задачи](https://app.notion.com/p/2eed0515050d4ed19e15334c50be26d4)
