# MVP-METRICS-16 — local-only pilot telemetry

Status: local implementation candidate. Production analytics remains **HOLD**.

## Boundary

- Versioned allowlist: `src/telemetry/eventDictionary.js` (22 product/funnel events plus technical events).
- Consent is independent and required before identifiers or events are persisted.
- Queue uses browser-local storage only. There is no vendor SDK, `fetch`, `sendBeacon`, WebSocket, or external endpoint in the telemetry domain.
- Installation/session identifiers are random then one-way reduced before inclusion in events. Email, OTP, tokens, raw photo/image, file/path, free text, and body metrics are rejected.
- `dev` and `pilot` events are logically separated. Retention defaults to 30 days; purge, JSON export, event deletion, and full telemetry reset are available.
- Pilot panel is intentionally visible only with `?pilotMetrics=1`.

## Metric derivation

`calculatePilotMetrics` derives TTFR, onboarding completion, auth/first-item success, QWWR@3, explanation usefulness, second-item intent, D1/D7 returns, and technical error count from local events. Missing denominators produce `null`, never an invented success value.

## Runtime hooks

The current magic path emits consent-gated events for onboarding start/completion, first result request/show/action, auth gate/session restore/revoke, first-item start/completion, and would-wear feedback. The dictionary also reserves allowlisted events for remaining pilot instrumentation without accepting arbitrary properties.

## Evidence semantics

`qa-evidence/mvp-metrics-16/report.json` is local browser evidence only. It proves runtime emission to local durable storage, privacy-negative rejection, idempotency, pilot separation, JSON export, and zero telemetry network egress in the exercised browser run. It is not production traffic, production retention, or vendor/dashboard evidence.
