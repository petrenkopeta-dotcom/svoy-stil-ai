# Политика безопасности

Проект пока не предназначен для production-эксплуатации и должен размещаться только в приватном репозитории.

Не создавайте публичный issue с токенами, email, пользовательскими фотографиями, signed URL, дампами browser storage или Supabase credentials. Используйте [приватное GitHub Security Advisory](https://github.com/petrenkopeta-dotcom/svoy-stil-ai/security/advisories/new).

## Обязательные границы

- `.env*`, кроме пустого `.env.example`, не коммитятся.
- Пользовательские и owner-provided фото не входят в Git history.
- Direct cloud auth не считается production-ready; production должен использовать проверенный server-side boundary.
- Любой случайный секрет нужно отозвать, а не только удалить из последнего коммита.

В отчёте укажите затронутый commit SHA, воспроизведение на синтетических данных и влияние. Не проводите тесты на чужих аккаунтах или данных.

Поддерживаемой production-версии пока нет. SLA исправления уязвимостей не заявляется.
