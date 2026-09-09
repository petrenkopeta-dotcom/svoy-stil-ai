# CV-AUTO-04 — UX/CJM автоматического выделения вещи

Дата: 2026-09-05. Статус: product/UX contract, read-only audit. Продуктовый код не изменён.

## 1. Решение

После gallery, camera, paste или drag-and-drop система автоматически предлагает только видимые кандидаты и их маски. Пользователь видит результат на исходном фото, подтверждает, правит или отклоняет каждый кандидат и лишь затем сохраняет вещь. После успешного сохранения главный CTA сразу собирает первый образ с первой сохранённой вещью как anchor.

Ручной редактор `GarmentOutlineSelector` сохраняется без функционального упрощения и доступен:

- постоянно по ссылке «Выделить вручную» на этапе анализа и проверки;
- для исправления выбранной маски;
- как основной recovery после timeout, ошибки или отсутствия пригодных кандидатов;
- для добавления пропущенной вещи.

Главное ограничение доверия: до действия пользователя это не «найденные вещи», а **предложенные области**. Нельзя писать «AI точно распознал», «фон удалён идеально», «мы нашли N вещей» или скрывать низкую уверенность. Разрешённая формулировка: «Предлагаем проверить N вариантов».

## 2. Что есть сейчас и что меняется

| Контур | Текущее состояние | Требуемое состояние |
|---|---|---|
| Import | Реализованы gallery, camera, paste и drag; локальная нормализация, удаление metadata, JPEG/PNG/WebP, 15 MiB, 40 MP, decode timeout 8 s | Сохранить без ослабления; добавить отдельные понятные сообщения для кодов ошибок и состояние прогресса |
| Automatic candidates | Реальной CV-модели нет; adapter без явных regions возвращает 0 кандидатов | Подключить разрешённый provider через асинхронный boundary; нулевой результат остаётся допустимым, скрытые вещи не синтезируются |
| Review | После импорта пользователь сразу обводит вещь; есть confirm/correct/reject | Сначала overlay всех предложений, затем review выбранного кандидата с mask preview и теми же тремя исходами |
| Mask | Ручной outline имеет `guidance_only`, `untrusted` | Автомаска также остаётся гипотезой до подтверждения; источник, версия и confidence хранятся отдельно |
| Ownership | Только явное «Это моя вещь» разрешает personal wardrobe | Сохранить invariant; подтверждение маски не означает владение |
| Save | Batch save атомарен; возможные дубли не сливаются автоматически | Сохранить; первый personal item становится anchor первого образа |
| First outfit | После save есть «Собрать образ с этой вещью» | Сделать primary happy-path CTA; честно обработать отсутствие достаточного гардероба/кандидата |

Не входят в этот контракт: выбор конкретной CV-модели, обучение, production backend, лицо/тело/биометрия, generative fill, восстановление невидимых частей, real-photo quality claim.

## 3. Happy path и CJM

| Шаг | Намерение пользователя | Экран и действие | Ответ системы | Критерий продолжения |
|---|---|---|---|---|
| 1. Source | Быстро добавить фото | «Добавить вещь по фото» → галерея / камера / вставка / drop | Немедленно показывает локальный preview и этап обработки | Валидный нормализованный bitmap |
| 2. Analyze | Понять, что происходит | Preview остаётся видимым; progress «Ищем видимые вещи…»; доступны cancel и manual | Возвращает 0..N областей, масок и калиброванный confidence | Ответ или timeout |
| 3. Overview | Быстро оценить результат | Overlay с пронумерованными областями и список карточек | «Предлагаем проверить N вариантов» | Выбран один кандидат либо manual add |
| 4. Mask review | Проверить границы | Один кандидат подсвечен, остальное приглушено; before/after toggle | Показывает маску как предложение и confidence-copy | Confirm, edit или reject |
| 5. Attributes | Проверить смысл | Категория и цвет; только сомнительные поля требуют внимания | Verified только после явного действия; неизвестное остаётся unknown | Кандидат review-complete |
| 6. Save | Добавить свою вещь | Checkbox/CTA «Это моя вещь — сохранить» | Атомарное сохранение, возможный дубль только предупреждается | Persistence success |
| 7. First outfit | Получить первую пользу | CTA «Собрать образ с этой вещью» | Личный outfit с сохранённой вещью-anchor или честный no-candidate recovery | Rendered result либо объяснённый fallback |

Целевая траектория первого кандидата: один выбор источника → один экран анализа → один экран проверки → один confirm/save → первый outfit. Категория и цвет не превращаются в обязательную анкету, если система и пользователь уже подтвердили их на review.

## 4. Нормативная state machine

### 4.1 Состояния с инвариантами

| State | UI/invariant | Допустимые выходы |
|---|---|---|
| `source_idle` | Нет draft и object URL | `import_validating` |
| `import_validating` | Source принят, busy объявлен; новый import отменяет старый | `import_normalizing`, `import_error`, `source_idle` |
| `import_normalizing` | Проверка MIME/dimensions и metadata stripping; CV ещё не вызывается | `auto_analyzing`, `import_error`, `source_idle` |
| `import_error` | Безопасный import code сопоставлен с понятным текстом; невалидный файл и его данные не сохраняются | `import_validating` через новый source, `source_idle` |
| `auto_analyzing` | Sanitized preview видим; cancel/manual доступны; кандидатов в UI ещё нет | `candidate_overview`, `auto_empty`, `auto_timeout`, `auto_error`, `manual_editing`, `source_idle` |
| `candidate_overview` | 1..N model-proposed кандидатов; ни один не confirmed/personal | `candidate_review`, `manual_editing`, `source_idle` |
| `candidate_review` | Ровно один active candidate, mask preview и поля | `candidate_confirmed`, `candidate_rejected`, `manual_editing`, `candidate_overview`, `source_idle` |
| `candidate_confirmed` | Маска/поля подтверждены; ownership всё ещё unconfirmed | `candidate_overview`, `saving`, `manual_editing` |
| `candidate_rejected` | Не участвует в save; можно undo | `candidate_overview`, `candidate_review` через undo |
| `auto_empty` | Ноль пригодных visible regions; это не системная ошибка | `manual_editing`, `source_idle` |
| `auto_timeout` | Автоответ проигнорирован после deadline; поздний ответ не меняет UI | `auto_analyzing` через retry, `manual_editing`, `source_idle` |
| `auto_error` | Безопасный reason code, без stack/provider details | `auto_analyzing` через retry, `manual_editing`, `source_idle` |
| `manual_editing` | Существующий редактор; draft фото не теряется; auto mask может стать starting trace | `candidate_review`, `candidate_overview`, `source_idle` |
| `saving` | Только review-complete + ownership-confirmed candidates; повторный submit заблокирован | `saved`, `save_error` |
| `save_error` | Ничего частично не добавлено; review сохранён в памяти | `saving`, `candidate_overview`, `source_idle` |
| `saved` | Есть persistence receipt и anchor ID; temp analysis можно удалить | `first_outfit_loading`, `source_idle`, wardrobe |
| `first_outfit_loading` | Anchor неизменяем; duplicate tap заблокирован | `first_outfit_ready`, `first_outfit_empty`, `first_outfit_error` |
| `first_outfit_ready` | Personal result rendered; не называть «идеальным» | save/feedback/wardrobe |
| `first_outfit_empty` | Недостаточно совместимых личных/demo вещей; сохранённая вещь не теряется | add item, wardrobe, retry when applicable |
| `first_outfit_error` | Item уже сохранён; outfit failure не откатывает save | retry, wardrobe |

### 4.2 События и точные переходы

| From | Event / guard | To | Side effect |
|---|---|---|---|
| `source_idle` | `SOURCE_SELECTED(method)` | `import_validating` | Создать ephemeral import attempt без filename |
| `import_validating` | `VALID` | `import_normalizing` | Decode с существующими лимитами |
| `import_validating`/`import_normalizing` | `IMPORT_FAILED(code)` | `import_error` | Revoke неиспользуемый URL, показать mapped copy |
| `import_normalizing` | `SANITIZED(networkAllowed=false)` | `auto_analyzing` | Создать analysis attempt; передавать только sanitized bitmap при наличии consent/разрешённого контура |
| `auto_analyzing` | `ANALYSIS_SUCCEEDED(regions>0)` | `candidate_overview` | Freeze result/version; сортировать по reading order, не по confidence |
| `auto_analyzing` | `ANALYSIS_SUCCEEDED(regions=0)` | `auto_empty` | Не создавать full-image fake candidate |
| `auto_analyzing` | `DEADLINE_REACHED` | `auto_timeout` | Abort/ignore late response |
| `auto_analyzing` | `ANALYSIS_FAILED(code)` | `auto_error` | Sanitized photo draft остаётся |
| `auto_analyzing`/`auto_empty`/`auto_timeout`/`auto_error` | `OPEN_MANUAL` | `manual_editing` | Открыть текущий editor с фото; auto outline как starting trace только если существует |
| `candidate_overview` | `OPEN_CANDIDATE(id)` | `candidate_review` | Active ID, focus на heading review |
| `candidate_review` | `CONFIRM` и confidence high/medium | `candidate_confirmed` | Записать explicit review; не ownership |
| `candidate_review` | `CONFIRM` и confidence low | `candidate_confirmed` | Разрешено только после отдельного текста «Границы выглядят верно»; никакого auto-confirm |
| `candidate_review` | `EDIT_MASK` | `manual_editing` | Передать trace; original auto evidence сохранять отдельно |
| `candidate_review` | `REJECT` | `candidate_rejected` | Reason — только enum и необязателен |
| `manual_editing` | `MANUAL_CONFIRMED(valid geometry)` | `candidate_review` | Source=`user_corrected`/`user_created`, trust не повышать автоматически выше explicit review |
| `candidate_confirmed`/`candidate_overview` | `SAVE_REQUESTED` и confirmed count=0 | same | Inline error, focus к summary |
| `candidate_confirmed`/`candidate_overview` | `SAVE_REQUESTED` и ownership unchecked | same | Запросить «Это моя вещь» |
| `candidate_confirmed`/`candidate_overview` | `SAVE_REQUESTED` и guards pass | `saving` | Atomic batch write |
| `saving` | `SAVE_SUCCEEDED(anchor_id)` | `saved` | Emit receipt, delete temp model artifacts not required by policy |
| `saving` | `SAVE_FAILED` | `save_error` | No partial wardrobe mutation |
| `saved` | `BUILD_FIRST_OUTFIT` | `first_outfit_loading` | Request must include anchor ID |
| `first_outfit_loading` | `OUTFIT_RENDERED` | `first_outfit_ready` | Announce result once |
| `first_outfit_loading` | `NO_CANDIDATE(reason)` | `first_outfit_empty` | Map stable reason to actionable copy |
| `first_outfit_loading` | `FAILED/TIMEOUT` | `first_outfit_error` | Keep saved item and show retry |
| any non-saving state | `REPLACE_SOURCE` | `source_idle` | Abort work, revoke URLs, clear candidates; confirmation required only if reviewed unsaved edits exist |

Запрещённые переходы: model result → `candidate_confirmed`; mask confirmation → personal ownership; low confidence → hidden candidate; candidate rejection → deletion of source photo without request; outfit error → rollback saved garment.

## 5. Confidence и порядок review

Numeric score не показывается пользователю и не отправляется в product analytics. UI принимает только калиброванный bucket:

| Bucket | UI | Primary action | Автодействие |
|---|---|---|---|
| `high` | «Границы выглядят уверенно — всё равно проверьте» | «Границы верны» | Никогда не подтверждать автоматически |
| `medium` | «Проверьте края вещи» | «Границы верны» | Открыть preview в сравнении с original |
| `low` | «Мы не уверены в границах» | «Исправить границы» | Confirm вторичный; требует отдельного explicit checkbox/statement |
| `unknown` | «Не удалось оценить точность» | «Исправить вручную» | Treat as low, fail open only to manual editor |

Candidate-level confidence не должен маскировать field uncertainty. Категория, цвет, материал и силуэт сохраняют собственные `verified / inferred / unknown`. `inferred` всегда маркируется «Предположение»; `unknown` остаётся «Не определено».

Если candidate частично закрыт, copy: «Часть вещи не видна. Сохраним только подтверждённую видимую область». Нельзя дорисовывать или заявлять форму скрытой части.

## 6. Точная русская UI-копия

### 6.1 Entry и import

- Title: **«Добавить вещь по фото»**
- Lead: «Выберите фото с одной или несколькими хорошо видимыми вещами. Перед сохранением вы всё проверите.»
- Privacy note local mode: «Фото обрабатывается на этом устройстве и не отправляется в сеть.»
- Privacy note permitted remote mode: «Для поиска границ обработанная копия фото будет отправлена сервису анализа. Сохраним вещь только после вашего подтверждения.»
- Gallery: **«Из галереи»** / «Выбрать готовое фото»
- Camera: **«Сфотографировать»** / «Сделать снимок сейчас»
- Paste: **«Вставить фото»** / «Из буфера обмена»
- Drop: **«Перетащите фото сюда»** / «JPG, PNG или WebP · до 15 МБ»
- Secondary: **«Выделить вручную»**

### 6.2 Progress

- Import: «Готовим фото…»
- Analysis: **«Ищем видимые вещи…»**
- Supporting line: «Обычно это занимает несколько секунд. Можно сразу выделить вещь вручную.»
- Cancel: «Отменить»
- Manual: «Выделить вручную»

Не показывать fake percentage. Если есть реальные этапы, использовать indeterminate progressbar с phase label.

### 6.3 Candidate overview

- One: **«Предлагаем проверить 1 вариант»**
- Many: **«Предлагаем проверить {N} {вариант/варианта/вариантов}»**; правило: 1 вариант, 2–4 варианта, 5–20 вариантов, затем по последним двум цифрам
- Supporting: «Это предположения по видимым областям фото. Подтвердите, исправьте или отклоните каждую нужную вещь.»
- Candidate badge: «Вариант {n}»
- Statuses: «Нужно проверить» / «Подтверждено» / «Исправлено вручную» / «Отклонено»
- Card CTA: «Проверить»
- Add missed item: «Добавить пропущенную вещь вручную»
- Replace: «Выбрать другое фото»

### 6.4 Mask review

- Heading: **«Проверьте границы вещи»**
- Toggle: «Исходное фото» / «С выделением»
- High: «Границы выглядят уверенно — всё равно проверьте края.»
- Medium: «Проверьте, что в выделение не попали фон или соседняя вещь.»
- Low: «Мы не уверены в границах. Лучше поправить их вручную.»
- Unknown: «Не удалось оценить точность границ. Проверьте их вручную.»
- Primary high/medium: **«Границы верны»**
- Primary low/unknown: **«Исправить границы»**
- Secondary: «Исправить вручную» / «Это не вещь» / «Назад ко всем вариантам»
- Low-confidence explicit confirm label: «Я проверила границы — они верны»

### 6.5 Attributes and ownership

- Heading: **«Что сохранить?»**
- Field labels: «Категория», «Цвет», «Силуэт / посадка»
- Inferred badge: «Предположение»
- Unknown: «Не определено»
- Ownership: **«Это моя вещь»**
- Supporting: «Подтверждение добавит вещь в личный гардероб.»
- Primary: **«Сохранить вещь»** / plural **«Сохранить выбранные вещи»**
- No selection: «Выберите и подтвердите хотя бы одну вещь.»
- Possible duplicate: «Похоже, такая вещь уже есть в гардеробе. Сравните их — автоматически объединять не будем.»

### 6.6 Saved и first outfit

- Success: **«Вещь сохранена»** / «Сохранено вещей: {N}»
- Supporting: «Теперь соберём первый образ с этой вещью.»
- Primary: **«Собрать образ с этой вещью»**
- Secondary: «Открыть мой гардероб» / «Добавить ещё фото»
- Loading: «Собираем варианты с вашей вещью…»
- Result: **«Первый образ готов»**
- Honest qualifier: «Это один из подходящих вариантов — его можно изменить.»
- No candidate, missing shoes: «Для полного образа не хватает обуви. Добавьте пару или посмотрите сочетание без неё.»
- No candidate, missing base: «Пока не хватает вещей для полного сочетания. Добавьте ещё одну вещь — сохранённая уже в гардеробе.»
- Outfit error: «Вещь сохранена, но сейчас не удалось собрать образ. Попробуйте ещё раз или откройте гардероб.»

## 7. Ошибки и recovery

| Код/условие | Текст | Primary | Secondary / сохранение контекста |
|---|---|---|---|
| no image | «В буфере или переносе нет изображения.» | «Выбрать из галереи» | Source screen остаётся |
| permission denied | «Браузер не дал доступ к буферу обмена.» | «Выбрать из галереи» | «Как вставить вручную»; не повторять permission loop |
| unsupported / animated | «Этот формат пока не поддерживается. Выберите JPG, PNG или WebP без анимации.» | «Выбрать другое фото» | Ничего не сохранять |
| MIME mismatch | «Формат файла не совпадает с его содержимым. Выберите другое фото.» | «Выбрать другое фото» | Не показывать filename |
| empty | «Файл пустой. Выберите другое фото.» | «Выбрать другое фото» | — |
| too large | «Фото больше 15 МБ. Выберите версию меньшего размера.» | «Выбрать другое фото» | — |
| too many pixels | «У фото слишком большое разрешение. Уменьшите его и попробуйте снова.» | «Выбрать другое фото» | — |
| decode/sanitize failed | «Не удалось подготовить фото.» | «Попробовать другое фото» | «Выделить вручную» только если sanitized preview существует |
| import timeout (8 s) | «Фото готовится дольше обычного.» | «Попробовать снова» | «Выбрать другое фото» |
| auto empty | **«Не удалось уверенно выделить вещи»** | «Выделить вещь вручную» | «Выбрать другое фото»; советы: контрастный фон, вещь целиком, без сильных перекрытий |
| auto timeout | **«Автопоиск занял слишком много времени»** | «Выделить вручную» | «Повторить поиск»; draft не теряется |
| auto offline | «Автопоиск сейчас недоступен без сети.» | «Выделить вручную» | «Повторить» только при online |
| auto provider/error | «Не удалось предложить границы. Фото осталось доступно для ручного выделения.» | «Выделить вручную» | «Повторить» |
| invalid manual geometry | «Контур пересекается или получился слишком маленьким. Отмените последнюю точку или начните заново.» | «Отменить точку» | «Начать заново» |
| all rejected | «На фото не осталось выбранных вещей.» | «Добавить вручную» | «Выбрать другое фото» |
| save failed | «Не удалось сохранить набор. Гардероб не изменён.» | «Повторить сохранение» | «Вернуться к проверке»; edits preserved |
| outfit timeout/error | «Вещь сохранена, но образ пока не собрался.» | «Повторить» | «Открыть гардероб» |

Retry создаёт новый attempt ID и имеет максимум один заметный автоматический backoff; UI никогда не повторяет обработку бесконечно. Анализ получает отдельный продуктовый deadline (рекомендуемый стартовый порог 12 s, калибруется по p95); import decode сохраняет существующие 8 s. Поздний результат старого attempt отбрасывается.

## 8. Mobile, touch и camera

- Layout обязателен на 320, 360, 390, 412 и 430 CSS px, portrait и landscape; без page-level horizontal scroll.
- На mobile import methods — вертикальные full-width cards. Drag-drop скрывается только как подсказка, но paste и gallery остаются.
- `capture="environment"` — progressive enhancement, не обещание прямого открытия камеры. После возврата из camera picker пользователь попадает в `import_validating`, не на пустой экран.
- Учитывать EXIF orientation до preview; safe-area inset применяется к sticky CTA. Открытие клавиатуры не должно закрывать выбранное поле/кнопку save.
- Overview: overlay на фото + горизонтально или вертикально связанный список. Выбор карточки всегда подсвечивает ту же область номером и цветом; связь не строится только на цвете.
- Mask review на узком экране: фото сверху, действия снизу; primary sticky, но не перекрывает ошибки/status. Pinch zoom/pan разрешены в preview и не изменяют маску.
- Ручное редактирование входит только в явный edit mode. Вне него вертикальный scroll страницы работает. В edit mode есть видимая кнопка «Готово»/«Выйти из редактирования».
- Все hit targets минимум 44×44 CSS px; handles имеют визуальный размер ≥12 px и невидимую hit-area 44 px; соседние destructive actions разнесены.
- Нельзя требовать drag, freehand или long press как единственный способ. Для mask обязательны undo, redo, reset, delete any point и текстовый/клавиатурный альтернативный путь.
- При app background/foreground draft сохраняется в памяти текущей сессии; повторная камера не смешивает старый result с новым bitmap.

## 9. Accessibility

### Семантика и focus

- Один `main/dialog` landmark, один `h1/h2`, последовательные headings. Dialog сохраняет trap, Escape/cancel и возвращает focus к launch control.
- После выбора source focus не прыгает: `aria-live="polite"` сообщает «Готовим фото». После завершения анализа focus программно ставится на heading overview; если пользователь уже взаимодействует с manual CTA, его не перехватывать.
- Busy container имеет `aria-busy=true`; indeterminate progressbar получает accessible name и не озвучивает fake values.
- Candidate overlay сам по себе `aria-hidden`; эквивалентный ordered list содержит номер, предполагаемую категорию, status/confidence copy и button «Проверить вариант N».
- Active candidate объявляется как «Вариант N из N». Toggle original/mask — группа из двух настоящих buttons/radios с selected state.
- Ошибки — `role=alert` только для блокирующей смены состояния; validation errors связаны через `aria-invalid` и `aria-errormessage`. Success/progress — polite status. Не объявлять движение каждой точки во время drag.
- После confirm/reject focus переходит на status кандидата и затем доступен следующий «Проверить». После save — на success heading; после outfit ready — на result heading.

### Keyboard и non-visual mask path

- Полный happy path выполняется Tab/Shift+Tab/Enter/Space без pointer. Порядок DOM совпадает с визуальным.
- Для ручного редактора сохранить ввод X/Y и добавить: список точек, edit/delete каждой точки, undo/redo, корректную raw validation без молчаливого clamp в 0.
- Non-visual alternative «Описать область вещи»: всё фото / центр / верхняя, нижняя, левая, правая половина / ячейки 3×3; затем вопросы «Вещь целиком внутри области?», «В области только одна вещь?», «Нет человека, рук или других личных деталей?». Unknown/«не уверена» ведёт к retake, draft или сохранению без фото, но не обходит gate.
- Итоговый read-back: область, single-garment declaration, personal-detail declaration, source `user_described`, trust `untrusted`.

### Zoom, contrast, motion

- Acceptance: browser zoom 200% и 400%, text spacing override и 320 CSS px. Контролы reflow, фото может иметь внутренний pan, но текст/действия не требуют двухмерного scroll.
- Focus indicator ≥2 CSS px с контрастом ≥3:1; обычный текст ≥4.5:1, крупный ≥3:1; граница mask не кодируется только цветом (stroke + translucent fill + number/pattern).
- `prefers-reduced-motion`: убрать animated shimmer/zoom; progress остаётся понятным текстом. Никаких таймеров на решение пользователя.
- Screen-reader release evidence: NVDA + Edge и ещё одна поддерживаемая пара; touch evidence — минимум один coarse-pointer device.

## 10. Privacy-safe analytics

Analytics начинается только после действующего consent. Product events содержат только enum, bounded integer, boolean и coarse latency/confidence buckets. Запрещены: pixels/blob/base64, filename/path, URL/source URL, clipboard content, EXIF/GPS, hashes/fingerprints, raw model score/logit, bounding boxes, masks/points, labels/free text, inferred garment attributes, provider request ID, account/email/device advertising ID.

Общие поля, добавляемые collector, должны оставаться текущими privacy-safe session/environment identifiers. `attempt_id` — только ephemeral in-memory correlation и не экспортируется в product event.

### Allowlist событий

| Event | Когда | Разрешённые properties |
|---|---|---|
| `cv_import_started` | Source выбран | `method: gallery|file|camera|drag|paste`, `purpose: personal|reference` |
| `cv_import_completed` | Sanitized DTO готов | `method`, `latency_bucket: lt_1s|1_2s|2_8s|gte_8s` |
| `cv_import_failed` | Safe import error | `method`, `reason: no_image|permission|format|mismatch|empty|size|pixels|decode|timeout|sanitize|unknown` |
| `cv_analysis_started` | Разрешённый анализ начат | `mode: local|remote_permitted` |
| `cv_analysis_completed` | Freeze candidates | `candidate_count_bucket: 0|1|2|3_plus`, `latency_bucket: lt_2s|2_5s|5_12s|gte_12s`, `result_confidence_bucket: low|medium|high|unknown` |
| `cv_analysis_failed` | Error/timeout/offline | `reason: timeout|offline|provider_unavailable|invalid_output|unknown`, `fallback_offered: true` |
| `cv_manual_opened` | Ручной editor открыт | `entry: proactive|low_confidence|empty|timeout|error|edit|missed_item` |
| `cv_candidate_reviewed` | Confirm/edit/reject | `action: confirm|edit|reject`, `confidence_bucket`, `candidate_position_bucket: first|other` |
| `cv_candidate_batch_ready` | Перед save | `selected_count_bucket: 1|2|3_plus`, `manual_used: boolean` |
| `cv_save_completed` | Atomic save success | `item_count_bucket: 1|2|3_plus`, `possible_duplicate: boolean` |
| `cv_save_failed` | Atomic save failure | `reason: storage|quota|validation|unknown` |
| `cv_first_outfit_requested` | CTA после save | `anchor_source: first_saved_item` |
| `cv_first_outfit_outcome` | Render/empty/error/timeout | `outcome: rendered|empty|error|timeout`, `reason: none|missing_shoes|missing_base|no_candidate|unavailable|unknown` |

Не отправлять event на каждую точку/drag. `edit` означает вход в editor, а не геометрию. Повторные retry различаются только `attempt_bucket: 1|2|3_plus`, если это нужно технической диагностике.

### Funnel и guardrails

- Primary: `cv_first_outfit_outcome(rendered) / cv_import_started` в той же consented session.
- Time to first outfit: от `cv_import_started` до rendered, только coarse distribution.
- Review completion: save completed / analysis completed with `candidate_count>0`.
- Manual rescue: save completed after `manual_used=true` / sessions with empty, timeout, error or low-confidence result.
- False-delight guardrail: reject after high-confidence bucket; edit after high-confidence bucket; save undo/delete shortly after save (если уже есть privacy-safe authoritative event).
- Reliability: import failure by safe reason, analysis timeout, save atomic failure, first-outfit empty/error.

Нельзя интерпретировать confirm rate как accuracy. Quality claim требует отдельного consented, licensed, ground-truth eval corpus и calibration report.

## 11. Acceptance / release gate

### Functional

1. Все пять methods (gallery, file picker where distinct, camera, drag, paste) проходят один и тот же validation/sanitization contract.
2. Автоответ с 1, несколькими и 0 regions проходит точные состояния; stale/late response не заменяет новый photo draft.
3. Ни один model candidate не сохраняется без mask/field review и явного «Это моя вещь».
4. Confirm/edit/reject и undo работают независимо для каждого кандидата; rejected не попадает в batch.
5. Low/unknown confidence никогда не auto-confirms и ведёт primary к manual correction.
6. Existing manual editor доступен до, во время и после auto result; его geometry validation не ослаблена.
7. Save атомарен, possible duplicate не auto-merges; после success anchor ID соответствует реально сохранённой вещи.
8. First outfit либо содержит anchor, либо показывает стабильный actionable reason; failure не удаляет вещь.

### UX, a11y, privacy

9. Copy использует «предлагаем», «предположение», «проверьте» и не содержит недоказанных AI/accuracy claims.
10. 320–430 px, landscape, 200%/400%, reduced motion, keyboard-only, NVDA+Edge и вторая SR-пара проходят сценарий и recovery.
11. Touch targets, scroll/edit-mode, orientation, camera return, safe area и virtual keyboard проходят real/coarse-pointer evidence.
12. Zero PII telemetry проверен denylist-тестами; unknown event/property fail closed; pixels/geometry/provider IDs отсутствуют в collector/export.
13. Local-only mode даёт zero egress. Remote-permitted mode имеет отдельное информированное разрешение и правдивую copy до передачи bitmap.
14. Object URLs, abort controllers и temp analysis очищаются при replace/cancel/unmount; persisted photo/delete следуют текущему privacy contract.

### Evidence before PASS

- table-driven state-transition tests, включая forbidden transitions и race old/new source;
- contract tests для confidence buckets, visibility/occlusion и zero-candidate behavior;
- browser journeys для всех import methods, timeout/error/retry/manual rescue/save/outfit;
- screenshots/reflow/focus transcripts на обязательной матрице;
- screen-reader transcript и real touch/camera evidence;
- zero-egress capture для local mode и payload snapshot tests для analytics;
- licensed real-photo eval с precision/recall/mask-quality и calibration по заранее утверждённым сегментам до любого публичного quality claim.

Текущий release verdict: **HOLD для автоматического happy path**. Import, manual outline и domain boundaries дают подходящую основу, но реальная CV-модель, calibration, интеграционный state controller и end-to-end evidence пока не доказаны.

## 12. Рекомендуемая последовательность реализации

1. Зафиксировать controller/reducer этой state machine и provider-neutral analysis response.
2. Подключить auto overlay/readable candidate list без save.
3. Добавить mask review и seed существующего manual editor; закрыть keyboard/non-visual gaps редактора.
4. Соединить explicit ownership, atomic save и anchor-first outfit.
5. Добавить allowlisted analytics и denylist tests.
6. Провести real-photo calibration, mobile/SR/zero-egress gates; только затем менять HOLD на PASS.
