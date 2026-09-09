import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmManualContext, createManualContext, loadConsentedContext, mapContextToStylistRequest, persistContext, weatherContextDraft } from "./contextAdapter.js";

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test("unknown values remain absent and an unconfirmed draft cannot reach reasoning", () => {
  const draft = weatherContextDraft({ city: "Астрахань", temperatureC: 18 });
  assert.equal(draft.confirmed, false);
  assert.deepEqual(mapContextToStylistRequest(draft), { mapping_version: "context-to-stylist-request/1.0", confirmed: false, source: "manual" });
  const confirmed = mapContextToStylistRequest(confirmManualContext(draft));
  assert.equal(confirmed.city, "Астрахань");
  assert.equal(confirmed.temperatureC, 18);
  assert.equal("precipitation" in confirmed, false);
});

test("session-only is the default and reload restores only consented confirmed context", () => {
  const storage = memoryStorage();
  const confirmed = confirmManualContext({ city: "Казань", wind: "breezy", feelsLike: "colder", standingMinutes: 90 });
  assert.deepEqual(persistContext(storage, confirmed), { ok: false, code: "consent_required" });
  assert.equal(loadConsentedContext(storage).confirmed, false);
  assert.equal(persistContext(storage, confirmed, { consent: true }).ok, true);
  assert.deepEqual(loadConsentedContext(storage), confirmed);
});

test("clear, editor accessibility and explicit city lookup boundaries are present", () => {
  assert.equal(createManualContext({}).confirmed, false);
  const source = readFileSync(new URL("./WeatherContextEditor.jsx", import.meta.url), "utf8");
  assert.match(source, /<AccessibleDialog as="form"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /labels\.weather/);
  assert.match(source, /initialFocus="input\[name='context-city'\]"/);
  assert.match(source, /aria-label="Закрыть редактор погоды"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Геолокация не запрашивается/);
  assert.match(source, /searchCities/);
  assert.match(source, /loadCurrentWeather/);
  assert.match(source, /role="combobox"/);
  assert.doesNotMatch(source, /navigator\.geolocation|fetch\(|XMLHttpRequest/);
});
