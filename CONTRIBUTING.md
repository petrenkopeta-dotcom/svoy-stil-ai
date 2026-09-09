# Вклад в проект

## Перед изменением

- Создайте ветку от актуального `main`.
- Не добавляйте реальные фото, email, browser profiles, `.env`, QA evidence или eval corpus.
- Для auth/privacy/data изменений сначала определите негативный сценарий и fail-closed результат.
- Архитектурные решения по auth, persistence, privacy и внешним провайдерам оформляйте ADR.

## Локальная проверка

```bash
npm ci --ignore-scripts
npm run verify
```

PR должен описывать риск, откат и фактически выполненные проверки. Большие архитектурные изменения разделяются на проверяемые шаги; документация TARGET не считается реализованной функциональностью.

Нельзя ослаблять privacy/security gate ради happy path. Generated evidence хранится вне Git и привязывается к release decision ссылкой и manifest hash.
