"""Real Transformers adapters; lazy imports, verified local snapshots only.

No models are bundled or downloaded. No face identity/attributes are inferred.
Research-only OWLv2 queries and ATR semantic verifier. Queries do not prove
face recall. A separate default-deny release gate remains mandatory.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from pipeline import PipelineError
from model_manifest import (VERSIONS, ROLES, MODEL_TYPES, PRESENCE_QUERIES,
                            validate_manifest, semantic_ids, relative_name, valid_hash)

GARMENTS = ("shirt", "top", "t-shirt", "blouse", "sweater", "jacket", "coat",
            "dress", "skirt", "pants", "jeans", "shorts", "shoe", "bag")


def verified_snapshot(spec, root):
    if not isinstance(spec, dict) or not relative_name(spec.get("directory")):
        raise PipelineError("model_manifest_invalid")
    root = Path(root).resolve(strict=True)
    unresolved = root / spec["directory"]
    for entry in (unresolved, *unresolved.parents):
        if entry != root and entry.is_relative_to(root) and (entry.is_symlink() or (hasattr(entry, "is_junction") and entry.is_junction())):
            raise PipelineError("model_manifest_invalid")
    directory = unresolved.resolve(strict=True)
    if not directory.is_relative_to(root) or not isinstance(spec.get("sha256"), dict):
        raise PipelineError("model_manifest_invalid")
    entries = list(directory.rglob("*"))
    if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in entries):
        raise PipelineError("model_manifest_invalid")
    actual = {p.relative_to(directory).as_posix() for p in entries if p.is_file()}
    if actual != set(spec["sha256"]) or "config.json" not in actual or not any(p.endswith(".safetensors") for p in actual):
        raise PipelineError("model_manifest_incomplete")
    for name, expected in spec["sha256"].items():
        file = directory / name
        if not relative_name(name) or not file.resolve().is_relative_to(directory) or not valid_hash(expected) or file.suffix.lower() in {".bin", ".pt", ".pth", ".pkl", ".pickle", ".py"}:
            raise PipelineError("model_manifest_invalid")
        digest = hashlib.sha256()
        with file.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise PipelineError("model_hash_mismatch")
    return str(directory)


def load_model(model_class, path):
    model, info = model_class.from_pretrained(path, local_files_only=True,
        trust_remote_code=False, use_safetensors=True, output_loading_info=True)
    if any(info.get(key) for key in ("missing_keys", "unexpected_keys", "mismatched_keys", "error_msgs")):
        raise PipelineError("model_parameters_incomplete")
    return model.eval()


class GroundingSamGenerator:
    def __init__(self, detector_path, sam_path, garment_labels=GARMENTS):
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Processor, Sam2Model
        self.torch = torch
        self.garment_labels = tuple(garment_labels)
        self.dp = AutoProcessor.from_pretrained(detector_path, local_files_only=True, trust_remote_code=False)
        self.detector = load_model(AutoModelForZeroShotObjectDetection, detector_path)
        self.sp = Sam2Processor.from_pretrained(sam_path, local_files_only=True)
        self.sam = load_model(Sam2Model, sam_path)

    def candidates(self, image, limit=3):
        inputs = self.dp(images=image, text=". ".join(self.garment_labels) + ".", return_tensors="pt")
        with self.torch.inference_mode():
            outputs = self.detector(**inputs)
        found = self.dp.post_process_grounded_object_detection(outputs, inputs.input_ids, threshold=0.25, text_threshold=0.20, target_sizes=[image.size[::-1]])[0]
        rows = sorted(zip(found["scores"].tolist(), found["text_labels"], found["boxes"].tolist()), reverse=True)[:limit]
        if any(label not in self.garment_labels or not np.isfinite([score, *box]).all() or len(box) != 4 or box[2] <= box[0] or box[3] <= box[1] for score, label, box in rows):
            raise PipelineError("invalid_detection")
        if not rows:
            return []
        inputs = self.sp(images=image, input_boxes=[[row[2] for row in rows]], return_tensors="pt")
        with self.torch.inference_mode():
            outputs = self.sam(**inputs, multimask_output=True)
        masks = self.sp.post_process_masks(outputs.pred_masks.cpu(), inputs["original_sizes"])[0]
        scores = outputs.iou_scores.cpu().numpy()[0]
        return [{"label": label, "mask": np.asarray(masks[i][int(np.argmax(scores[i]))], dtype=bool)} for i, (_, label, _) in enumerate(rows)]


class IndependentOutputVerifier:
    def __init__(self, presence_path, semantic_path, garment_labels, confidence=0.995):
        import torch
        from transformers import AutoImageProcessor, Owlv2Processor, Owlv2ForObjectDetection, SegformerForSemanticSegmentation
        self.torch = torch
        self.pp = Owlv2Processor.from_pretrained(presence_path, local_files_only=True, trust_remote_code=False)
        self.presence = load_model(Owlv2ForObjectDetection, presence_path)
        self.sp = AutoImageProcessor.from_pretrained(semantic_path, local_files_only=True, trust_remote_code=False)
        self.semantic = load_model(SegformerForSemanticSegmentation, semantic_path)
        self.person, self.face = {0}, {1}  # Indices of fixed OWLv2 queries.
        self.allowed = semantic_ids(self.semantic.config.id2label, garment_labels)
        if not np.isfinite(confidence) or not 0.995 <= confidence <= 1:
            raise PipelineError("invalid_confidence")
        self.confidence = confidence

    def inspect(self, rgba, visible):
        # Check both composites; model predictions still depend on the surrounding color.
        for color in ("white", "black"):
            composite = Image.new("RGB", rgba.size, color)
            composite.paste(rgba, mask=rgba.getchannel("A"))
            try:
                with self.torch.inference_mode():
                    detected = self.presence(**self.pp(images=composite, text=[list(PRESENCE_QUERIES)], return_tensors="pt"))
                    if not self.torch.isfinite(detected.logits).all() or not self.torch.isfinite(detected.pred_boxes).all():
                        raise PipelineError("invalid_detection")
                    presence = self.pp.post_process_object_detection(detected, threshold=0.05, target_sizes=[rgba.size[::-1]])[0]
                    classes = set(presence["labels"].tolist())
                    if classes & (self.person | self.face):
                        return {"personPresent": bool(classes & self.person), "facePresent": bool(classes & self.face), "garmentOnly": False}
                    semantic = self.semantic(**self.sp(images=composite, return_tensors="pt"))
                    logits = self.torch.nn.functional.interpolate(semantic.logits, size=rgba.size[::-1], mode="bilinear", align_corners=False)
                    probs = logits.softmax(dim=1)[0]
                    garment_probability = probs[self.allowed].sum(dim=0).cpu().numpy()
                    if not np.isfinite(garment_probability).all() or (garment_probability[visible] < self.confidence).any():
                        return {"personPresent": False, "facePresent": False, "garmentOnly": False}
            finally:
                composite.close()
        return {"personPresent": False, "facePresent": False, "garmentOnly": True}


def load_adapters(manifest_file, model_root):
    from importlib.metadata import version
    manifest = validate_manifest(json.loads(Path(manifest_file).read_text(encoding="utf-8")))
    if any(version(name).split("+")[0] != expected for name, expected in VERSIONS.items()):
        raise PipelineError("model_versions_mismatch")
    import torch
    specs = manifest["models"]
    paths = {role: verified_snapshot(specs[role], model_root) for role in ROLES}
    for role, path in paths.items():
        config = json.loads((Path(path) / "config.json").read_text(encoding="utf-8"))
        if config.get("model_type") != MODEL_TYPES[role] or config.get("auto_map"):
            raise PipelineError("model_architecture_mismatch")
    fingerprints = [{v for k, v in specs[role]["sha256"].items() if k.endswith(".safetensors")} for role in ROLES]
    if len(set(paths.values())) != 4 or any(first & other for i, first in enumerate(fingerprints) for other in fingerprints[i + 1:]):
        raise PipelineError("independent_models_required")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    return (GroundingSamGenerator(paths[ROLES[0]], paths[ROLES[1]], manifest["garment_labels"]),
            IndependentOutputVerifier(paths[ROLES[2]], paths[ROLES[3]], manifest["garment_labels"]))
