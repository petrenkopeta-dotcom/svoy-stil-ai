# Additional free implementation — 2026-09-10

This continues the previous containment work; it does not approve a deployment.

Implemented:

- Real offline Transformer adapters: GroundingDINO/SAM2 generator; separate
  presence detector and SegFormer semantic verifier, validated local file hashes.
- Memory-only image decoding, orientation, metadata stripping, alpha masks,
  zero hidden RGB, exact PNG-byte verification and digest binding.
- Bounded single-job JSONL worker, cold/warm measurements, cancellation,
  20-second maximum deadline including cold start, OS hard kill, no auto restart.
- Server-owned owner-bound candidates, memory/TTL limits, independent second
  verification at confirmation, exact approved PNG storage and owner-scoped read.
- Functional HTTP metadata routes and bounded photo routes. Default-denied
  release and billing admission remain in place; no environment bypass.
- Opt-in `VITE_VK_STAGING=true` frontend for VK session restoration, private
  metadata wardrobe, save/read-back and logout. Launch query is removed from
  browser history and never stored. Photos remain unavailable in this UI.
- Separate network-disabled static demo build, explained in DEMO-DELIVERY.md.

The Python tests process actual synthetic PNG/JPEG/WebP pixels and test hashes;
their model interfaces are synthetic. They do not exercise real model weights.
The Node lifecycle test terminates a real process; browser tests exercise the
actual rendered clients with synthetic server responses. HTTP tests use real
local sockets and SQLite with synthetic VK signatures. These evidence categories
must not be conflated with model quality or a real VK launch.

Remaining dependencies: selected and independently validated four-model set,
complete transitive dependency lock and real model integration, approved Russian
host/TLS and process isolation, model cold/warm/load evidence, validated release
predicate, billing provider controller and real notification destinations. The
photo confirmation backend exists, but its approved frontend photo flow remains
unavailable until those gates pass. No SLO or 152-ФЗ compliance is claimed.

Next product priority AFTER the main service path is the morning error digest.
Its allowlist, bounded collection, separate UX hypotheses, deterministic grouping
and researched remediation format are requirements in the existing Notion plan.
It is not scheduled or connected; report time/channels and research execution are
unconfirmed. No overnight code changes, automatic installs or paid research are
authorized. Only minimal existing diagnostics are used during the core work.
