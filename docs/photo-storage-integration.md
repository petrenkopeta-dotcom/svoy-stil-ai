# RELEASE-02: локальный жизненный цикл фото

Байты фото хранятся через `createPhotoStorage()` из `src/photoStorage.js`, не как data URL в общем `localStorage`. Модуль локальный и не делает сетевых запросов. Основной backend — IndexedDB. Если он недоступен, используется память и `meta.persisted === false`: UI не должен показывать успех долговечного сохранения.

## Инструкция RELEASE-08

1. Создать один `photoStorage = createPhotoStorage()` и передать его в `createPrivacyDataController({ ..., photoStorage })`.
2. Перед сохранением показать отдельное согласие на локальное хранение фото. Передавать `{ granted: true, policyVersion: PHOTO_POLICY_VERSION, grantedAt }`; выбор файла или общее consent не заменяют это согласие.
3. После `getLocalReviewPayload()` вызвать `photoStorage.save(payload.blob, consent, { garmentId })`. В wardrobe JSON сохранять только `{ photoId }`. Для показа получить Blob через `get(photoId)`, создать временный object URL существующим registry и освобождать при удалении/unmount.
4. На запуске и периодически вызывать `deleteExpired()`. При удалении вещи удалять связанный `photoId`. При `quota_exceeded` не показывать успех и предложить освободить место.
5. `privacyDataController.deleteAll()` теперь асинхронный: обязательно `await controller.deleteAll()` до подтверждения очистки.

## Обратимо-безопасная миграция

Загрузить wardrobe и вызвать `prepareLegacyPhotoMigration(items, photoStorage, consent)`. Она не меняет исходный массив, сначала копирует data URL в photo store и возвращает `items` со ссылками `{ photoId }`, `backup` и `rollback()`. Сохранить новые items через wardrobe repository. Если запись бросила ошибку или `meta.persisted !== true`, вызвать `await migration.rollback()` и оставить прежний JSON. Удалять резервную копию допустимо только после подтверждённой долговечной записи нового envelope. Без отдельного photo-consent миграцию не запускать.

TTL по умолчанию — 30 дней, максимум — 365 дней. Это локальное хранение, не AI-анализ и не upload.

## Cloud photo transport через BFF

При отдельном согласии cloud repository передаёт уже нормализованный Blob в `SupabaseDataPort`. В BFF-режиме браузер отправляет его только на same-origin `/api/provider/storage/v1/object/wardrobe-photos/{userId}/{entityId}/{idempotencyKey}` с credentialed cookie и CSRF intent. BFF проверяет активную сессию, совпадение `userId` с владельцем сессии, ровно три path-сегмента, MIME и сигнатуру JPEG/PNG/WebP, `x-upsert: true` и лимит Supabase bucket 10 MiB. Произвольные bucket/path/query/content type запрещены.

Provider access token остаётся на сервере. BFF пересылает байты в private Supabase bucket и возвращает браузеру только пустой `201` с `ETag`; тело provider-ответа и credentials наружу не передаются. Live cloud upload остаётся HOLD до owner-controlled RLS/storage проверки двух пользователей.
