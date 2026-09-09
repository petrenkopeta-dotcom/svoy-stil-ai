import test from "node:test";
import assert from "node:assert/strict";
import { loadCurrentWeather, searchCities } from "./weatherService.js";

const response = (body) => async () => ({ ok: true, json: async () => body });

test("city autocomplete returns bounded display-safe places", async () => {
  const places = await searchCities("Нов", { fetchImpl: response({ results: [{ id: 1, name: "Новочеркасск", admin1: "Ростовская область", country: "Россия", latitude: 47.42, longitude: 40.09 }] }) });
  assert.deepEqual(places[0], { id: 1, name: "Новочеркасск", region: "Ростовская область", country: "Россия", latitude: 47.42, longitude: 40.09 });
  assert.deepEqual(await searchCities("Н", { fetchImpl: response({ results: [] }) }), []);
});

test("current weather maps to stylist context facts", async () => {
  const weather = await loadCurrentWeather({ name: "Новочеркасск", latitude: 47.42, longitude: 40.09 }, { fetchImpl: response({ current: { time: "2026-08-21T12:00", temperature_2m: 28.4, apparent_temperature: 31, precipitation: 0, rain: 0, showers: 0, snowfall: 0, wind_speed_10m: 18 } }) });
  assert.equal(weather.temperatureC, 28);
  assert.equal(weather.precipitation, "none");
  assert.equal(weather.wind, "breezy");
  assert.equal(weather.feelsLike, "warmer");
});
