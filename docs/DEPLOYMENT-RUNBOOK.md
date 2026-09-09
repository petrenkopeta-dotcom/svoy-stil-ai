# Deployment runbook

## Предусловия

- PR прошёл CI и CodeQL.
- Деплой выполняется из конкретного commit SHA, не из локальной папки.
- `VITE_AUTH_TRANSPORT=bff`; direct auth и local pilot flags выключены.
- BFF и frontend обслуживаются под одним HTTPS origin.
- Production secrets находятся в secret manager, а не в `.env` или GitHub artifacts.

## Проверка релиза

```bash
npm ci --ignore-scripts
npm audit --omit=dev --audit-level=high
npm run verify
```

Обязательные BFF-переменные:

- `NODE_ENV=production`
- `AUTH_SITE_ORIGIN=https://...` — только origin, без path/query
- `AUTH_PORT` — целое число 1–65535
- `SUPABASE_URL=https://...`
- `SUPABASE_PUBLISHABLE_KEY` — publishable/anon key, не service-role key

`AUTH_INSECURE_LOCAL_COOKIE=1` запрещён в production.

## Smoke

1. `GET /api/health` возвращает `200 {"status":"ok"}` без сведений о конфигурации.
2. Cross-origin OTP получает `403`.
3. Невалидный OTP получает клиентскую ошибку без stack trace.
4. Сессия создаёт cookie с `HttpOnly; Secure; SameSite=Lax`.
5. После logout cookie удаляется, provider-proxy возвращает `401`.
6. Неизвестная таблица или query control получает `403`.

## Откат

- Переключить frontend и BFF на предыдущий проверенный SHA одновременно.
- Не восстанавливать старую frontend-версию отдельно, если менялся BFF-контракт.
- После подозрения на утечку отозвать credential; удаления коммита недостаточно.

Текущий BFF с in-memory sessions пригоден только для одного процесса и ограниченного пилота. Production rollout до внешнего session store запрещён.
