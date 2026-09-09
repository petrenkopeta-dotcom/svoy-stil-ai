# PHOTO-PERSON-07 — mobile capture guidance

Статус: **HOLD**  
Дата: 2026-08-21  
Контур: локальный PHOTO-PERSON intake, viewport 320–430 CSS px

## Решение

Мобильный вход строится как явный выбор `Сфотографировать` / `Выбрать из галереи`, после которого изображение обрабатывается только на устройстве. Никакой сетевой отправки, фонового upload или обращения к внешней модели нет. Фото человека, лицо или неоднозначное содержимое закрывают дальнейший автоматический путь: пользователь должен переснять отдельную вещь без человека либо выйти в demo/manual contour.

Текущий single-garment gate остаётся обязательным и не ослабляется. Декларация пользователя «на фото одна вещь без человека» разрешает только `save_and_review`, но никогда не `accept`. Production recognition, биометрия, идентификация лица, embeddings/templates и выводы о теле, здоровье, возрасте, гендере или этничности не входят в scope и запрещены. Generative inpainting также запрещён.

## UX-контракт на ширинах 320–430

Экран должен работать при 320, 360, 390, 412 и 430 CSS px без горизонтального scroll, обрезанного CTA и перекрытия системной клавиатурой/safe area. Минимальная touch-зона — 44×44 CSS px, основной CTA занимает доступную ширину, текст остаётся читаемым при системном увеличении 200%. Диалог блокирует прокрутку фона, удерживает focus, закрывается по Escape/системному Back и возвращает focus инициатору.

Порядок экрана:

1. Короткая privacy-подсказка до открытия системного picker.
2. Две равнозначные кнопки: `Сфотографировать вещь` и `Выбрать из галереи`.
3. После выбора — локальный preview, результат quality gate и действия `Использовать фото`, `Переснять`/`Выбрать другое`, `Удалить`.
4. `Использовать фото` доступно только для поддержанного и декодированного файла после явной декларации single-garment; результат остаётся `save_and_review`.
5. `Удалить` немедленно очищает preview, рабочий Blob/canvas и временный object URL. Нельзя обещать удаление системной копии из приложения Камера/Фото.

На узкой ширине кнопки не ставятся в одну строку, если каждая не сохраняет 44 px и полный label. Ошибки показываются рядом с preview и объявляются через live region; цвет не является единственным сигналом. Никаких точных процентов прогресса: допустимы этапы `Проверяем на устройстве` и `Готово к просмотру`.

## Camera и gallery flow

### Camera

- Web/PWA вызывает системный file input с `accept="image/jpeg,image/png,image/webp,image/heic,image/heif"` и capture hint `environment`; это подсказка браузеру, а не гарантия задней камеры.
- Нельзя автоматически запускать камеру при загрузке страницы. Только после user gesture.
- Если устройство показывает общий chooser вместо камеры, UI принимает это как нормальный gallery path.
- После возврата приложение проверяет magic bytes/MIME, лимит размера, декодирование и разрешение до создания долговечного состояния.
- Повторный capture должен работать даже для файла с тем же именем: input очищается после обработки.
- Отмена системного picker не создаёт ошибку и сохраняет предыдущий безопасный экран/preview.

### Gallery

- Выбор по умолчанию одиночный; `multiple` запрещён.
- Источник и полный filesystem path не читаются и не сохраняются.
- Фото может содержать EXIF/GPS только во входном системном файле. Рабочая canvas-копия создаётся без EXIF; метаданные не логируются и не переносятся.
- Если пользователь выбрал Live Photo/motion asset, обрабатывается только поддержанный still image; неподдержанный контейнер получает понятный fallback, не молчаливую загрузку.

## Permissions

Web file picker обычно не требует постоянного camera/gallery permission. Если конкретная оболочка запрашивает разрешение, prompt показывается только после нажатия соответствующей кнопки и сопровождается purpose copy.

Состояния:

| Состояние | Поведение |
|---|---|
| `prompt` | Объяснить цель одной строкой, затем открыть системный prompt по user gesture. |
| `granted` | Открыть системную камеру/picker; не считать это согласием на хранение или обработку вне устройства. |
| `denied` | Не повторять prompt циклически; предложить `Выбрать из галереи` и краткую инструкцию по настройкам. |
| `restricted/unavailable` | Показать безопасный gallery/manual fallback; не изображать наличие камеры. |

Разрешение ОС и product consent — разные вещи. Доступ к камере/фото не означает согласие сохранить фото. Отдельный versioned consent требуется перед локальным долговременным хранением; сеть в этой wave отсутствует при любом consent.

## Orientation и mirroring

- Preview и рабочая копия используют фактическую decoded orientation, включая EXIF orientations 1–8.
- Нормализация выполняется один раз в canvas; width/height quality checks применяются после ориентации.
- Не полагаться только на EXIF: браузер может уже применить ориентацию при decode.
- Для `environment` camera preview не зеркалится. Если оболочка фактически вернула mirrored selfie, приложение не делает автоматическую семантическую коррекцию; photo-person gate требует переснять вещь без человека.
- При невозможности надёжно декодировать ориентацию — `retake/choose another`, а не сохранение повёрнутого изображения.

## HEIC/HEIF fallback

Текущий доверенный intake поддерживает только JPEG, PNG и WebP. Указание HEIC/HEIF в системном chooser улучшает возможность выбора, но не является заявлением о поддержке декодирования.

Порядок fallback:

1. Попробовать локальный browser decode без отправки файла.
2. Если браузер вернул уже совместимый JPEG — обработать как JPEG после magic-byte проверки.
3. Если HEIC/HEIF не декодируется, не выполнять server conversion и не подключать скрытый codec/provider. Показать: `Этот формат пока не поддерживается на этом устройстве. Выберите JPEG/PNG/WebP или в настройках камеры включите «Наиболее совместимый» формат.`
4. Сохранить возможность вернуться к picker; входной HEIC не кэшировать.

Будущий локальный HEIC decoder допустим только как отдельно проверенная isolated dependency с resource limits, license/security review и device benchmark. До этого HEIC acceptance — **HOLD**.

## Offline и восстановление

- Capture, decode, preview, quality guidance, retake и delete работают без сети после загрузки приложения.
- Offline не показывается как ошибка, потому что сеть не нужна. UI явно говорит `Фото остаётся на этом устройстве`.
- Кратковременный state держится в памяти. Долговременная IndexedDB-запись возможна только после отдельного consent.
- Memory fallback не называется сохранением: при `meta.persisted=false` показывать `Не сохранено на устройстве`.
- Reload/background eviction может уничтожить неподтверждённый draft; UI не обещает восстановление без подтверждённой persistence.
- Demo и personal namespaces физически/логически разделены. Demo asset не мигрирует в personal автоматически; импорт требует отдельного действия и consent.

## Thermal, battery и memory constraints

- Одновременно декодируется только один файл. Новый выбор отменяет/инвалидирует предыдущую работу и освобождает bitmap, canvas и object URL.
- До полного decode проверяются byte limit и сигнатура; после decode — pixel count. Используются существующие лимиты intake, без их повышения на mobile.
- Рабочее изображение уменьшается локально до минимального разрешения, достаточного для review/quality gate; original не дублируется в нескольких in-memory representations дольше необходимого.
- Canvas/bitmap освобождаются сразу после получения очищенного Blob; object URL отзывается при replacement, delete и unmount.
- Нет бесконечного retry, background polling или параллельной пакетной обработки. Максимум одна активная попытка и одна явная повторная попытка пользователя.
- При `visibilitychange`, memory pressure, decode timeout, `QuotaExceededError` или thermal-related abort работа безопасно прекращается: `Не удалось обработать фото на устройстве — выберите другое или попробуйте позже`.
- На слабом устройстве качество интерфейса приоритетнее автоматической проверки: допустим `manual_only`, но нельзя обходить single-garment/person gate.

Целевые бюджеты для device verification, а не текущие доказанные значения: quality feedback p95 ≤2 s на поддержанном mobile image; peak JS/decoded-image working set ≤120 MB на 12 MP JPEG; main-thread long tasks >200 ms — не более двух на capture; отсутствие crash/reload на 3 последовательных retake.

## Retake overlay

Overlay рисуется поверх preview только как UI-слой и не записывается в изображение. Он включает безопасную рамку 8–12% от краёв и короткий checklist:

- `Одна вещь целиком в кадре`;
- `Без человека, лица, рук и манекена`;
- `Контрастный однотонный фон`;
- `Ровный свет, без сильной тени и бликов`;
- `Не обрезайте края, лямки, ручки и обувь`.

Причина retake должна быть конкретной и не диагностической: `Вещь обрезана`, `В кадре может быть человек`, `Похоже, вещей несколько`, `Слишком темно`, `Фото размыто`, `Формат не поддерживается`. При любом person/face/unknown signal основной CTA — `Переснять без человека`; `Использовать всё равно` отсутствует. Если trusted detector недоступен, декларация пользователя оставляет только `save_and_review`.

## Privacy copy

Короткий текст до picker:

> Сфотографируйте одну вещь без человека. Фото обрабатывается на этом устройстве и никуда не отправляется. Сохранение — только после вашего отдельного согласия.

Текст у preview:

> Проверьте фото: одна вещь целиком, без лица и тела. Можно переснять или удалить сейчас. Удаление уберёт локальную копию из AI-стилиста, но не из приложения Камера/Фото.

Текст consent для personal contour:

> Сохранить это фото на устройстве для личного гардероба? Оно не попадёт в demo и не будет отправлено в сеть. Вы сможете удалить его из карточки вещи.

Запрещённые формулировки: `анонимно` без доказанного протокола, `удалено везде`, `AI распознал человека`, `биометрическая проверка`, обещания server/cloud backup или синхронизации.

## State contract

`idle → choosing → decoding → local_check → retake | unsupported | save_and_review → consent_prompt → persisted | memory_only`

Любой unexpected error переходит в `retake` или `manual_only`, очищает чувствительные промежуточные данные и не открывает upload. Ни один state этой wave не равен production `accept`.

## Acceptance criteria

- На 320/360/390/412/430 CSS px: нет horizontal overflow, обрезки CTA/preview, фонового scroll в dialog; все интерактивные зоны ≥44×44 px.
- Camera и gallery открываются только по user gesture; cancel не считается ошибкой; repeated same-file selection работает.
- Permission denied/restricted имеет gallery/manual fallback и не создаёт prompt loop.
- JPEG/PNG/WebP корректно проходят magic-byte, post-orientation dimension и decode checks; orientations 1–8 показаны правильно.
- Неподдержанный HEIC/HEIF никогда не уходит в сеть, не сохраняется и получает совместимый fallback copy.
- Airplane-mode прогон завершает capture→preview→retake/delete без external request.
- Network listener фиксирует 0 внешних запросов до, во время и после consent.
- Person/face, несколько вещей, unknown content и отсутствие trusted detector не дают `accept`; single-garment declaration даёт максимум `save_and_review`.
- Overlay не изменяет пиксели asset; inpainting/crop reconstruction отсутствуют.
- Replace/delete/unmount отзывают object URL и освобождают промежуточные buffers; 3 retake подряд не приводят к crash/reload.
- `persisted=false` не показывает success; personal/demo данные не смешиваются.
- Delete удаляет локальный app asset и честно сообщает, что системная Camera/Photos copy не затронута.
- Screen reader объявляет permission/error/retake state; keyboard/Back/Escape path не оставляет focus за dialog.

## Evidence required for PASS

Текущий статус — **HOLD**, потому что этот документ задаёт контракт, но не доказывает реализацию. Для PASS нужны:

1. Реальные device/browser прогоны: iOS Safari, Android Chrome и установленный PWA/WebView, минимум по одному low/mid-range устройству.
2. Матрица 320/360/390/412/430 с screenshots, DOM geometry, touch targets, focus/scroll-lock и 200% text zoom.
3. Fixtures ориентаций 1–8, JPEG/PNG/WebP, валидный и неподдержанный HEIC/HEIF, oversized/corrupt files.
4. Airplane-mode и request-log evidence с нулём внешних запросов.
5. Memory/thermal trace для 12 MP image, трёх retake и background/foreground transitions.
6. Negative privacy tests: EXIF/GPS отсутствуют в рабочей копии и логах; object URLs revoked; delete/replace/unmount очищают local artifacts.
7. Gate tests: person/face/multiple/unknown/trusted-detector-unavailable никогда не становятся `accept`.

## Риски

- iOS/Android по-разному трактуют `capture`, MIME и HEIC conversion; browser behavior нельзя выводить только из desktop emulation.
- Большие HEIC/JPEG создают кратный decoded-memory spike и могут вызвать tab eviction до cleanup.
- Browser может уже применить EXIF orientation, что создаёт риск двойного поворота.
- ОС может сохранить camera photo вне app sandbox; product delete не управляет этой копией.
- Эвристики человека/лица не являются доверенным detector и могут пропустить чувствительный кадр; поэтому fail-closed/manual review обязателен.
- Недоказанный mobile viewport/undersized controls из `BACKLOG-08` блокируют общий mobile PASS до повторного browser evidence.
- Canvas conversion может сдвигать цвет; это требует реального device color benchmark и не должно маскироваться фильтрами.

## Зависимости

- Действующий `PhotoIntake`/`createPhotoIntakeController` и неизменённый single-garment gate.
- `createObjectUrlRegistry` и offline-first persistence contract с `meta.persisted`.
- Утверждённые byte/pixel/decode timeout limits.
- Отдельный consent aggregate и разделённые demo/personal repositories.
- Mobile device lab или реальные устройства, request/console instrumentation, memory/performance profiling.
- Для будущего HEIC: isolated audited local decoder и отдельный release gate; server conversion не является зависимостью этой wave.

## Итоговый gate

**HOLD.** Спецификация сохраняет local-first, explicit consent/delete, demo/personal separation и текущий single-garment fail-closed gate. PASS возможен только после реализации и воспроизводимого real-device evidence по всем acceptance criteria; desktop emulation и unit tests сами по себе недостаточны.

