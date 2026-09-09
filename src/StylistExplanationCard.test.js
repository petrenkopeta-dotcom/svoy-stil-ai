import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StylistExplanationCard } from "./StylistExplanationCard.js";

const render = (props) => renderToStaticMarkup(React.createElement(StylistExplanationCard, props));

test("renders four plain-language sections and a practical tip without scores", () => {
  const html = render({ facts: [{ code: "NEUTRAL_BASE_SINGLE_ACCENT" }, { code: "SILHOUETTE_VOLUME_BALANCED" }, { code: "CONTEXT_FORMALITY_MATCH" }, { code: "PROFILE_COMFORT_NO_HEELS" }] });
  for (const label of ["Почему сочетается", "Цвета", "Силуэт", "Повод и комфорт", "Учтено из профиля", "Подробнее"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /\d+%|score/i);
  assert.match(html, /aria-expanded="false"/);
});

test("has accessible loading, empty and error states", () => {
  assert.match(render({ status: "loading" }), /aria-busy="true"/);
  assert.match(render({ status: "empty" }), /недостаточно подтверждённых данных/);
  assert.match(render({ status: "error", errorMessage: "Временная ошибка" }), /role="alert".*Временная ошибка/s);
});

test("unknown facts stay in the neutral empty state", () => {
  const html = render({ facts: [{ code: "PHOTO_BODY_TYPE" }] });
  assert.match(html, /без догадок/);
  assert.doesNotMatch(html, /PHOTO_BODY_TYPE/);
});

test("turns confirmed risks into one concrete, non-invented next action", () => {
  const cold = render({ facts: [{ code: "CTX_TOO_COLD_FOR_OUTFIT" }] });
  assert.match(cold, /добавьте подтверждённо тёплый слой/);

  const walking = render({ facts: [{ code: "CTX_LONG_WALK_LOW_SHOE_COMFORT" }] });
  assert.match(walking, /подтверждённым комфортом для ходьбы/);

  const volume = render({ facts: [{ code: "SIL_VOLUME_DOUBLE_OVERSIZED" }] });
  assert.match(volume, /Сохраните одну объёмную вещь/i);
});
