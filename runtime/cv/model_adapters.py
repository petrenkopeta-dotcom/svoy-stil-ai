"""Real Transformers adapters; lazy imports, verified local snapshots only.

No models are bundled or downloaded. No face identity/attributes are inferred.
The independent verifier requires a separately trained garment semantic model
and an object detector with BOTH person and face classes; missing classes fail.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from pipeline import PipelineError

GARMENTS = ("shirt", "top", "t-shirt", "blouse", "sweater", "jacket", "coat",
            "dress", "skirt", "pants", "jeans", "shorts", "shoe", "bag")


def verified_snapshot(spec, root):
    root = Path(root).resolve(strict=True)
    directory = (root / spec["directory"]).resolve(strict=True)
    if not directory.is_relative_to(root) or not isinstance(spec.get("sha256"), dict):
        raise PipelineError("model_manifest_invalid")
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file()}
    if actual != set(spec["sha256"]) or "config.json" not in actual or not any(p.endswith(".safetensors") for p in actual):
        raise PipelineError("model_manifest_incomplete")
    for name, expected in spec["sha256"].items():
        file = directory / name
        if file.is_symlink() or not file.resolve().is_relative_to(directory) or len(expected) != 64:
            raise PipelineError("model_manifest_invalid")
        digest = hashlib.sha256()
        with file.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise PipelineError("model_hash_mismatch")
    return str(directory)


class GroundingSamGenerator:
    def __init__(self, detector_path, sam_path):
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Processor, Sam2Model
        self.torch = torch
        self.dp = AutoProcessor.from_pretrained(detector_path, local_files_only=True, trust_remote_code=False)
        self.detector = AutoModelForZeroShotObjectDetection.from_pretrained(detector_path, local_files_only=True, trust_remote_code=False, use_safetensors=True).eval()
        self.sp = Sam2Processor.from_pretrained(sam_path, local_files_only=True)
        self.sam = Sam2Model.from_pretrained(sam_path, local_files_only=True, use_safetensors=True).eval()

    def candidates(self, image, limit=3):
        inputs = self.dp(images=image, text=". ".join(GARMENTS) + ".", return_tensors="pt")
        with self.torch.inference_mode():
            outputs = self.detector(**inputs)
        found = self.dp.post_process_grounded_object_detection(outputs, inputs.input_ids, threshold=0.25, text_threshold=0.20, target_sizes=[image.size[::-1]])[0]
        rows = sorted(zip(found["scores"].tolist(), found["text_labels"], found["boxes"].tolist()), reverse=True)[:limit]
        if any(label not in GARMENTS or not np.isfinite([score, *box]).all() or len(box) != 4 or box[2] <= box[0] or box[3] <= box[1] for score, label, box in rows):
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
        from transformers import AutoImageProcessor, AutoModelForObjectDetection, SegformerForSemanticSegmentation
        self.torch = torch
        self.pp = AutoImageProcessor.from_pretrained(presence_path, local_files_only=True, trust_remote_code=False)
        self.presence = AutoModelForObjectDetection.from_pretrained(presence_path, local_files_only=True, trust_remote_code=False, use_safetensors=True).eval()
        self.sp = AutoImageProcessor.from_pretrained(semantic_path, local_files_only=True, trust_remote_code=False)
        self.semantic = SegformerForSemanticSegmentation.from_pretrained(semantic_path, local_files_only=True, use_safetensors=True).eval()
        labels = {int(k): v.lower() for k, v in self.presence.config.id2label.items()}
        if not {"person", "face"}.issubset(labels.values()):
            raise PipelineError("presence_classes_missing")
        self.person = {k for k, v in labels.items() if v == "person"}
        self.face = {k for k, v in labels.items() if v == "face"}
        semantic_labels = {int(k): v.lower() for k, v in self.semantic.config.id2label.items()}
        if not garment_labels or not set(garment_labels).issubset(GARMENTS) or not set(garment_labels).issubset(semantic_labels.values()):
            raise PipelineError("garment_classes_missing")
        self.allowed = [k for k, v in semantic_labels.items() if v in garment_labels]
        self.confidence = max(0.995, confidence)

    def inspect(self, rgba, visible):
        # Two composites prevent invisible pixels from influencing the check.
        for color in ("white", "black"):
            composite = Image.new("RGB", rgba.size, color)
            composite.paste(rgba, mask=rgba.getchannel("A"))
            try:
                with self.torch.inference_mode():
                    detected = self.presence(**self.pp(images=composite, return_tensors="pt"))
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
    import torch
    import transformers
    manifest = json.loads(Path(manifest_file).read_text(encoding="utf-8"))
    if manifest.get("versions") != {"torch": torch.__version__.split("+")[0], "transformers": transformers.__version__}:
        raise PipelineError("model_versions_mismatch")
    specs = manifest["models"]
    roles = ("generator_detector", "generator_segmenter", "verifier_presence", "verifier_semantic")
    paths = {role: verified_snapshot(specs[role], model_root) for role in roles}
    fingerprints = [tuple(sorted(v for k, v in specs[role]["sha256"].items() if k.endswith(".safetensors"))) for role in roles]
    if len(set(paths.values())) != 4 or len(set(fingerprints)) != 4:
        raise PipelineError("independent_models_required")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    return (GroundingSamGenerator(paths[roles[0]], paths[roles[1]]),
            IndependentOutputVerifier(paths[roles[2]], paths[roles[3]], manifest["garment_labels"]))
