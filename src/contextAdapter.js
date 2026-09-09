export const CONTEXT_SCHEMA_VERSION = "1.0";
export const CONTEXT_REQUEST_MAPPING_VERSION = "context-to-stylist-request/1.0";
export const CONTEXT_STORAGE_CONSENT_VERSION = "manual-context-storage/1.0";
export const CONTEXT_STORAGE_KEY = "ai-stylist:manual-context:v1";

const PRECIPITATION = new Set(["none", "rain", "snow", "mixed"]);
const WIND = new Set(["calm", "breezy", "strong"]);
const FEELS_LIKE = new Set(["colder", "as_expected", "warmer"]);
const ACTIVITY = new Set(["low", "moderate", "active"]);
const PRIORITY = new Set(["balanced", "comfort", "expressiveness"]);

const optionalText = (value, max) => {
  if (value == null || String(value).trim() === "") return null;
  const result = String(value).trim();
  if (result.length > max) throw new RangeError(`value must be at most ${max} chars`);
  return result;
};

const optionalEnum = (value, allowed, path) => {
  if (value == null || value === "") return null;
  if (!allowed.has(value)) throw new RangeError(`${path} is not supported`);
  return value;
};

export function createManualContext(input = {}) {
  const temperatureC = input.temperatureC == null || input.temperatureC === "" ? null : Number(input.temperatureC);
  if (temperatureC != null && (!Number.isFinite(temperatureC) || temperatureC < -60 || temperatureC > 60)) {
    throw new RangeError("ManualContext.temperatureC must be between -60 and 60");
  }
  const standingMinutes = input.standingMinutes == null || input.standingMinutes === "" ? null : Number(input.standingMinutes);
  if (standingMinutes != null && (!Number.isInteger(standingMinutes) || standingMinutes < 0 || standingMinutes > 720)) {
    throw new RangeError("ManualContext.standingMinutes must be between 0 and 720");
  }
  const result = {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    source: "manual",
    city: optionalText(input.city, 80),
    occasion: optionalText(input.occasion, 80),
    temperatureC,
    precipitation: optionalEnum(input.precipitation, PRECIPITATION, "ManualContext.precipitation"),
    wind: optionalEnum(input.wind, WIND, "ManualContext.wind"),
    feelsLike: optionalEnum(input.feelsLike, FEELS_LIKE, "ManualContext.feelsLike"),
    standingMinutes,
    activity: optionalEnum(input.activity, ACTIVITY, "ManualContext.activity"),
    priority: optionalEnum(input.priority, PRIORITY, "ManualContext.priority"),
  };
  const hasFacts = Object.entries(result).some(([key, value]) => !["schemaVersion", "source"].includes(key) && value != null);
  return { ...result, confirmed: input.confirmed === true || (input.confirmed !== false && hasFacts) };
}

export const emptyManualContext = () => createManualContext();
export const confirmManualContext = (input = {}) => ({ ...createManualContext(input), confirmed: true });
export const weatherContextDraft = (input = {}) => ({ ...createManualContext({ ...input, confirmed: false }), confirmed: false });

export function contextLabels(contextInput = {}) {
  const context = createManualContext(contextInput);
  const weatherParts = [];
  if (context.city != null) weatherParts.push(context.city);
  if (context.temperatureC != null) weatherParts.push(`${context.temperatureC > 0 ? "+" : ""}${context.temperatureC}°`);
  if (context.precipitation != null) weatherParts.push({ none: "без осадков", rain: "дождь", snow: "снег", mixed: "смешанные осадки" }[context.precipitation]);
  return {
    weather: weatherParts.length ? weatherParts.join(" · ") : "Погода не указана",
    occasion: context.occasion || "Повод не указан",
  };
}

/** Maps only facts entered by the user. Missing fields remain absent and cannot influence rules. */
export function mapContextToStylistRequest(contextInput = {}) {
  const context = createManualContext(contextInput);
  const mapped = { mapping_version: CONTEXT_REQUEST_MAPPING_VERSION, confirmed: context.confirmed, source: "manual" };
  if (!context.confirmed) return mapped;
  for (const key of ["city", "occasion", "temperatureC", "precipitation", "wind", "feelsLike", "standingMinutes", "activity", "priority"]) {
    if (context[key] != null) mapped[key] = context[key];
  }
  return mapped;
}

export function withContextInStylistRequest(request = {}, contextInput = {}) {
  const context = mapContextToStylistRequest(contextInput);
  return { ...request, occasion: context.occasion ?? null, context };
}

export function loadConsentedContext(storage) {
  if (!storage?.getItem) return emptyManualContext();
  try {
    const record = JSON.parse(storage.getItem(CONTEXT_STORAGE_KEY));
    if (record?.consent?.granted !== true || record.consent.version !== CONTEXT_STORAGE_CONSENT_VERSION) return emptyManualContext();
    return createManualContext(record.context);
  } catch {
    return emptyManualContext();
  }
}

export function persistContext(storage, contextInput, { consent = false, now = new Date().toISOString() } = {}) {
  if (!consent) return { ok: false, code: "consent_required" };
  if (!storage?.setItem) return { ok: false, code: "storage_unavailable" };
  const context = createManualContext(contextInput);
  if (!context.confirmed) return { ok: false, code: "confirmation_required" };
  storage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify({
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    consent: { granted: true, version: CONTEXT_STORAGE_CONSENT_VERSION, grantedAt: now },
    context,
  }));
  return { ok: true, context };
}

export function clearPersistedContext(storage) {
  storage?.removeItem?.(CONTEXT_STORAGE_KEY);
}
