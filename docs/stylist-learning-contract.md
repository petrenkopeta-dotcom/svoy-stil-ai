# Stylist Learning contract — SR-06

Статус: production-shaped локальный domain contract; local synthetic, `productionEvidence=false`. Версия правил: `stylist-learning-rules-v2`, profile schema v2 (v1 читается через additive migration).

Модуль `src/stylistLearning.js` принимает только явно переданные feedback-события и настройки. Он не анализирует фото, не вызывает внешние сервисы и не делает выводов о цветотипе, теле или демографии.

## Инварианты

- Агрегат принадлежит одному `ownerId`; команда другого пользователя отклоняется с `403 owner_mismatch`.
- Запись возможна только при сохранённом согласии профиля и consent-флаге команды. Без них возвращается `403 consent_required` и новый профиль не создаётся.
- Любая запись требует актуальный слабый ETag. Несовпадение возвращает `412 stale_profile`.
- `idempotencyKey` обязателен и ограничен агрегатом пользователя. Повтор возвращает исходное событие без новой ревизии.
- Входной профиль никогда не мутируется. Успех возвращает новый профиль; ошибка не имеет побочных эффектов.
- Undo — компенсирующее append-only событие. Источник обратной связи остаётся в аудите, но исключается из последующей агрегации.
- Каждое правило содержит `confidence`, `ruleVersion`, объяснение и provenance со ссылкой на исходное событие.

## Детерминированная агрегация

Один активный feedback одной группы создаёт `weak_signal` с confidence `0.25`. Два и более — `trend` с confidence `0.65`. Хотя бы одна явная пользовательская настройка (`strength: explicit_setting`) создаёт `strong_rule` с confidence `1.0`; provenance сильного правила содержит только явные настройки. Undo пересчитывает уровень по оставшимся активным событиям.

Причины: `colors`, `too_dressy`, `fit`, `shoes`, `too_hot`, `too_cold`, `not_my_style`. Они описывают только заявленную реакцию пользователя и не интерпретируют визуальные или чувствительные признаки.

## Feedback → ranking loop

- Действия: `would_wear` («Надела бы»), `not_for_me` («Не моё»), `replace_item` («Замени вещь»). Для отрицательных действий обязательна причина; для замены — id вещи.
- Запись требует явного consent, ownerId, ETag, idempotency key и provenance recommendation id.
- Один клик влияет на следующую выдачу, но является обратимым и затухает (`0.82^age`). Отрицательный сигнал сильнее положительного; вечный ban появляется только при `permanent: true`.
- Candidate response раскрывает только качественный `rankingReasons` и `preferenceVersion`, не внутренний числовой score.
- Diversity selector остаётся после learning adjustment и не позволяет feedback превратить выдачу в один повторяющийся комплект.
- Разрешены только минимальные признаки рекомендации: item ids, категории, style tags и семейства цветов. Тело, демография и произвольные поля fail closed.
- Export/reset/delete выполняются owner-scoped repository boundary; undo — append-only компенсация.

## UI integration contract: «Что стилист запомнил»

`learningRankingContext(profile).remembered` возвращает массив `{eventId, action, reason, subject, source, permanent}`. Интегратор показывает его в read-only панели, рядом с Undo/Reset/Export/Delete, и не заявляет cloud/production learning, пока `productionEvidence=false`.
