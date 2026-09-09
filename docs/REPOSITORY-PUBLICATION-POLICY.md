# Граница публикации репозитория

Статус: обязательная политика миграции. Репозиторий создаётся приватным.

## Разрешено

- Исходный код приложения, BFF и migrations.
- Синтетические fixtures без человека и персональных данных после review.
- Контрактные тесты, schemas и минимальная техническая документация.
- Пустой `.env.example` только с именами переменных.

## Запрещено без отдельного решения владельца

- Пользовательские, owner-provided и реальные фотографии.
- `qa-evidence/`, contact sheets, masks, screenshots и browser profiles.
- Корпуса и eval datasets без provenance, license, consent, hashes и retention policy.
- Credentials, tokens, cookies, signed URLs, PII и локальные абсолютные пути.
- Build output, caches, runtime models и временные диагностические файлы.

## Процедура допуска данных

Для каждого набора нужны: владелец, назначение, источник, лицензия/consent, перечень PII, retention, SHA-256 manifest и явное решение о месте хранения. Git LFS решает размер, но не privacy и право публикации.

Основной GitHub repository не является хранилищем release evidence. Одобренные большие наборы размещаются отдельно и связываются с кодом immutable manifest/hash.
