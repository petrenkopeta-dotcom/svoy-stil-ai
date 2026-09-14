import test from "node:test";
import assert from "node:assert/strict";
import { createVkCityContext } from "./vkStagingCity.js";

test("profile city requires confirmation and region, retaining no other user fields", () => {
  const city = createVkCityContext();
  const token = city.beginProfileRequest();
  assert.equal(
    city.offerProfile(token, {
      id: 456,
      first_name: "Synthetic",
      photo_100: "https://example.test/photo",
      city: { id: 1, title: "Мирный" },
    }),
    true,
  );
  assert.deepEqual(city.snapshot(), {
    selected: null,
    proposal: { name: "Мирный" },
    forecast: "not_connected",
  });
  assert.throws(() => city.confirmProfile(""), /city_region_required/);
  assert.deepEqual(city.confirmProfile("Якутия"), {
    name: "Мирный",
    region: "Якутия",
    source: "profile_confirmed",
  });
});

test("manual city always overrides profile and late profile responses", () => {
  const city = createVkCityContext(),
    token = city.beginProfileRequest();
  city.setManual("  Астрахань  ", "Астраханская область");
  assert.equal(city.offerProfile(token, { city: { title: "Москва" } }), false);
  assert.equal(
    city.offerProfile(city.beginProfileRequest(), {
      city: { title: "Москва" },
    }),
    false,
  );
  assert.equal(city.snapshot().selected.name, "Астрахань");
  city.setManual("Мирный", "Архангельская область");
  assert.equal(city.snapshot().selected.region, "Архангельская область");
});

test("missing, rejected or malformed profile leaves manual path available", () => {
  const city = createVkCityContext();
  for (const value of [
    null,
    {},
    { city: null },
    { city: { title: 123 } },
    { city: { title: "https://evil.test" } },
  ])
    assert.equal(city.offerProfile(city.beginProfileRequest(), value), false);
  assert.equal(city.setManual("Москва", "Москва").source, "manual");
});

test("city validation rejects URL, markup, control characters and oversized fields", () => {
  const city = createVkCityContext();
  for (const value of [
    "",
    "https://example.test",
    "<script>",
    "Москва\n",
    "a".repeat(101),
    "---",
  ])
    assert.throws(
      () => city.setManual(value, "region"),
      /city_region_required/,
    );
  assert.throws(() => city.setManual("Мирный", ""), /city_region_required/);
  assert.equal(
    city.setManual("Санкт-Петербург", "Россия").name,
    "Санкт-Петербург",
  );
});

test("logout reset clears city context and ignores old user's pending response", () => {
  const city = createVkCityContext();
  city.setManual("Москва", "Москва");
  const token = city.beginProfileRequest();
  city.reset();
  assert.equal(city.offerProfile(token, { city: { title: "Москва" } }), false);
  assert.deepEqual(city.snapshot(), {
    selected: null,
    proposal: null,
    forecast: "not_connected",
  });
});
