# AI-стилист

Локальный React/Vite-прототип персонального стилиста. Текущий подтверждённый контур — **local pilot**. Production auth, cloud persistence, реальные photo/CV guarantees, платежи и retail integrations находятся в статусе **HOLD**.

## Требования

- Node.js 22.x
- npm с поддержкой `npm ci`

## Запуск

```bash
npm ci
npm run dev
```

Приложение по умолчанию не должно получать production credentials. Допустимые имена локальных переменных перечислены в `.env.example`; реальные значения не коммитятся.

## Проверки

```bash
npm run repo:check
npm test
npm run build
```

Исторические browser/QA harnesses не входят в первый переносимый baseline: они зависели от локальных путей и evidence. Новый переносимый browser gate должен быть добавлен отдельной задачей с явной Playwright-зависимостью.

## Фактическая архитектура

- React/Vite frontend;
- локальные browser repositories для pilot-контура;
- Node BFF и Supabase adapters находятся в незавершённом production-контуре;
- локальный CV middleware разрешён только для loopback/dev сценариев.

Целевая архитектура из `docs/architecture.md` не является описанием развернутого production-сервиса. До её разделения на AS-IS и TARGET этот документ следует читать как проектный контракт.

## Данные и публикация

`qa-evidence`, `GARMENT-REAL-*` и `eval-data` исключены из новой публикационной границы. Фото, masks, screenshots и corpora нельзя переносить в GitHub без provenance, license/consent и privacy review. Подробности: `docs/REPOSITORY-PUBLICATION-POLICY.md`.

## Статус

GitHub migration: подготовка в `petrenkopeta-dotcom/svoy-stil-ai`. Публикация текущей рабочей папки целиком запрещена. Канонический аудит: `AUDIT-AND-GITHUB-MIGRATION-PLAN-2026-09-09.md`.
