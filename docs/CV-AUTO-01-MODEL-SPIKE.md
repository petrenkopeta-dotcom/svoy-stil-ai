# CV-AUTO-01 model spike — 2026-09-05

## Outcome

First honest local end-to-end result exists for one owner-provided 1920×2560 garment photo: GroundingDINO-Tiny produced boxes and SAM 2.1 Hiera Tiny produced three masks/cutouts without a manual prompt. This is **SPIKE EVIDENCE, not a production PASS**.

The follow-up run processed all three approved owner-provided real photos in explicit Hugging Face offline mode. Best candidate results were: owner-001 IoU 0.6992 / Dice 0.8229; owner-002 IoU 0.7391 / Dice 0.8500; owner-003 IoU 0.7018 / Dice 0.8248. Macro means over this N=3 convenience slice are IoU 0.7133 and Dice 0.8326; they are not release estimates.

Best candidate (candidate 3): 1,724,776 foreground pixels (35.09% of image), predicted-IoU confidence 0.9880, measured IoU 0.6992 and Dice 0.8229 against the existing single-annotator polygon. The best and second-best full-garment masks overlap at IoU 0.99987. Detector confidence is low (0.3021), and a higher-ranked partial-garment candidate has measured IoU only 0.0822. Ranking by detector score alone is therefore unsafe.

Warm cached CPU timing: GroundingDINO 9.68 s, SAM 2.85 s, 17.30 s total including model load and artifact writes. The first run, including code-path/model-cache warm-up but excluding the public-weight download time, was 24.48 s total.

## Evidence

- `qa-evidence/cv-auto-01/owner-001/report.json`
- `qa-evidence/cv-auto-01/owner-002/report.json`
- `qa-evidence/cv-auto-01/owner-003/report.json`
- `qa-evidence/cv-auto-01/owner-001/candidate-01..03.mask.png`
- `qa-evidence/cv-auto-01/owner-001/candidate-01..03.cutout.png`
- `qa-evidence/cv-auto-01/owner-001/candidate-01..03.overlay.jpg`
- Input SHA-256: `0bdeadd2c4f57b2eb34291637dabc2f9e188217bdcfb5575f1ccba64fde7659e` (matches the owner manifest).
- Human comparison source: `qa-evidence/garment-owner-3-fix-c/geometry/owner-001-burgundy-polo.png.boundary.json`; it is annotator A only and remains unadjudicated.

## Licensing checked

- GroundingDINO source and `IDEA-Research/grounding-dino-tiny` model card declare Apache-2.0.
- SAM 2 repository explicitly states code and model checkpoints are Apache-2.0; `facebook/sam2.1-hiera-tiny` declares Apache-2.0.
- Exact revisions, SHA-256 values, byte sizes and source URLs are frozen in `prototypes/cv_auto_01/model-inventory.json` (846,220,867 snapshot bytes total).
- Before shipping: pin model revisions, retain notices, generate an SBOM/checkpoint hash list, and obtain legal review. This spike is engineering evidence, not legal advice.

## Exact prerequisites

- Python 3.12 x64; CPU works, GPU optional.
- Packages pinned in `prototypes/cv_auto_01/requirements-spike.txt`.
- Approximately 1.1 GB for selected safetensor model weights plus roughly 1 GB for the disposable Python packages/cache; more may be needed because Windows symlink caching was unavailable.
- Initial network access to PyPI and Hugging Face; subsequent runs can use `HF_HUB_OFFLINE=1`.
- Local input permission and explicit owner/data-scope permission. Owner photos must never be sent to a hosted inference provider.

## Blockers and integration decision

Same-day **behind-a-local-development feature flag** is feasible: call the isolated worker, return ranked candidates, show overlays, and require explicit user selection/confirmation with the original retained as fallback.

`prototypes/cv_auto_01/integrationApi.js` defines that boundary: input bytes/path are local-only, network input transfer and inpainting are forbidden, every successful result is `review_required`, every candidate starts `accepted: false`, and any worker failure becomes `manual_fallback`.

Same-day production integration is **not feasible / HOLD**:

1. Only one real image was run; no person/outfit photo was available in the approved local-only set, so person-photo garment separation is unproven.
2. Candidate ranking is wrong for this image unless mask extent/model confidence is considered; automatic acceptance would select a partial collar/torso region.
3. The measured IoU 0.699 is below a plausible production-quality bar and is against an unadjudicated polygon.
4. The Hugging Face checkpoint declares `sam2_video`; using the explicit still-image `Sam2Model` works but emits an architecture compatibility warning. Pinning/repackaging a verified still-image config is required.
5. CPU latency needs a multi-image cold/warm benchmark and resource/timeout limits. Privacy deletion/TTL and worker crash behavior are not integrated.
6. At minimum, run the three owner garments plus a consented person/outfit set with adjudicated garment-instance masks, thin-edge metrics, category strata, and false-selection thresholds.

No inpainting, face/identity processing, biometrics, body-trait inference, or product-runtime changes were introduced.
