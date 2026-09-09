const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const checkedFetch = async (url, fetchImpl, signal) => {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`weather_http_${response.status}`);
  return response.json();
};

export async function searchCities(query, { fetchImpl = globalThis.fetch, signal } = {}) {
  const name = String(query || "").trim();
  if (name.length < 2 || typeof fetchImpl !== "function") return [];
  const url = new URL(GEO_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "ru");
  url.searchParams.set("format", "json");
  const data = await checkedFetch(url, fetchImpl, signal);
  return (data.results || []).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map((item) => ({
    id: item.id || `${item.latitude}:${item.longitude}`,
    name: item.name,
    region: item.admin1 || item.country || "",
    country: item.country || "",
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

const precipitationKind = (current) => {
  if ((current.snowfall || 0) > 0 && ((current.rain || 0) > 0 || (current.showers || 0) > 0)) return "mixed";
  if ((current.snowfall || 0) > 0) return "snow";
  if ((current.rain || 0) > 0 || (current.showers || 0) > 0 || (current.precipitation || 0) > 0) return "rain";
  return "none";
};

export async function loadCurrentWeather(place, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude)) throw new TypeError("weather_place_required");
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(place.latitude));
  url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  const data = await checkedFetch(url, fetchImpl, signal);
  const current = data.current || {};
  if (!Number.isFinite(current.temperature_2m)) throw new Error("weather_payload_invalid");
  const delta = Number(current.apparent_temperature) - Number(current.temperature_2m);
  return {
    city: place.name,
    temperatureC: Math.round(current.temperature_2m),
    precipitation: precipitationKind(current),
    wind: current.wind_speed_10m >= 36 ? "strong" : current.wind_speed_10m >= 16 ? "breezy" : "calm",
    feelsLike: delta <= -2 ? "colder" : delta >= 2 ? "warmer" : "as_expected",
    observedAt: current.time || null,
  };
}
