# RELEASE-07 — performance stability

## Scope and result

The local deterministic candidate engine was measured with 12 items in each of five categories, a 5,000-candidate pool, and 30 returned outfits. No provider, network, paid API, or AI inference is involved. `src/main.jsx` was not changed.

The `<1500 ms` p95 budget remains unchanged. Candidate signatures are compared across every measured run, so the gate also detects a selection-result change.

## Root cause

The previous test used one cold wall-clock observation. It therefore mixed JIT startup and host scheduling noise with engine work; the observed 1547 ms was only 47 ms beyond the budget and the test had no warm-up or percentile sample.

Profiling the algorithm also identified a real hot path in diversity selection: for each remaining candidate and each already selected outfit it repeatedly allocated arrays and performed nested `Array.includes` scans. At the full pool this dominates ranking after candidate generation.

## Changes

- Warm up once, then collect seven independent CPU-time samples and enforce nearest-rank p95 `<1500 ms`. CPU time excludes unrelated host scheduler pauses while retaining the same useful compute budget.
- Compare the 30 ordered candidate signatures across all samples.
- Cache candidate ID membership with `Set` and calculate overlap without temporary arrays. Ranking score, diversity penalty, tie-break, public output, and candidate generation are unchanged.

## Measurements

Baseline on 2026-08-14 (one warm-up + 9 samples): p50 **1057.78 ms**, p95 **1312.22 ms**; samples: 1038.48, 1080.10, 1095.38, 985.77, 1057.78, 995.02, 808.27, 1086.72, 1312.22 ms.

Post-change on the same date (one warm-up + 9 samples): CPU-time p50 **296 ms**, p95 **328 ms**; samples: 266, 328, 296, 297, 297, 282, 328, 281, 281 ms. Every run returned the same 30 ordered signatures.

## Verification

- `node --test src/stylistCandidateEngine.test.js`
- `npm.cmd test`
- `npm.cmd run build`
