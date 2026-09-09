import test from "node:test";
import assert from "node:assert/strict";
import { createCapsuleMetricsCollector } from "./telemetry/capsuleMetrics.js";

test("metrics are consent-gated, local-only and export/dashboard compatible", () => {
  const collector = createCapsuleMetricsCollector({ now: () => 1000 });
  assert.equal(collector.emit("personal_outfit_shown", { result_kind: "personal", sequence: 1 }).reason, "consent_required");
  collector.setConsent(true);
  collector.emit("personal_outfit_shown", { result_kind: "personal", sequence: 1 });
  collector.emit("would_wear_recorded", { result_kind: "personal", sequence: 1 });
  collector.emit("explanation_rated", { result_kind: "personal", useful: true });
  assert.equal(collector.networkEgress, false);
  assert.equal(collector.dashboard().qwwr_at_3, 1);
  assert.equal(collector.dashboard().production_kpi, false);
  assert.equal(JSON.parse(collector.exportJson()).events.length, 3);
});

test("PII, egress-shaped metadata, unknown properties and demo activation are rejected", () => {
  const collector = createCapsuleMetricsCollector({ consent: true });
  for (const properties of [
    { result_kind: "personal", sequence: 1, email: "person@example.com" },
    { result_kind: "personal", sequence: 1, url: "https://example.test" },
    { result_kind: "personal", sequence: 1, free_text: "hello" },
  ]) assert.match(collector.emit("personal_outfit_shown", properties).reason, /privacy_rejected/);
  assert.equal(collector.emit("personal_outfit_shown", { result_kind: "demo", sequence: 1 }).reason, "property_value");
  assert.equal(collector.list().length, 0);
});

test("revoking consent deletes the in-memory local event set", () => {
  const collector = createCapsuleMetricsCollector({ consent: true });
  collector.emit("explanation_rated", { result_kind: "demo", useful: false });
  collector.setConsent(false);
  assert.equal(collector.list().length, 0);
});
