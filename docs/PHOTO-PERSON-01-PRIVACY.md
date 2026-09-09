# PHOTO-PERSON-01 — privacy/legal/product consent gate

Дата: 21.08.2026  
Статус документа: product/privacy contract, не юридическое заключение  
Scope: фото, на котором может присутствовать сам пользователь, несовершеннолетний или третье лицо; локальная обработка, consent, session lifecycle, delete/export и stop conditions.

## Решение

**Итоговый gate: HOLD для реализации и production-запуска PHOTO-PERSON-01.**

**PASS WITH CONDITIONS только для проектирования и локального закрытого прототипа**, когда выполнены все acceptance criteria этого документа и отдельно получен письменный privacy/legal sign-off по аудитории продукта, согласию и правам третьих лиц.

PHOTO-PERSON-01 не меняет действующий default: текущий single-garment intake по-прежнему принимает только фото одной отдельной вещи без человека. Фото с человеком, частью человека, отражением или неуверенным результатом продолжает получать `retake` в существующем потоке. Новый person-photo flow может открываться только отдельным, явно названным действием пользователя и не может быть fallback-веткой single-garment gate.

Запрещены в этой wave:

- сеть, cloud upload, внешние AI/CV/vendor API и remote logging фото или производных;
- распознавание или установление личности, face matching/search, биометрическая аутентификация;
- face embeddings, body/face templates, persistent descriptors или reversible fingerprints;
- inference о возрасте, поле/гендере, этничности, здоровье, инвалидности, беременности, весе, параметрах/форме тела или иных чувствительных признаках;
- generative inpainting, замена лица/тела/одежды и синтетическая достройка изображения;
- обучение модели, recommendation learning, analytics, advertising или support-доступ по данным person photo;
- Auth, Supabase, VK ID, платежи и retail-интеграции как основание, транспорт или обход consent gate.

## Product boundary

Допустимая цель прототипа узкая: пользователь осознанно выбирает своё фото, чтобы локально оценить сочетание **одной явно выбранной вещи** с видимым образом; приложение выдаёт только ограниченный styling result и объясняет ограничения. Наличие человека не разрешает извлекать характеристики человека. Анализируется заявленная пользователем вещь и безопасные визуальные признаки одежды (например, подтверждённый цвет), а не лицо или тело.

PHOTO-PERSON-01 не должен:

1. автоматически появляться после отказа single-garment gate;
2. обещать «анализ внешности», «подбор по фигуре/возрасту/полу» или похожий результат;
3. сохранять фото ради удобства по умолчанию;
4. смешивать person photo с demo-данными, личным гардеробом, learning profile или обычной photo storage;
5. представлять demo/sample photo как фото пользователя или переносить действия demo-сессии в personal state.

## Consent UX

### До выбора файла

Flow открывается отдельной кнопкой, например «Использовать моё фото в этой сессии». До file picker показывается короткое notice:

> Выберите только своё фото, если вам есть 18 лет и в кадре нет других людей. Фото обработается только на этом устройстве и удалится при завершении или закрытии сессии. Мы не распознаём личность и не определяем возраст, здоровье, пол, этничность или параметры тела. Сохранение и отправка фото отключены.

Пользователь должен совершить отдельное affirmative action `Продолжить`. Предустановленной галочки, согласия через бездействие, объединения с Terms/analytics или consent wall для основного single-garment flow нет. Кнопка `Использовать фото вещи без человека` всегда остаётся равноценной альтернативой.

### После локального preview, до обработки

Preview ещё не означает consent. Пользователь подтверждает два утверждения отдельным действием:

- «На фото я, мне 18 лет или больше»;
- «В кадре нет других людей, включая лица и отражения».

Основная кнопка называется `Обработать только в этой сессии`; рядом видимы `Выбрать другое фото` и `Удалить фото`. Если пользователь не может подтвердить оба утверждения, обработка не начинается.

Consent copy не утверждает, что приложение способно надёжно определить лицо, возраст или принадлежность изображения. Ответственность пользователя не заменяет product controls: при обнаруженном или вероятном третьем лице flow всё равно останавливается.

### Consent receipt

Разрешён только receipt в оперативной памяти с минимальными полями:

```json
{
  "scope": "person_photo_session_processing",
  "policy_version": "PHOTO-PERSON-01-v1",
  "purpose": "local_single_garment_styling_preview",
  "mode": "personal",
  "granted_at": "runtime timestamp",
  "expires": "session_end",
  "network_allowed": false,
  "storage_allowed": false,
  "revoked_at": null
}
```

Receipt не содержит имя, user/account id, имя файла, путь, фото, hash/perceptual hash, thumbnail, EXIF, device id или признаки изображения. Он не пишется в local/session storage, IndexedDB, URL, telemetry, crash report или export. Demo mode не создаёт personal consent receipt.

Отзыв доступен на всём протяжении flow кнопкой `Удалить фото и завершить`. Отзыв немедленно прекращает новые операции, очищает preview/result/receipt и переводит state в `revoked`; повторная обработка требует нового consent.

## Session-only default и data flow

Разрешённый контур:

`file picker → memory-only decode → metadata stripping/orientation normalization → person-presence safety gate → explicit consent → local bounded processing → ephemeral result → delete on exit`

Обязательные свойства:

- file picker не открывается до pre-notice action;
- bytes, decoded pixels, preview, intermediate canvas, masks и result существуют только в памяти активной страницы;
- EXIF и filename не копируются в result; object URLs учитываются и отзываются;
- Service Worker, Cache API, browser storage, filesystem, clipboard и download не используются;
- network egress равен нулю до, во время и после consent; consent не может разрешить сеть;
- фото и производные исключены из telemetry, console/error payload, QA evidence и screenshots по умолчанию;
- refresh, route change, tab close, component unmount, cancel, replacement, timeout, error и crash-recovery path приводят к cleanup;
- session result не попадает в wardrobe, profile, recommendation learning, history или обычный export.

Рекомендуемый максимальный session TTL: **15 минут с момента последнего активного действия**, но закрытие/отзыв удаляет раньше. TTL должен быть подтверждён product/privacy owner; до подтверждения действует более строгая семантика «до первого exit/unmount».

Любое будущее сохранение, повторное использование, cloud sync или support sharing — новая задача, новый scope consent и новый privacy/legal/security review. Расширять `person_photo_session_processing` нельзя.

## Person-presence handling

Локальный safety gate не выполняет identity или sensitive inference. Его единственная допустимая функция — классифицировать риск присутствия человека для маршрутизации:

| Safety result | Действие |
|---|---|
| `no_person` | Не переводить автоматически в person flow; предложить вернуться в single-garment intake. |
| `exactly_one_person_possible` | Показать preview и запросить оба явных подтверждения; это не подтверждение возраста или личности. |
| `multiple_people_possible` | Немедленный stop; удалить данные; предложить другое фото без третьих лиц. |
| `minor_possible` | Немедленный stop; удалить данные; не просить дату рождения и не пытаться уточнить возраст моделью. |
| `uncertain_person_presence` | Fail closed: stop и retake. |
| `face/reflection/background_person_possible` | Считать возможным третьим лицом, если пользователь не может однозначно подтвердить обратное; при detector signal — stop. |
| `unsupported/error/timeout` | Stop, cleanup, безопасное сообщение без сохранения payload. |

Положительный результат safety gate не является биометрической проверкой, age assurance или доказательством, что на фото пользователь. Он только позволяет перейти к self-declaration. Для PASS dependency должна документально гарантировать локальное исполнение, отсутствие network/model telemetry, отсутствие persistent descriptors и выдачу только перечисленных coarse safety states.

## Несовершеннолетние и третьи лица

До отдельного legal/product решения PHOTO-PERSON-01 — **18+ only**. Не проектируется parental consent, family account или guardian verification. Если пользователь сообщает возраст младше 18 лет, сомневается в возрасте изображённого человека или safety gate даёт `minor_possible`, flow останавливается без сбора дополнительных данных.

Фото третьего лица запрещено даже при заявленном устном/письменном разрешении: продукт не может проверить scope и действительность такого разрешения. Запрещены group photos, дети на фоне, случайные прохожие, экран/плакат/картина с узнаваемым человеком и отражения, если нельзя уверенно исключить другого человека.

Безопасный текст остановки:

> Мы не можем продолжить с этим фото. Выберите своё фото, где вы один/одна и все другие люди, лица и отражения исключены, либо используйте фото одной вещи без человека. Текущее фото удалено из сессии.

Сообщение не должно заявлять «мы нашли ребёнка», «определили возраст» или описывать чувствительный вывод.

## Stop conditions

Обработка не начинается или немедленно прекращается при любом из условий:

- consent отсутствует, отозван, истёк или version/scope не совпадает;
- пользователь не подтверждает 18+ и отсутствие других людей;
- возможны несколько людей, несовершеннолетний, третье лицо, отражение или присутствие человека неясно;
- dependency недоступна, отвечает неожиданным state, требует сеть или не доказывает запрет persistent descriptors;
- файл не проходит текущие format/size/decode/quality gates;
- обнаружен network request, persistence write, telemetry payload или logging image-derived data;
- невозможно гарантированно очистить bytes, object URLs, intermediates и result;
- режим personal/demo или выбранная single garment неоднозначны;
- requested result требует identity, biometrics, sensitive/body inference или generative image editing;
- любой downstream consumer запрашивает фото/производные вне активной сессии.

Stop — fail closed: result не показывается, data cleanup выполняется, пользователю остаются безопасные альтернативы. Нельзя «продолжить всё равно» или понизить stop до warning.

## Retention, delete и export

### Retention

| Данные | Default | Максимум в прототипе | Persistence |
|---|---|---|---|
| Original bytes / decoded pixels | session-only | до exit/revoke/TTL/error | запрещена |
| Normalized copy / preview / object URL | session-only | до replacement/exit/revoke/TTL/error | запрещена |
| Intermediate canvas/mask/features | operation-only | удалить сразу после шага | запрещена |
| Styling result tied to image | session-only | до exit/revoke/TTL | запрещена |
| Consent receipt | memory-only | до exit/revoke/TTL | запрещена |
| Logs/analytics/QA evidence | none | 0 | запрещена |

### Delete

`Удалить фото и завершить` доступно без аккаунта, оплаты и support request. Delete graph включает original bytes → decoded pixels → normalized copy → object URLs → canvases/masks/intermediates → image-derived result → in-memory consent receipt. Операция idempotent.

UI показывает успех только после локального read-back/registry check: нет активных object URLs, photo references, queued work и person-photo result. Если cleanup нельзя подтвердить, состояние `delete_failed`, новые операции блокируются, страница предлагает закрыть вкладку и сообщает о технической ошибке без ложного «удалено».

Browser/OS memory reclamation нельзя обещать как физическое стирание конкретных ячеек памяти. Продукт обещает прекращение доступа приложения, удаление всех своих ссылок/буферов и отсутствие persistence/network copies.

### Export

Session-only person photo и производные **не входят в export**, потому что не сохраняются. Export manifest должен явно указывать:

```json
{
  "domain": "person_photo_session",
  "stored": false,
  "included": false,
  "reason": "session_only_not_persisted"
}
```

Нельзя включать photo bytes, thumbnails, filenames, hashes, safety states, self-declarations или ephemeral consent receipt. Если export когда-либо обнаруживает запись этого domain, это privacy incident и release-blocking failure, а не повод экспортировать её молча.

## Personal/demo separation

- `mode=personal` требует consent и принимает только user-selected local file.
- `mode=demo` использует только заранее утверждённые synthetic/licensed assets без реального пользователя и не предлагает file picker.
- demo assets имеют явный `origin=demo`, не создают consent receipt и не попадают в personal wardrobe/history/learning/export.
- personal photo/result не может стать demo fixture, screenshot, corpus или support artifact.
- переключение режима уничтожает активное personal session state до загрузки demo state; обратный переход также создаёт чистую сессию.
- UI постоянно маркирует `Демо` и не формулирует demo-result как персональный анализ.

## Риски

### P0 / release blockers

1. Pre-consent либо post-consent network egress фото или производных.
2. Сохранение person photo, object URL, thumbnail, hash, features или receipt вне памяти сессии.
3. Ослабление single-garment gate или автоматический переход из `retake` в person processing.
4. Identity/biometric use, persistent face/body descriptors или sensitive inference.
5. Обработка возможного несовершеннолетнего/третьего лица либо bypass uncertain state.
6. Ложное delete success или остатки в storage/cache/log/telemetry/QA evidence.

### P1

1. Consent copy недостаточно конкретен или основная альтернатива без человека скрыта.
2. Demo/personal contamination.
3. Слишком длинная session lifetime, cleanup race при route/unmount/crash.
4. Safety dependency меняет поведение/лицензию, включает telemetry или выдаёт недокументированные inference fields.
5. Product copy создаёт впечатление анализа лица, возраста или тела.

### Остаточный риск

Даже полностью локальный flow обрабатывает изображение человека и может захватить чувствительный контекст фона. Self-declaration не подтверждает права на изображение. Поэтому production остаётся HOLD до юридического решения об аудитории, основании обработки, notice/consent, применимых требованиях к данным изображения и incident/rights-response процессах.

## Acceptance criteria

### Product/consent

- [ ] PHOTO-PERSON открывается только отдельным explicit action; single-garment default и его `retake` остаются неизменными.
- [ ] До picker видны цель, local/session-only режим, запреты identity/sensitive inference, 18+ и запрет третьих лиц.
- [ ] После preview требуются отдельные affirmative confirmations 18+ и «нет других людей»; никакие checkbox не предустановлены.
- [ ] Равнозначная альтернатива «фото одной вещи без человека» видна до и после отказа.
- [ ] Consent receipt соответствует минимальной memory-only schema; revoke немедленно очищает state.

### Technical/privacy

- [ ] Автоматизированный network harness доказывает zero egress на select/process/delete/error/timeout/refresh/route change.
- [ ] Storage harness доказывает отсутствие photo/derived/receipt в localStorage, sessionStorage, IndexedDB, Cache API, Service Worker queues и filesystem/download.
- [ ] Lifecycle tests покрывают replacement, revoke, TTL, unmount, route change, refresh, decode error, detector error/timeout и double-delete.
- [ ] Object URL registry и internal reference audit дают zero residue после каждого stop/delete path.
- [ ] Логи, telemetry, crash reports и QA artifacts проверены на отсутствие bytes, data/blob URLs, filename/path, hashes, features и safety states.
- [ ] Dependency contract подтверждает local-only coarse safety routing, no identity, no sensitive inference, no persistent descriptors и deterministic fail-closed error mapping.

### Minors/third parties

- [ ] `minor_possible`, `multiple_people_possible`, reflection/background-person signal и uncertainty всегда приводят к stop+cleanup без override.
- [ ] UX не просит дату рождения, документ или фото другого человека и не заявляет machine-determined age.
- [ ] Third-party photo запрещено независимо от заявленного разрешения; 18+ policy и тексты утверждены product/privacy/legal owners.

### Retention/delete/export/demo

- [ ] Session TTL утверждён; exit/revoke/stop удаляют раньше; никакой silent restore после reload нет.
- [ ] Delete idempotent и показывает success только после zero-reference/read-back checks.
- [ ] Export содержит только явную omission record `session_only_not_persisted`; person data в export вызывает fail.
- [ ] Personal/demo modes имеют разные origins и state containers; mode switch очищает personal state; тесты доказывают отсутствие contamination.

### Release gate

- [ ] Privacy owner, product owner, security owner и counsel письменно приняли data-flow, copy, age/audience policy, dependency и residual risk.
- [ ] Ни один acceptance item не заменён warning, manual promise или «проверим после запуска».
- [ ] Любое будущее storage/network/model/analytics расширение остаётся выключенным и требует нового versioned consent + review.

## Evidence required

Для перевода локального прототипа из HOLD нужны:

1. Скриншоты всех consent/decline/stop/delete/demo экранов на целевых viewport без реальных person photos.
2. Test report с cases и pass/fail для consent state machine и каждого stop condition.
3. Network capture с нулевым egress во всех lifecycle paths.
4. Storage/cache inventory до, во время и после сессии; zero-residue delete report.
5. Bundle/dependency manifest, license review и техническое подтверждение local-only/no-telemetry/no-descriptor поведения safety dependency.
6. Static/runtime scan на запрещённые sinks: fetch/XHR/WebSocket/beacon, storage/cache, download, telemetry/error serialization.
7. Export fixture с omission record и negative test, падающий при найденном person-photo domain.
8. Demo/personal separation test report.
9. Подписанный decision record owners с утверждённым copy, TTL, 18+ policy и incident response.

Evidence использует только synthetic/licensed demo assets. Реальные пользовательские фото запрещено сохранять как QA evidence.

## Dependencies and owners

| Dependency | Owner | Gate |
|---|---|---|
| Утверждённая узкая styling purpose и UX/copy | Product + Privacy | P0 |
| 18+ audience, minors/third-party policy и legal basis/notice review | Counsel + Privacy | P0 |
| Локальная safety dependency с зафиксированной версией/лицензией и no-network/no-descriptor contract | Security + Engineering | P0 |
| Ephemeral session controller, cleanup registry и fail-closed state machine | Engineering | P0 |
| Network/storage/residue/export/demo test harness | QA + Security | P0 |
| Incident path для неожиданной persistence/egress и kill switch | Security + Operations | P0 |
| Accessibility review consent/stop/delete controls | Product + QA | P1 |

Auth/Supabase/VK ID/payments/retail не являются dependencies PHOTO-PERSON-01 и не должны добавляться в эту wave.

## Финальный PASS/HOLD

- **Документ и дальнейшее локальное проектирование:** PASS.
- **Закрытый local-first прототип:** HOLD до выполнения всех acceptance criteria и evidence package.
- **Production, несовершеннолетние, third-party photos, storage, cloud/network, external models, analytics/learning, identity/biometrics, sensitive inference, generative edits:** HOLD / NO-GO.
- **Текущий single-garment flow:** остаётся единственным default и не меняется этим контрактом.

