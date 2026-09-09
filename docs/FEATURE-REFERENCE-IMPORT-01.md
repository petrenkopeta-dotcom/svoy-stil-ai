# FEATURE-REFERENCE-IMPORT-01 — безопасный импорт изображения

## Статус и граница

Самостоятельный слой реализован в `src/imageImport.js`, готовый UI-адаптер — в `src/ReferenceImageImport.jsx`. Существующий `PhotoIntake` и `main.jsx` не изменялись: интегратор явно подключает компонент в нужном пользовательском сценарии.

Бинарные данные обрабатываются локально. Модуль не использует `fetch`, telemetry, storage, распознавание лиц, биометрию или установление личности. Он также не выдаёт сетевое разрешение: `networkAllowed` всегда `false`.

## Входы

- file/gallery: `<input type="file" accept="image/*" capture="environment">`; `capture` — только progressive enhancement;
- desktop drag-and-drop через `imageFromDropEvent`;
- системный paste event через `imageFromClipboardEvent` для JPEG, PNG и WebP. PNG не сводится на белый фон, поэтому результат iOS «Скопировать объект» сохраняет alpha;
- кнопка «Вставить фото» фокусирует paste-зону и сопровождается честной инструкцией «Скопируйте фото и вернитесь сюда».

Кнопка не полагается на `navigator.clipboard.read()`: API может отсутствовать либо требовать permission/user gesture. При запрете пользователь сохраняет рабочий fallback через file input. Пустой clipboard, несовместимый формат и ошибки разрешения должны отображаться по безопасным кодам, без имени файла и содержимого.

## Контракт интегратора

```ts
type InputImage = Readonly<{
  version: "input-image-v1";
  blob: Blob;                  // новая canvas-копия, без EXIF/GPS/ICC/text chunks
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
  provenance: "gallery" | "file" | "drag" | "paste";
  purpose: "reference" | "personal";
  storagePartition: "reference_images" | "personal_images";
  previewUrl: string;          // временный object URL, принадлежит controller
  metadataStripped: true;
  exifGpsStripped: true;
  alphaPreserved: boolean;
  networkAllowed: false;
}>;
```

```js
const controller = createImageImportController();
const dto = await controller.import(file, {
  provenance: "paste",
  purpose: "reference",
});
// Persist only dto.blob and DTO fields required by the product.
// Route by dto.storagePartition; never mix reference and personal records.
controller.dispose(); // cancels work and revokes the current previewUrl
```

Повторный `import()` отменяет предыдущий запрос и отзывает прежний URL. `cancel()`/`dispose()` отменяют активную работу и освобождают preview URL. Компонент вызывает `dispose()` при unmount.

## Защитные ограничения

- вход не более 15 MiB;
- не более 12 000 px по стороне и 40 MP;
- MIME сверяется с magic bytes до decode;
- decode ограничен 8 секундами;
- нормализация уменьшает длинную сторону до 2048 px и повторно кодирует canvas, удаляя метаданные;
- разрешены только JPEG, PNG и WebP; HEIC/HEIF/GIF/SVG отклоняются;
- оригинальный `File` не входит в DTO и не должен сохраняться.

Коды ошибок: `image_import_no_image`, `image_import_permission_denied`, `image_import_unsupported_format`, `image_import_mime_mismatch`, `image_import_empty`, `image_import_too_large`, `image_import_too_many_pixels`, `image_import_decode_failed`, `image_import_decode_timeout`, `image_import_cancelled`, `image_import_sanitize_failed`.

## Известные риски

- Фактическая поддержка WebP decode/canvas зависит от браузера; ошибка закрывается безопасно.
- Paste в Safari/iOS требует, чтобы пользователь активировал/focus paste-зону и выполнил системную вставку.
- Canvas re-encode удаляет embedded metadata, но не изменяет визуально присутствующие в пикселях сведения.
- UI-компонент ещё должен быть подключён владельцем общей страницы и оформлен её дизайн-токенами.

