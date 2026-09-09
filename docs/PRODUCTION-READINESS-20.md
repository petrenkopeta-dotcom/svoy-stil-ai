# Production readiness — пакет 20

Дата: 2026-09-09. Ветка: `codex/production-readiness-20`.

| № | Задача | Результат |
|---:|---|---|
| 1 | Идентифицировать npm-пакет | Добавлены name/version/private/description |
| 2 | Зафиксировать runtime | Добавлены engines, packageManager и `.nvmrc` |
| 3 | Устранить high dependency vulnerability | Lockfile обновлён до `nanoid 3.3.18` |
| 4 | Создать единый verification gate | `npm run verify` объединяет обязательные проверки |
| 5 | Сделать formatting gate исполнимым | Проверяется изменяемый infrastructure/security-контур без массового legacy rewrite |
| 6 | Ввести bundle budget | Добавлен автоматический raw/gzip/total budget |
| 7 | Уменьшить крупнейший JS chunk | React и icons вынесены в отдельные chunks; app chunk снижен примерно с 537 до 342 KB |
| 8 | Отменять устаревшие CI runs | Добавлен GitHub Actions concurrency control |
| 9 | Блокировать уязвимые production dependencies | `npm audit --omit=dev --audit-level=high` включён в CI |
| 10 | Автоматизировать npm updates | Добавлен Dependabot weekly |
| 11 | Автоматизировать GitHub Actions updates | Добавлен Dependabot monthly |
| 12 | Добавить статический security analysis | Добавлен CodeQL для JavaScript/TypeScript |
| 13 | Назначить ownership критичных путей | Добавлен CODEOWNERS |
| 14 | Стандартизировать pull request | Добавлен шаблон риска, отката и проверок |
| 15 | Закрыть публичную утечку security reports | Bug template запрещает PII; security уходит в private advisory |
| 16 | Отделить фактическую архитектуру | Добавлен `ARCHITECTURE-AS-IS.md` |
| 17 | Отделить целевую архитектуру | Добавлен `ARCHITECTURE-TARGET.md` с явными запретами |
| 18 | Описать deploy и rollback | Добавлен `DEPLOYMENT-RUNBOOK.md` |
| 19 | Сделать release criteria блокирующими | Добавлен `RELEASE-CHECKLIST.md` |
| 20 | Укрепить эксплуатационный BFF boundary | Добавлены health, config validation, HTTP body cap, timeouts, safe Host handling и 405 |

## Проверяемые ограничения

Этот пакет не делает текущий сервис production-ready. До production остаются как минимум внешний session store, live RLS gate, browser E2E, production photo transport, observability и проверенный backup/restore.
