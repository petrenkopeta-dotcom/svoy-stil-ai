# Photo intake: интеграционный контракт закрытой альфы

Статус автоматического допуска: **HOLD**. В проекте нет подключённого доверенного локального детектора. Ручная декларация пользователя может перевести фото только в `save_and_review`, но не в `accept`.

Дополнение MVP-PHOTO-23: локальные эвристики quality gate и пользовательская декларация дают retake/review guidance, но не считаются production recognition. Даже `accept` доверенного локального detector не открывает сеть без отдельного `photo-processing-consent-v1`.

## Подключение

- UI: `PhotoIntake` из `src/PhotoIntake.jsx`.
- Независимый controller: `createPhotoIntakeController()` из `src/photoIntake.js`.
- `select(file)` выполняет только локальные операции: проверяет сигнатуру и MIME, размер, разрешение, декодирует ориентацию и создаёт canvas-копию без EXIF. Сеть не используется.
- Пока `getState().upload_allowed !== true`, `getUploadPayload()` бросает `PHOTO_UPLOAD_BLOCKED`.
- `declareGarmentOnly(true)` означает только пользовательское подтверждение «на фото отдельная вещь без человека» и даёт статус `save_and_review`.
- `declareGarmentOnly(false)`, человек, неизвестный или неподдерживаемый объект дают `retake` и закрывают upload.
- `getUploadPayload()` возвращает очищенный `blob`, локальную ссылку на `original`, `preserve_original: true`, `background_removal_allowed: false` и `review_required`.

Интегратор сам решает, когда начать разрешённую загрузку, получив payload через `onReady`. Компонент не делает `fetch`, не пишет фото/имя/hash/EXIF в storage или analytics и не вызывает внешние модели.

Автоматический `accept` предусмотрен только как dependency-injection seam `trustedDetector`. До отдельного security/privacy review этот параметр передавать нельзя.
