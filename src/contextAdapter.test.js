import test from "node:test";
import assert from "node:assert/strict";
import { contextLabels, createManualContext, loadConsentedContext, mapContextToStylistRequest, persistContext, withContextInStylistRequest } from "./contextAdapter.js";
import { createStylistRequest } from "./stylistReasoningSchemas.js";

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test("empty context has honest labels and maps no invented facts", () => {
  const context = createManualContext();
  assert.equal(context.confirmed, false);
  assert.equal(contextLabels(context).weather, "Погода не указана");
  assert.deepEqual(mapContextToStylistRequest(context), { mapping_version: "context-to-stylist-request/1.0", confirmed: false, source: "manual" });
});

test("manual fields map into a versioned StylistRequest and round-trip", () => {
  const mapped = withContextInStylistRequest({ request_id: "r1" }, { occasion: "театр", temperatureC: 7, precipitation: "rain", activity: "moderate", priority: "comfort" });
  const request = createStylistRequest(mapped);
  assert.equal(request.context.mapping_version, "context-to-stylist-request/1.0");
  assert.equal(request.context.temperatureC, 7);
  assert.equal(request.occasion, "театр");
});

test("context persistence requires explicit current-version consent", () => {
  const storage = memoryStorage();
  const context = { temperatureC: 12 };
  assert.deepEqual(persistContext(storage, context), { ok: false, code: "consent_required" });
  assert.equal(loadConsentedContext(storage).confirmed, false);
  assert.equal(persistContext(storage, context, { consent: true, now: "2026-08-12T00:00:00.000Z" }).ok, true);
  assert.equal(loadConsentedContext(storage).temperatureC, 12);
});

test("invalid manual values and mapping versions fail closed", () => {
  assert.throws(() => createManualContext({ temperatureC: 61 }), /between -60 and 60/);
  assert.throws(() => createManualContext({ precipitation: "dry-ish" }), /not supported/);
  assert.throws(() => createStylistRequest({ request_id: "r", context: { mapping_version: "context-to-stylist-request/2.0" } }), /not supported/);
  const request = createStylistRequest({ request_id: "r", context: { mapping_version: "context-to-stylist-request/1.0", confirmed: true, inferredDemographic: "blocked" } });
  assert.equal("inferredDemographic" in request.context, false);
});
