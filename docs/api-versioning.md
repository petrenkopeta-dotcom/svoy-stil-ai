# Версионирование API и данных

- Публичный HTTP API начинается с `/api/v1`.
- Совместимые добавления полей не меняют major; удаление, переименование или изменение смысла требует `/api/v2`.
- Клиент игнорирует неизвестные response-поля; сервер отклоняет неизвестные command-поля.
- JSON Schema имеет `schema_version` (`1.0`) и immutable `$id`.
- AI prompt, модель, CV pipeline и rule engine версионируются независимо.
- БД меняется только миграциями; downgrade-стратегия обязательна для destructive migration.
- DTO не зависят от ORM; даты — ISO 8601 UTC; enum расширяется только с fallback `unknown`.
- Idempotency key обязателен для upload completion, confirm, reprocess, outfit snapshot и feedback.
- Минимальная поддержка предыдущей major-версии API — до завершения миграции активных клиентов.

## Версии, сохраняемые с результатом

```json
{
  "api_version": "1",
  "schema_version": "1.0",
  "ai_model": "gpt-5.6-sol",
  "ai_prompt_version": "clothing-analysis-1.0",
  "image_pipeline_version": "segmentation-1.0",
  "outfit_engine_version": "rules-1.0"
}
```

