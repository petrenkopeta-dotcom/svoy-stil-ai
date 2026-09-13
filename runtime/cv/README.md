# Memory-only CV runtime

The implemented path is bytes в†’ Pillow decode в†’ GroundingDINO garment boxes в†’
SAM2 masks в†’ stripped RGBA PNG в†’ independent presence/semantic models on the
**decoded PNG bytes** в†’ SHA-256 proof. No input, masks, overlay or report file is
written. Transparency has zero hidden RGB. Original filenames/hashes are absent
from protocol output. The JS supervisor admits one job, counts cold start inside
the 20-second deadline, hard-kills hung work, and remains faulted until explicitly
replaced. No automatic restart is implemented.

The model implementation reuses the operation sequence from the local research
prototype, not its file I/O, metrics, datasets or imports. References:
[GroundingDINO](https://huggingface.co/docs/transformers/model_doc/grounding-dino),
[SAM2](https://huggingface.co/docs/transformers/model_doc/sam2),
[SegFormer](https://huggingface.co/docs/transformers/model_doc/segformer).

`requirements-test.txt` contains only NumPy/Pillow. Run
`python -B -m unittest discover -s runtime/cv -p 'test_*.py'`.
Tests use synthetic pixels and injected model contracts. They prove actual
in-memory image encoding/decoding and error behavior, **not model accuracy**.
The Node tests additionally kill a real hung OS process.

`requirements-models.txt` is an uninstalled deployment dependency set. Actual
model integration and all transitive versions still need validation on approved
Russian infrastructure. Do not install it on the laptop automatically.

For a future authorized offline research run provide `CV_MODEL_ROOT` and
`CV_MODEL_MANIFEST`. **Manifest v2 is required; old manifests fail closed and
must be recreated after review, not silently migrated.** See
[CV-MODEL-READINESS](../../docs/CV-MODEL-READINESS.md) for exact fields, pinned
revisions, licenses, API evidence and the real benchmark protocol.

`model-selection.json` is a research shortlist, NOT a loadable manifest. It
contains verified repository revisions but deliberately no invented weight
hashes. Every local snapshot file must have a real SHA256 in the deployment
manifest. Pickle weights, Python handlers, remote custom code, symlinks and
junctions are rejected. Missing/mismatched model parameters fail loading.
Model directories must be immutable/read-only during inference.

Research adapters now use GroundingDINO tiny + SAM2.1 tiny for proposals,
separate OWLv2 fixed person/face text queries and ATR SegFormer B2 for verification.
Queries do not prove face recall. ATR taxonomy is checked exactly; upper-clothes
and left/right-shoe map to garment categories without admitting body/background.
This does not prove the generator's product subtype. Every visible pixel must
still satisfy garment probability >=0.995 on black AND white composites.
These thresholds are uncalibrated. **The selected SegFormer card links a
research/evaluation-only license: commercial release remains NO-GO.**

The adapters run on CPU/FP32; no hardware, latency or memory result is claimed.
The exact top-level dependency versions are checked; a complete platform-specific
transitive wheel lock and actual model-load evidence are still outstanding.

Outputs always say `productionApproved: false`. `garmentPhotoFlow.mjs` has a
separate default-deny release predicate. An authenticated owner can only confirm
an opaque, expiring server-held candidate; confirmation runs the independent
verifier again and stores only those exact bytes. Client supplied safety flags
and cutout uploads cannot authorize saving. SQLite persists approved output PNGs,
never the source. TTL/memory bounds limit unconfirmed output retention.

No ML weights were installed or run. Before approving any release: freeze and
independently validate all four model checkpoints, pin the complete dependency
lock, measure cold/warm/load behavior, verify OS-level network denial, no swap,
no coredumps/temp spooling, and perform adversarial person/face/background tests.
Application memory controls do not prove host-level no-disk behavior.

The release predicate and billing admission remain false in the shipped CLI.
Neither a model self-report nor a configuration date authorizes enabling photos,
spending money or relaxing the 5000 RUB monthly ceiling.
