# Memory-only CV runtime

The implemented path is bytes → Pillow decode → GroundingDINO garment boxes →
SAM2 masks → stripped RGBA PNG → independent presence/semantic models on the
**decoded PNG bytes** → SHA-256 proof. No input, masks, overlay or report file is
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

For a future offline run provide `CV_MODEL_ROOT` and `CV_MODEL_MANIFEST` to the
Python worker (or the corresponding JS constructor options). The manifest must
contain `versions` with exact `torch` and `transformers` versions, `garment_labels`
(a non-empty subset of GARMENTS), and `models` with four distinct roles:
`generator_detector`, `generator_segmenter`, `verifier_presence`,
`verifier_semantic`. Each role has a relative `directory` and `sha256` map for
**every** file, including configs/tokenizer/processors and safetensors. Hashes
must be verified from the selected sources; no fabricated checksums or automatic
download is provided. Pickle weights and remote custom code are disabled.

The presence model must include both `person` and `face` classes. The independent
semantic model must be trained for the configured clothing labels. A generic
COCO model lacking a face class or a scene model lacking garment labels is
rejected. Every visible pixel must satisfy garment probability ≥0.995 on black
and white composites. This conservative model policy has **not** been calibrated
or validated and is not a guarantee of safe classification.

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
