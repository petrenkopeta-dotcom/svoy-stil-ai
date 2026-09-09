import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_FUNNEL_EVENT_COUNT, TELEMETRY_EVENTS } from "./telemetry/eventDictionary.js";
import { createLocalTelemetryCollector } from "./telemetry/localCollector.js";
import { calculatePilotMetrics, ownerMetricRows } from "./telemetry/pilotMetrics.js";

const storage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data }; };
const cryptoImpl = { randomUUID: (() => { let value = 0; return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`; })() };

test("dictionary has exactly 22 allowlisted product funnel events and technical events", () => {
  assert.equal(PRODUCT_FUNNEL_EVENT_COUNT, 23);
  assert.ok(Object.values(TELEMETRY_EVENTS).some((event) => event.category === "technical"));
});

test("consent gates collection and privacy negatives are rejected", () => {
  const local = storage(); const session = storage();
  const collector = createLocalTelemetryCollector({ storage: local, sessionStorage: session, cryptoImpl, now: () => 1000, environment: "pilot" });
  assert.equal(collector.emit("app_started", { entry: "landing" }).reason, "consent_required");
  collector.setConsent(true);
  for (const properties of [{ email: "person@example.com" }, { token: "secret" }, { raw_photo: "data:image/png" }, { path: "C:\\Users\\person\\photo.jpg" }, { free_text: "hello" }, { body_weight: 55 }]) {
    assert.equal(collector.emit("app_started", properties).reason, "privacy_rejected");
  }
  assert.equal(collector.list().length, 0);
});

test("queue persists locally, dedupes, separates environments, exports, deletes and resets", () => {
  const local = storage(); const session = storage();
  const pilot = createLocalTelemetryCollector({ storage: local, sessionStorage: session, cryptoImpl, now: () => 2000, environment: "pilot" }); pilot.setConsent(true);
  assert.equal(pilot.emit("app_started", { entry: "landing" }, { idempotencyKey: "once" }).ok, true);
  assert.equal(pilot.emit("app_started", { entry: "landing" }, { idempotencyKey: "once" }).deduped, true);
  const dev = createLocalTelemetryCollector({ storage: local, sessionStorage: session, cryptoImpl, now: () => 2000, environment: "dev" });
  assert.equal(dev.list().length, 0); assert.equal(pilot.list().length, 1);
  assert.doesNotMatch(pilot.exportJson(), /example\.com|token|photo/i);
  pilot.deleteEvents(); assert.equal(pilot.list().length, 0);
  pilot.reset(); assert.equal(pilot.hasConsent(), false); assert.equal(pilot.networkEgress, false);
});

test("retention purge removes expired events", () => {
  const local = storage(); const session = storage(); let now = 1000;
  const collector = createLocalTelemetryCollector({ storage: local, sessionStorage: session, cryptoImpl, now: () => now, retentionDays: 1 }); collector.setConsent(true);
  collector.emit("app_started", { entry: "landing" }); now += 2 * 86400000; assert.equal(collector.purgeExpired(), 1);
});

test("return bucket counts a new local session without pretending auth", () => {
  const local = storage(); let now = Date.parse("2026-01-01T10:00:00.000Z");
  const first = createLocalTelemetryCollector({ storage: local, sessionStorage: storage(), cryptoImpl, now: () => now, environment: "pilot" });
  first.setConsent(true);
  first.emit("app_started", { entry: "landing" });
  assert.equal(first.returnBucket(), null);

  now += 86400000;
  const returned = createLocalTelemetryCollector({ storage: local, sessionStorage: storage(), cryptoImpl, now: () => now, environment: "pilot" });
  assert.equal(returned.returnBucket(), "d1");
  assert.equal(returned.emit("session_returned", { day_bucket: returned.returnBucket() }).ok, true);
  assert.equal(returned.list().some((event) => event.name === "session_returned"), true);
});

test("pilot metrics calculate TTFR, completion and QWWR@3", () => {
  const events = [
    { name: "onboarding_started", timestamp: "2026-01-01T00:00:00.000Z", session_id: "s", properties: {} },
    { name: "onboarding_completed", timestamp: "2026-01-01T00:00:01.000Z", session_id: "s", properties: {} },
    { name: "first_result_shown", timestamp: "2026-01-01T00:00:02.000Z", session_id: "s", properties: {} },
    { name: "look_generated", timestamp: "2026-01-01T00:00:03.000Z", session_id: "s", properties: {} },
    { name: "would_wear_recorded", timestamp: "2026-01-01T00:00:04.000Z", session_id: "s", properties: { sequence: 1 } },
  ];
  const metrics = calculatePilotMetrics(events); assert.equal(metrics.ttfr_ms, 2000); assert.equal(metrics.onboarding_completion_rate, 1); assert.equal(metrics.qwwr_at_3, 1);
  assert.equal(ownerMetricRows(metrics).find((row) => row.key === "onboarding").value, 100);
});

test("funnel conversion is session-based and cannot exceed 100 percent", () => {
  const events = [
    { name: "first_item_started", timestamp: "2026-01-01T00:00:00.000Z", session_id: "s", properties: {} },
    { name: "first_item_completed", timestamp: "2026-01-01T00:00:01.000Z", session_id: "s", properties: {} },
    { name: "first_item_completed", timestamp: "2026-01-01T00:00:02.000Z", session_id: "s", properties: {} },
  ];
  assert.equal(calculatePilotMetrics(events).first_item_success_rate, 1);
});
