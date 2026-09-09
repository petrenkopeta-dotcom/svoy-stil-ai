# PHOTO-PERSON-02 — threat model для фотографий с человеком

Статус: **HOLD**  
Дата: 2026-08-21  
Область решения: новая PHOTO-PERSON wave, только локальный исследовательский контур  
Release owner: PHOTO-PERSON integration/security owner

## 1. Решение

PHOTO-PERSON-02 нельзя допускать в production или смешивать с текущим photo-intake. Активный контракт принимает только одну отдельную вещь без человека; пользовательская декларация даёт лишь `save_and_review`, а наличие или неустранённая вероятность человека закрывает путь. Этот fail-closed gate остаётся default и не может быть ослаблен.

Любая будущая работа с фотографией человека допустима только как отдельная, выключенная по умолчанию локальная capability с отдельным экраном согласия, отдельным namespace хранения и отдельным lifecycle удаления. Она не получает сетевого выхода и не создаёт биометрию, идентичность лица, embeddings/templates либо выводы о теле, здоровье, возрасте, гендере или этничности. Генеративное изменение изображения, включая inpainting, запрещено.

Текущий итог: **HOLD** до выполнения всех обязательных критериев раздела 8 и независимой проверки доказательств. Отказ, закрытие consent или ошибка всегда возвращают пользователя в существующий demo/manual/single-garment путь.

## 2. Scope, допущения и запреты

### В scope

- фото, выбранное пользователем с устройства, на котором может присутствовать человек или лицо;
- локальный preview и строго необходимая локальная обработка без идентификации;
- явное согласие до декодирования/сохранения person-photo и явное удаление;
- временные Blob/object URL, browser caches, IndexedDB/memory, EXIF и производные;
- разделение demo и personal, owner/session scope на одном устройстве;
- защита от ошибочной загрузки, spoofed/polyglot/decompression-bomb файлов и resource exhaustion;
- инцидентное удаление и восстановление безопасного состояния.

### Вне scope и запрещено

- любой network upload, remote model/provider, CDN, object storage или синхронизация;
- face detection, recognition, verification, clustering, similarity search или identity claim;
- face/body embeddings, templates, landmarks или обратимо связанный feature vector;
- вывод тела/здоровья/возраста/гендера/этничности и прокси таких признаков;
- generative inpainting, virtual try-on или дорисовка скрытых частей человека/вещи;
- Auth, Supabase, VK ID, платежи и retail-интеграции;
- использование person-photo для обучения, eval-корпуса, support attachments или telemetry;
- изменение existing single-garment default gate.

Если для функции требуется хотя бы один запрещённый элемент, решение автоматически `HOLD`, а не «временное исключение».

## 3. Активы, субъекты и trust boundaries

Наиболее чувствительный актив — исходные пиксели person-photo. Также чувствительны очищенная копия, thumbnails/canvas, EXIF/GPS, имя и путь файла, object/data URL, clipboard/screenshot, crash dump, debug payload, correlation data и любые производные, позволяющие восстановить или сопоставить человека.

Субъекты: текущий пользователь устройства; другой пользователь того же browser profile; человек, изображённый на фото и не обязательно совпадающий с пользователем; разработчик/оператор с доступом к логам; вредоносный script/extension; процесс браузера и ОС.

Trust boundaries:

1. файловая система/камера → browser file picker;
2. недоверенные bytes → parser/decoder;
3. decoded pixels → canvas/worker/UI preview;
4. transient memory/object URL → browser document, history, cache, screenshots и extensions;
5. personal namespace → demo namespace и другой локальный owner/session;
6. приложение → logs, telemetry, error reporting, exports и DevTools;
7. active state → delete/reset/expiry/recovery.

Сеть считается недоверенной и для этой wave недоступна. CSP/service worker сами по себе не являются разрешением на egress.

## 4. Обязательные invariants

- `network_allowed === false` на уровне policy и исполняемого адаптера; person bytes и производные никогда не попадают в `fetch`, XHR, beacon, WebSocket, service-worker queue или URL parameters.
- Существующий garment-only intake не принимает person-photo и не меняет свои thresholds/copy/status transitions.
- До отдельного opt-in person-photo не читается глубже минимальной проверки контейнера и не сохраняется. Отзыв согласия закрывает preview и запускает purge.
- Обработка выполняется локально; после refresh/crash восстановление не показывает фото без действующего consent и совпавшего personal owner scope.
- Demo никогда не читает, не копирует и не экспортирует personal photo state. Demo identifiers не могут адресовать personal records.
- Не создаются embeddings/templates/landmarks, persistent perceptual hashes или признаки человека. Разрешены только эфемерные технические counters, не описывающие содержимое изображения.
- Original и каждая производная имеют единый lineage и удаляются атомарно с точки зрения UI: сначала блокируется доступ, затем best-effort purge всех копий с проверяемым receipt.
- Ни bytes, ни URL, ни filename/path, ни EXIF, ни свободный текст ошибки не входят в logs/telemetry/export.
- Любая неоднозначность, parser error, quota error, timeout, owner mismatch или неподдерживаемый тип завершает операцию fail closed и предлагает manual/demo recovery.

## 5. Threat register

| ID | Угроза / сценарий | Последствие | Обязательная защита | Остаточный риск |
|---|---|---|---|---|
| T1 | Лицо видно в preview, thumbnail, recent-items UI, task switcher или при screen sharing | Раскрытие личности/контекста без намерения пользователя | Privacy screen до opt-in; preview только после согласия; без thumbnails вне активного экрана; blur/маскирование лица **не использовать**, так как это потребовало бы face detection; явное предупреждение о системных screenshots | Пользователь или ОС всё ещё могут сделать screenshot; полностью предотвратить это в web нельзя |
| T2 | Screenshot сохраняется ОС, браузером, тестовым harness или support-процессом | Неконтролируемая копия вне lifecycle приложения | Не делать автоматические screenshots; e2e с person-photo запрещён; тесты только синтетические no-person fixtures; UI сообщает, что системные снимки приложением не удаляются; support runbook запрещает запрос снимка | Внешняя ОС/extension остаётся вне контроля приложения |
| T3 | Blob/object URL остаётся активным после замены, удаления, unmount или error | Повторный доступ к пикселям из document/extension | Единый registry; revoke при replacement, clear, delete, route change, unmount и exception; URL не сохранять в storage/state export/log; тестировать revoked URL | Уже прочитанные пиксели нельзя «отозвать» у вредоносного расширения |
| T4 | Browser HTTP cache, Cache Storage или service worker сохраняет asset/request | Фото переживает consent/delete | Не создавать сетевой request; не использовать HTTP URL; запрет Cache API/service-worker messaging для person assets; purge соответствующего isolated namespace при delete/recovery | Browser/OS memory pages контролируются платформой |
| T5 | EXIF/GPS, thumbnail или ICC/comment metadata переживают sanitize | Геолокация, устройство, скрытая копия лица | Decode → новый canvas/blob локально; не копировать metadata; проверять отсутствие EXIF/GPS и embedded thumbnail; original не сохранять по умолчанию; если нужен transient original — только memory до sanitize и немедленный release | Decoder/codec vulnerability или platform metadata behavior требует browser matrix |
| T6 | Model inversion, membership inference или восстановление из templates/embeddings | Восстановление лица или долгоживущий идентификатор | Не обучать/дообучать модель; не создавать и не сохранять embeddings/templates/landmarks; не кэшировать activations; статический denylist API/fields + runtime assertion + repository schema rejection | Любая будущая ML-capability потребует нового threat model и отдельного разрешения |
| T7 | Пользователь случайно выбирает person-photo в garment-only flow | Нежелательная обработка/сохранение | Текущий gate остаётся fail closed: человек/unknown → `retake`, upload false; preview должен иметь immediate «Удалить»; person capability не открывать автоматически | Ручная декларация не доказывает отсутствие человека; trusted detector пока отсутствует |
| T8 | Пользователь случайно выбирает чужое или чувствительное person-photo в opt-in flow | Нарушение ожиданий изображённого лица | Just-in-time copy: подтверждение права/согласия изображённых людей и локального назначения; до подтверждения нет persistence; простое cancel/purge | Самодекларация не доказывает согласие третьего лица |
| T9 | Cross-owner/session access через угадываемый ID, stale React state, back/forward cache или общий browser profile | Другой пользователь видит personal photo | Непредсказуемый ID; owner namespace в каждом record и lookup; deny on missing/mismatch; clear memory/object URLs при owner/session change, `pagehide`, logout-like local switch и BFCache restore; demo физически отдельный namespace | Без OS/browser account isolation общий профиль остаётся слабой границей |
| T10 | Personal photo попадает в demo seed/export или demo становится personal | Нарушение разделения и ложное согласие | Одностороннее правило: demo assets immutable и bundled; personal records не участвуют в demo; экспорт по умолчанию исключает photo bytes/URLs; явный personal delete не влияет на demo seed | UI-смешение возможно без dedicated integration tests |
| T11 | Filename, EXIF, blob/data URL, stack payload, pixels или content-derived label попадают в console/log/telemetry | Утечка через инструменты разработчика или последующий экспорт | Строгий allowlist событий; только enum/bucket; запрет `photo/image/file/path/name/free_text`, URL и bytes; logger redaction до sink; error codes вместо exception payload; local telemetry opt-in и отдельное delete | Browser/third-party extension console capture вне контроля; third-party SDK запрещён |
| T12 | Oversized/decompression-bomb/animation вызывает CPU, memory, storage или UI DoS | Crash, зависание, потеря локальных данных | Проверить magic bytes/MIME/size до decode; жёсткие max dimensions/pixels/frames; worker с timeout и cancel; один активный decode; bounded queue; no retry loop; quota preflight и cleanup partial records | Нативный decoder может аварийно завершить renderer до application timeout |
| T13 | Spoofed extension/MIME, polyglot, malformed EXIF/ICC или SVG masquerading as image | XSS, decoder exploit, обход gate | Allowlist JPEG/PNG/WebP magic bytes с точным MIME match; SVG/GIF/HEIC/unknown reject; decode only via image decoder, никогда не вставлять исходный markup; canvas re-encode; CSP без blob scripts; fuzz corpus | Zero-day в browser decoder остаётся платформенным риском |
| T14 | Race: старый async decode завершился после нового выбора/delete | Удалённое фото снова появляется или сохраняется | Monotonic selection generation + AbortSignal; commit только если generation, consent и owner всё ещё совпадают; delete инвалидирует все jobs до purge | Необходимо доказательство для каждого async stage, не только intake |
| T15 | Partial write/delete, quota, IndexedDB blocked/corrupt или crash | «Удалено» при наличии остатка либо «сохранено» только в памяти | Copy/commit protocol; persistence status честно показывается; tombstone блокирует reads до завершения purge; deletion receipt перечисляет scopes и failures; retry purge при следующем старте | Web platform не гарантирует физическое стирание flash/backup |
| T16 | Экспорт, clipboard, drag-and-drop или download раскрывает person-photo | Копия покидает управляемый контур | Person bytes/URLs исключены из generic export; нет copy/download/drag API; отдельный экспорт фото вне scope и запрещён; clipboard не используется | Пользователь может сделать ручной screenshot |
| T17 | Подмена локального результата утверждением о личности или свойствах человека | Дискриминация, вредный совет, биометрическая обработка | Output schema не содержит person attributes; UI copy описывает только выбранную пользователем одежду/контекст; любые inferred person fields отвергаются schema validation | Свободный генеративный текст в этой wave запрещён |
| T18 | Злоумышленник многократно загружает валидные большие файлы | Storage exhaustion и деградация устройства | Per-record и aggregate byte quota, максимум одна активная person-photo сессия, rate limit локальных попыток, cleanup LRU только после предупреждения и никогда не удалять другие personal данные молча | Локальный пользователь всё ещё может исчерпать общий origin quota |

## 6. Consent, retention и delete contract

Consent должен быть purpose-specific (`local-person-photo-preview-v1`), versioned, opt-in и не связан с согласием на garment photo storage или telemetry. Экран до выбора объясняет: фото остаётся на устройстве; лицо не идентифицируется; выводы о человеке не делаются; screenshots/OS backup приложением не контролируются; можно продолжить без фото.

Без согласия person-photo не сохраняется. Минимально безопасный target — session-only memory, автоматический purge при cancel, route exit, owner change, pagehide и reload. Любая долговременная запись требует отдельного product decision и новой privacy acceptance; текущие 30 дней garment-photo нельзя автоматически наследовать.

Удаление должно:

1. немедленно скрыть preview и поставить tombstone;
2. отменить decode/worker jobs и инвалидировать generation;
3. revoke все object URLs;
4. удалить original, sanitized copy, canvas/thumbnail, partial records и metadata из isolated store/memory;
5. очистить связанные Cache Storage/service-worker entries, даже если по контракту их не должно быть;
6. удалить person-события (по дизайну их не должно существовать) и оставить только безопасный локальный receipt без photo ID/owner identity;
7. показать честный результат: `deleted`, `partial_failure` или `nothing_found`, а не unconditional success.

Физическое стирание browser/OS cache, swap, backup и ранее сделанных screenshots не обещается. UI и runbook должны прямо назвать эту границу.

## 7. Recovery и incident response

### Ошибочная загрузка или показ лица

- Немедленно закрыть preview, cancel jobs, revoke URLs и выполнить scoped purge.
- Не отправлять изображение в bug report. Зафиксировать только код инцидента, версию build и bucket этапа при отдельном telemetry consent.
- Вернуть пользователя в manual/demo flow; повторный выбор возможен только через новый consent checkpoint.

### Подозрение на cross-owner leakage

- Fail closed для всех person records; очистить in-memory state и URLs.
- Заблокировать чтение isolated store до owner-scope audit; не «чинить» owner ID автоматически.
- Выполнить локальный purge затронутого namespace, показать границы удаления и выпустить security regression test до повторного допуска.

### Обнаружен network/log/cache leak

- Kill switch отключает person capability целиком, не garment-only gate.
- Purge local queues/caches и отозвать URLs; если network egress всё же произошёл, считать это privacy incident и следовать процедуре владельца приёмки. Нельзя заявлять полное удаление удалённой копии без проверяемого подтверждения.
- Сбор forensic evidence не должен копировать photo bytes, EXIF или URL.

### DoS или spoofed file

- Abort текущую обработку, удалить partial artifacts, освободить bitmap/canvas/worker и сохранить приложение работоспособным.
- Показать стабильный безопасный error code и manual path; не делать автоматический retry.
- После renderer crash следующий старт не восстанавливает preview и сначала выполняет orphan cleanup.

## 8. Acceptance criteria для снятия HOLD

Все критерии обязательны; частичный PASS невозможен.

### Architecture and policy

- Person flow реализован отдельным feature flag, route/controller, consent version и storage namespace; flag off по умолчанию.
- Статический dependency review подтверждает отсутствие network/model/biometric/identity/generative SDK и вызовов.
- Existing garment-only tests доказывают: person/unknown/multiple items остаются `retake`; manual declaration не даёт `accept` или upload.
- Есть documented kill switch, не затрагивающий demo/manual и garment-only flow.

### Privacy and lifecycle

- До opt-in: 0 persistent writes, 0 telemetry events, 0 decoded preview.
- Network harness для success/error/cancel/reload/delete фиксирует 0 requests/beacons/websockets/service-worker messages с person bytes или metadata.
- EXIF/GPS/embedded thumbnail отсутствуют в sanitized output на corpus JPEG/PNG/WebP; original освобождается после sanitize по заявленному lifecycle.
- Все object URLs revoked на replacement, cancel, delete, unmount, owner switch, `pagehide`, BFCache restore и thrown error.
- Delete test подтверждает отсутствие record/blob/derivative/cache/URL после success, partial write, quota error, crash recovery и повторного idempotent delete.
- Generic export и telemetry export не содержат bytes, data/blob URL, filename/path, EXIF, photo ID, content label или свободный текст.

### Isolation and abuse resistance

- Matrix `demo ↔ personal A ↔ personal B ↔ no-owner` даёт 0 cross-read/cross-render/cross-export; stale IDs и browser back не обходят проверку.
- Async race tests доказывают, что результат старого decode не может commit после replacement/delete/consent revoke/owner switch.
- Malformed/polyglot/SVG/GIF/HEIC/MIME-mismatch/truncated corpus полностью rejected до preview/persistence.
- Limits доказаны тестами: ≤15 MiB compressed, ≤40 MP decoded, JPEG/PNG/WebP only, один активный job, bounded queue, timeout/cancel и cleanup. Более строгие лимиты допустимы; ослабление требует review.
- 100 последовательных oversized/malformed попыток не приводят к unbounded memory/storage growth, crash loop или потере иных personal данных.

### Prohibited inference

- Code/schema/storage scan на `face`, `identity`, `embedding`, `template`, `landmark` и person-attribute fields не находит исполняемого создания/сохранения таких данных; допустимы только deny-policy/tests/docs.
- Golden tests с разнообразными синтетическими сценами подтверждают отсутствие outputs про тело, здоровье, возраст, гендер и этничность.
- Нет training/eval/support workflow, принимающего реальные person-photo.

### UX and recovery

- Consent, cancel, delete, partial-delete warning и «продолжить без фото» доступны с клавиатуры и screen reader.
- UI не обещает анонимность или полное стирание ОС/screenshots; не показывает ложный success при memory fallback или partial failure.
- Crash/reload/owner-switch recovery не восстанавливает person preview и очищает orphan artifacts.
- Независимый security/privacy reviewer подписал evidence manifest и подтвердил `PASS` по каждому пункту.

## 9. Evidence plan и текущие доказательства

### Подтверждено текущим репозиторием

- `src/photoIntake.js`: magic-byte allowlist JPEG/PNG/WebP, MIME match, лимиты 15 MiB/40 MP, canvas sanitize; `upload_allowed` false по умолчанию; person/unknown fail closed; ручная декларация приводит только к review.
- `docs/photo-intake-contract.md`: trusted local detector не подключён; production auto-accept имеет статус HOLD; сеть не используется самим компонентом.
- `src/photoStorage.js`: отдельное versioned согласие на garment-photo storage, IndexedDB/memory semantics, TTL и delete APIs. Это полезный precedent, но **не** разрешение хранить person-photo.
- `src/telemetry/localCollector.js` и `src/telemetry/eventDictionary.js`: opt-in local collector, allowlisted enum/bucket properties, запрет photo/image/file/path/name/free text и `networkEgress: false`.
- `src/privacyDataController.js`: aggregate delete вызывает photo delete, чистит telemetry/session keys и disposes object URL registry; transient blob URLs исключаются из export.

Эти пункты доказывают существующие защитные примитивы, но не существование безопасного person flow. Они не снимают HOLD.

### Обязательный evidence bundle до PASS

- machine-readable test manifest с build SHA, browser/OS matrix, fixture provenance и результатом каждого acceptance criterion;
- unit/integration tests для consent state machine, owner namespace, async generations, URL registry, schema denylist и delete receipts;
- browser traces для network=0, cache=0, lifecycle/reload/BFCache и memory/resource bounds;
- metadata inspection sanitized outputs и spoof/fuzz corpus results;
- снимок dependency/license audit без запрещённых SDK;
- ручной accessibility/privacy-copy review без реальных person screenshots;
- signed review от product, privacy/security и QA owners.

Реальные person-photo, лицо сотрудника или пользователя, production data и внешняя загрузка не могут использоваться как evidence.

## 10. Dependencies и владельцы решений

До реализации нужны:

- product owner: точная локальная ценность person-photo и доказательство, что её нельзя получить garment-only/manual путём;
- privacy/security owner: consent copy, third-party subject notice, retention decision, incident/kill-switch runbook;
- frontend/platform owner: isolated controller/store, URL lifecycle, worker cancellation, BFCache/page lifecycle и CSP;
- QA owner: синтетический no-person/adversarial corpus, owner-isolation matrix, resource tests и evidence manifest;
- accessibility owner: consent/delete/recovery review;
- release owner: подтверждение, что feature flag off и current single-garment gate не изменён.

Не являются допустимыми dependencies: cloud auth/storage, remote inference, biometric SDK, identity provider, retail/payment provider или generative image service.

## 11. Residual risk and final gate

Даже после выполнения критериев web-приложение не может гарантировать удаление screenshots, OS backups, swap, browser internals или данных, прочитанных вредоносным расширением. Это должно быть явно принято privacy owner и отражено в UI.

Финальное правило допуска:

- **PASS** — только локальная isolated capability, все критерии раздела 8 имеют воспроизводимое evidence, независимый review завершён, а garment-only default неизменен.
- **HOLD** — отсутствует любое evidence, есть network/log/cache/cross-owner leak, создаются person features/templates, требуется запрещённая dependency, delete неполный без честного предупреждения или предлагается ослабить single-garment gate.

Текущее решение: **HOLD**.
