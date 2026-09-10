# ADR 0011: closed staging is blocked until pixel safety and billing are proven

Date: 2026-09-10. Decision: NO-GO for user-photo staging.

The original CV endpoint wrote input bytes to a temporary directory and called
an ignored research script. Deleting files afterwards did not meet the no-disk
requirement. Neither model output nor a client flag proves absence of people.

The disk-processing entry point now fails before processing, and the deployable
worker reports a missing safety capability. Research code, datasets and outputs
remain local. Photo storage requires an application-owned validator of exact
bytes; the BFF requires a separate server validator before forwarding anything.
No production validator is wired. Thus photo saving is intentionally unavailable.
The reference flow no longer falls back to a rectangular crop of the original.
This is containment, not delivery of a working segmentation system.

The existing Supabase BFF is a legacy integration, not the Russian staging
backend. A separate VK API contract verifies signed launch parameters, binds
identity to the configured application, checks a five-minute timestamp window,
and stores metadata with the session owner as the SQL key. It rejects photo
fields. SQLite sessions survive restart. The CLI gate rejects all requests and
does not read photo bodies: billing enforcement is not configured. The UI is not
yet wired to this API. A successful contract test does not imply a working VK app.

Budget amounts use integer kopecks. A durable latch defaults to blocked and never
resets with the calendar. Mandatory costs, continuing disks, billing/stop latency
and the next operation must all fit below 500000 kopecks. Stale/absent billing
blocks. Alerts use separate persistent Telegram/email outbox rows at 350000 and
400000 kopecks; retries require receiver idempotency. Provider shutdown, fresh
billing ingestion, approved resume with top-up verification and real delivery
remain unwired. No environment variable bypass is provided.

Rollback must not re-enable unsafe photo persistence. Retain the photo gate even
if other changes are reverted. Existing local materials must not be deleted or
migrated automatically. No legal compliance assertion follows from these tests.
