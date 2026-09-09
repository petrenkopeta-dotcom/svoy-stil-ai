# Stylist Reasoning QA v1

Status: **PASS** for `stylist-reasoning-eval/1.0.0` against `stylist-candidate-engine-v1`.

## Scope and safety boundary

This is an independent black-box design/QA gate. It does not change product modules, tune product rules, call external services, or use user photos. Production recognition remains **NO-GO**. The corpus contains only authored garment attributes and request context; it neither infers nor encodes a person's color type, body characteristics, age, gender, ethnicity, or other demographics.

The rules of the evaluation protocol are versioned in the dataset and runner. The development/holdout label was assigned during corpus construction. The same frozen runner evaluates both splits; there is no holdout-specific branch or threshold.

## Corpus

`eval-data/stylist-reasoning-v1/cases.json` contains 32 synthetic cases:

- 18 color/silhouette/occasion/weather cases;
- 6 anchor-preservation cases;
- 4 heavy-rain, waterproof-shoe, and required-outerwear cases;
- 4 insufficient-data cases (missing shoes, missing outfit base, missing outerwear, missing anchor).

Each case has a stable ID, split, tags, wardrobe, request, expected outcome, `top_k`, hard constraints, and an allowlist of explainable reasoning codes. Insufficient-data cases additionally allowlist exact no-candidate reasons.

## Acceptance protocol

For candidate-producing cases, top-k acceptance means at least one of the first `k` candidates satisfies all declared hard constraints. In addition, every returned candidate—not only top-k—is audited for forbidden items and anchor preservation. Required categories and required item IDs are checked against structured candidate membership.

For insufficient-data cases, acceptance requires zero candidates and at least one exact allowlisted reason. Observed QA reasoning codes are derived deterministically from structured score labels, candidate membership, and explicit weather flags. Any code outside the case allowlist fails the case.

The forbidden-claim audit scans candidate explanations for claims about color type, body shape/type, age from a photo, gender from a photo, ethnicity, or asserted photo recognition. This is a conservative textual guard, not a semantic model and not a substitute for a future human safety review.

Gate thresholds are exact:

| Metric | Required |
|---|---:|
| False factual claims | 0 |
| Anchor loss | 0 |
| Hard-constraint violations | 0 |
| Top-k rejections | 0 |

Any failed case produces `HOLD`; only an all-zero result produces `PASS`.

## Reproduction and result

From the repository root:

```powershell
node eval-data/stylist-reasoning-v1/generate-dataset.mjs
node eval-data/stylist-reasoning-v1/run-qa.mjs
```

The checked `qa-report.json` is deterministic (it intentionally has no wall-clock field). Current result: 32/32 cases passed; false factual claims 0; anchor loss 0; hard-constraint violations 0; top-k rejections 0. Gate: **PASS**.

## Limitations and next-stage inputs

This set measures deterministic constraint handling on synthetic metadata, not recommendation taste, real-world recognition accuracy, calibrated natural-language factuality, accessibility, or production behavior. Its palettes, categories, weather flags, and occasions are intentionally bounded; passing does not authorize production recognition.

The next stage should consume the frozen `cases.json`, `qa-report.json`, explicit thresholds, reasoning-code allowlists, and split labels. Any product ruleset or engine-version change must produce a new report. Corpus additions should receive a new dataset version; failures must be investigated without editing holdout expectations to match current output.
