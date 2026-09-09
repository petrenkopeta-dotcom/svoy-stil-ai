# Правила изменений

1. Не добавляйте фото, QA evidence, corpora, credentials и machine-local paths.
2. Создавайте изменение в отдельной ветке через pull request.
3. Перед review выполните `npm ci`, `npm run repo:check`, `npm test` и `npm run build`.
4. Новая функциональность должна иметь тест границы данных и честное описание local/production статуса.
5. Архитектурные решения по auth, persistence, privacy и внешним провайдерам оформляются ADR.

Нельзя ослаблять privacy/security gate ради прохождения happy path. Generated evidence хранится вне основного репозитория и прикладывается к release decision ссылкой и manifest hash.
