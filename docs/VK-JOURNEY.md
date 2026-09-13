# VK journey — 13 сентября 2026

## Реализованный контракт

Путь: VK launch в теле POST → HttpOnly session → загрузка гардероба → доступность
фото → выбор файла → анализ → явное подтверждение → независимая повторная проверка
на сервере → сохранение проверенного PNG → owner-scoped чтение и сверка SHA-256 → выход.
Launch query удаляется из истории до запроса, не записывается в браузерное хранилище.
Фото и object URL живут только в памяти клиента; URL освобождаются при обновлении,
выходе и размонтировании. Сервер сохраняет только подтверждённые выходные PNG.

Все маршруты относительные `/api/staging/`, `credentials: same-origin`, `cache: no-store`.
Изменяющие запросы требуют правильные Origin и X-CSRF-Intent. Новый frontend не содержит
способа внедрения test backend, env/query-переключателя release gate или внешнего URL.

| Метод и маршрут | Контракт |
| --- | --- |
| POST vk-session / GET session | Вход по launch / восстановление cookie-сессии |
| GET capabilities | После auth и budget: только `{photos:boolean}` |
| GET wardrobe / PUT wardrobe | Существующий отдельный metadata-only гардероб |
| POST photos/analyze | Blob PNG/JPEG/WebP до 10 MiB; ответ `{candidates:[{id,label,expires,preview}]}` |
| POST photos/confirm | Только `{id}`; ответ `{id,sha256}`; кандидат одноразовый и принадлежит владельцу |
| GET photos | Последние максимум 100 записей текущего владельца, `{items:[{id,sha256}]}` |
| GET photos/:id | PNG только владельцу; клиент сверяет SHA-256 перед сообщением об успехе |
| POST logout | Auth + CSRF + лимит тела; revoke session/candidates и expire cookie даже при закрытом бюджете |

GET capabilities и GET photos добавлены в HTTP allowlist по согласованию координатора.
Другие методы этих двух маршрутов listener отклоняет. Фото остаются под budget/release
admission. Capabilities не раскрывает конфигурацию. Выход не вызывает модель и не
открывает другие операции при закрытом бюджете.

## Состояния UI

`loading`, `analyzing`, `confirmation`, `confirming`, `saving`, `ready`, `empty`,
`unavailable`, `timeout`, `error`, `logout`, `signedOut` различаются явно.
Пустой гардероб и отсутствие безопасных кандидатов имеют разные тексты.
HTTP 503 означает недоступность; 408/504 — таймаут; 404/410 — недоступный/истёкший
кандидат; 401 предлагает заново открыть VK. После неопределённого сохранения UI
предлагает обновить гардероб, а не объявляет успешное сохранение.

Перед отправкой файла клиент повторно проверяет capabilities. При запрете файл не
читается/не отправляется; в обычном закрытом UI отсутствует input[type=file].
Клиентский deadline ограничен 20 секундами на запрос; это не измерение модельного SLO.
При выходе UI немедленно скрывает вещи, отменяет запросы и игнорирует поздние ответы.
Если сервер не подтвердил выход, можно повторить его; клиент не объявляет сессию отозванной.

## SEC-01

Отдельный коммит `2f1222827dac247c883fcef59e9514f29fc333f9`: budget admission больше не
блокирует корректный authenticated POST logout. Сохранены method/origin/CSRF/body limits.
Регрессия проверена реальным HTTP listener. По сообщению координатора security отдельно
проверил этот точный SHA: 22/22 теста PASS. Это не независимая приёмка следующего коммита.

## Воспроизводимые проверки

- `npm ci --offline --ignore-scripts --no-audit --no-fund` — зависимости только из локального cache.
- `npm test` — полный Node-набор; API, SQLite, client и HTTP integration используют synthetic fixtures.
- `npm run build`, `npm run format:check`, `npm run bundle:check`.
- `npm run test:browser` — исходные 6 browser smoke тестов, включая изолированное demo.
- `npx playwright test --config src/vkStagingClient.browser.config.js` — отдельные 2 browser
  теста: synthetic PNG, empty/timeout/confirmation/save/read-back/reload/logout и закрытая загрузка.

Test backend существует только в test modules и проверяет совпадение с фиксированными
синтетическими байтами. Browser route fixtures не запускают production backend и не
обрабатывают пользовательские фото. Датасеты, реальные фотографии и ML weights не использованы.
Browser traces/screenshots/video отключены; результаты исполнения остаются вне Git.

## Факты и ограничения

Это реализация контрактов и их локальная проверка, не валидация качества моделей, не
реальный вход VK и не разрешение принимать пользовательские фото. Default-deny CLI и
статическое demo не изменены. Не было публикации, платных вызовов или установки моделей.
Исходный checkout использован только для чтения; разрешённые git-операции worktree
обновляют общий git-каталог. Bootstrap, package/CI, runtime/cv и deploy не менялись.

Список фото ограничен последними 100; пагинация более старых вещей пока не реализована.
10-секундная цель/20-секундный предел реальной модели и host-level no-disk не доказаны.
Подтверждение остаётся одноразовым: после потерянного ответа следует перечитать гардероб.
Следующая задача: независимая security-проверка итогового journey SHA, затем интеграция
координатором. Для включения реальных фото нужны отдельные доказательства CV, российского
хостинга и бюджетного admission. От пользователя для локальных тестов ничего не требуется.

### Итоговая локальная проверка

- До inventory-limit теста полный Node suite: 495/495 PASS; после добавления профильный suite: 14/14 PASS.
- `npm run build`, `npm run format:check`, `npm run bundle:check`: PASS.
- Изолированный `npx playwright test --config src/vkStagingClient.browser.config.js`:
  2/2 PASS, exit 0, 20.6 секунды при повторе со scoped escalation.
- Исходные 6 browser tests: 6/6 PASS, exit 0; sandbox teardown требовал ручной остановки
  только подтверждённых собственных Vite PID. Этот прогон не является проверкой реальных моделей.
- Первый прогон зависал в Windows teardown, не в assertions. PID/cmd подтверждены:
  4210 → PID26048, Vite binary из worktree `9f9f/AI-стилист 2`; 4199/4200/4201 также
  принадлежали этому worktree (PID18184/10476/25472). Чужой security порт4297 не затронут.
  Повтор с escalation завершился самостоятельно. Config всегда `reuseExistingServer:false`.
- SHA-256 проверенного UI: `8DFC7B840B87148C7F8AED6BA131F5D96CF4F92BF49606A7CCD0DB277EC000AC`;
  клиента: `B58E73D4CA80C54D12971CDFF59B8ABD2DB271528029143F816EFAFD5405F5D2`.
