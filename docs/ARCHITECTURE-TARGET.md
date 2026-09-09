# Архитектура TARGET

Цель: production beta после прохождения обязательных gates.

## Минимальные изменения от AS-IS

1. Разместить SPA и BFF под одним HTTPS origin.
2. Перенести BFF-сессии в шифрованное/managed хранилище с TTL, rotation и revoke.
3. Применять миграции Supabase только автоматизированной ролью; проверять RLS негативными live-тестами.
4. Реализовать приватный photo upload/download через короткоживущие server-issued intents.
5. Добавить browser E2E для auth, privacy, migration и основных пользовательских путей.
6. Ввести структурированные логи без PII, метрики насыщения и алерты.
7. Проверять backup восстановлением в отдельной среде.

## Запреты

- Нельзя включать direct auth в публичной сборке.
- Нельзя хранить provider tokens в browser storage.
- Нельзя публиковать фото, masks, eval corpus или signed URLs в Git/GitHub artifacts.
- Нельзя считать наличие SQL-файла доказательством применённых RLS policies.
- Нельзя масштабировать текущий in-memory BFF более чем в один процесс.

Расширенный целевой pipeline описан в `docs/architecture.md`; его компоненты вводятся только вместе с отдельными эксплуатационными gates.
