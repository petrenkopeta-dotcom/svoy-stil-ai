"""Offline manifest v2 and explicit ATR taxonomy; no weights or downloads."""
import re
from pathlib import PurePosixPath
from pipeline import PipelineError

VERSIONS = {"torch": "2.8.0", "torchvision": "0.23.0", "transformers": "4.56.1",
            "accelerate": "1.10.1", "numpy": "2.3.5", "Pillow": "12.3.0"}
ROLES = ("generator_detector", "generator_segmenter", "verifier_presence", "verifier_semantic")
MODEL_TYPES = dict(zip(ROLES, ("grounding-dino", "sam2_video", "owlv2", "segformer")))
PRESENCE_QUERIES = ("a person", "a human face")
# Semantic categories are broader than product labels: this is NOT subtype proof.
ATR_GARMENTS = {
    "shirt": ("upper-clothes",), "top": ("upper-clothes",),
    "t-shirt": ("upper-clothes",), "blouse": ("upper-clothes",),
    "sweater": ("upper-clothes",), "jacket": ("upper-clothes",),
    "coat": ("upper-clothes",), "dress": ("dress",), "skirt": ("skirt",),
    "pants": ("pants",), "jeans": ("pants",), "shorts": ("pants",),
    "shoe": ("left-shoe", "right-shoe"), "bag": ("bag",),
}
ATR_LABELS = ("background", "hat", "hair", "sunglasses", "upper-clothes", "skirt",
              "pants", "dress", "belt", "left-shoe", "right-shoe", "face",
              "left-leg", "right-leg", "left-arm", "right-arm", "bag", "scarf")


def relative_name(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        return False
    path = PurePosixPath(value)
    return not path.is_absolute() and all(p not in ("", ".", "..") for p in value.split("/"))


def valid_hash(value, length=64):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{%d}" % length, value) is not None


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or set(manifest) != {"schema_version", "versions", "garment_labels", "models"}:
        raise PipelineError("model_manifest_invalid")
    if type(manifest["schema_version"]) is not int or manifest["schema_version"] != 2:
        raise PipelineError("model_manifest_version")
    if manifest["versions"] != VERSIONS:
        raise PipelineError("model_versions_mismatch")
    labels = manifest["garment_labels"]
    if not isinstance(labels, list) or not labels or any(not isinstance(v, str) or v not in ATR_GARMENTS for v in labels) or len(set(labels)) != len(labels):
        raise PipelineError("garment_classes_missing")
    specs = manifest["models"]
    if not isinstance(specs, dict) or set(specs) != set(ROLES):
        raise PipelineError("model_manifest_invalid")
    for role, spec in specs.items():
        if not isinstance(spec, dict) or set(spec) != {"repository", "revision", "directory", "sha256"}:
            raise PipelineError("model_manifest_invalid")
        if not relative_name(spec["repository"]) or len(spec["repository"].split("/")) != 2 or not valid_hash(spec["revision"], 40) or not relative_name(spec["directory"]):
            raise PipelineError("model_manifest_invalid")
        hashes = spec["sha256"]
        if not isinstance(hashes, dict) or not hashes or any(not relative_name(k) or not valid_hash(v) for k, v in hashes.items()):
            raise PipelineError("model_manifest_invalid")
    return manifest


def semantic_ids(id2label, garment_labels):
    expected = {i: name for i, name in enumerate(ATR_LABELS)}
    try:
        actual = {int(k): v.lower() for k, v in id2label.items()}
        if actual != expected or not garment_labels or any(v not in ATR_GARMENTS for v in garment_labels):
            raise ValueError()
    except (TypeError, ValueError, AttributeError):
        raise PipelineError("garment_classes_missing") from None
    allowed = {category for label in garment_labels for category in ATR_GARMENTS[label]}
    return [i for i, name in expected.items() if name in allowed]
