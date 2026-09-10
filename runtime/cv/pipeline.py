"""Memory-only image transformation. Model quality is a separate release gate."""
import base64
import hashlib
import io
import time
import warnings
import numpy as np
from PIL import Image, ImageOps

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 12_000_000
MAX_EDGE = 4096
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class PipelineError(Exception):
    pass


def decode_image(data, *, output=False):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
        raise PipelineError("image_bytes_limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                width, height = source.size
                if source.format not in (("PNG",) if output else ("PNG", "JPEG", "WEBP")):
                    raise PipelineError("image_format")
                if getattr(source, "n_frames", 1) != 1 or min(width, height) < 1 or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
                    raise PipelineError("image_dimensions")
                if output and (source.mode != "RGBA" or source.info):
                    raise PipelineError("output_metadata_or_mode")
                image = ImageOps.exif_transpose(source).convert("RGBA" if output else "RGB")
                image.load()
                image.info.clear()
                return image
    except PipelineError:
        raise
    except Exception:
        raise PipelineError("image_decode_failed") from None


def encode_cutout(image, mask):
    mask = np.asarray(mask)
    if mask.dtype != np.bool_ or mask.shape != (image.height, image.width) or not mask.any():
        raise PipelineError("invalid_mask")
    yy, xx = np.nonzero(mask)
    rgba = np.zeros((image.height, image.width, 4), dtype=np.uint8)
    rgba[mask, :3] = np.asarray(image)[mask]
    rgba[mask, 3] = 255
    # Transparent border permits output verification without retaining hidden RGB.
    crop = rgba[yy.min():yy.max()+1, xx.min():xx.max()+1]
    bounded = np.pad(crop, ((1, 1), (1, 1), (0, 0)))
    buffer = io.BytesIO()
    Image.fromarray(bounded).save(buffer, format="PNG", optimize=False)
    data = buffer.getvalue()
    rgba.fill(0)
    bounded.fill(0)
    if len(data) > MAX_BYTES:
        raise PipelineError("output_bytes_limit")
    return data


def verify_output(data, verifier):
    """Verifier receives freshly decoded exact encoded bytes, not generator masks."""
    if verifier is None:
        raise PipelineError("verifier_unavailable")
    image = decode_image(data, output=True)
    try:
        pixels = np.asarray(image)
        alpha = pixels[:, :, 3]
        visible = alpha == 255
        if not visible.any() or not (alpha == 0).any() or not np.isin(alpha, [0, 255]).all():
            raise PipelineError("invalid_alpha")
        if (pixels[alpha == 0, :3] != 0).any():
            raise PipelineError("hidden_pixels")
        decision = verifier.inspect(image, visible.copy())
        if not isinstance(decision, dict) or decision.get("personPresent") is not False or decision.get("facePresent") is not False or decision.get("garmentOnly") is not True:
            raise PipelineError("unsafe_output")
        return {"sha256": hashlib.sha256(data).hexdigest(), "checked": True,
                "personPresent": False, "facePresent": False, "garmentOnly": True}
    finally:
        image.close()


def process_image(data, generator, verifier, *, deadline=None, clock=time.monotonic):
    deadline = min(deadline or clock() + 20, clock() + 20)
    def check():
        if clock() >= deadline:
            raise PipelineError("deadline_exceeded")
    if generator is None or verifier is None:
        raise PipelineError("model_adapter_missing")
    check()
    image = decode_image(data)
    results = []
    try:
        # Neither original bytes nor a source hash/path is returned or logged.
        for candidate in generator.candidates(image, limit=3):
            check()
            if len(results) == 3:
                raise PipelineError("candidate_limit")
            output = encode_cutout(image, candidate["mask"])
            check()
            safety = verify_output(output, verifier)
            check()
            label = candidate.get("label")
            if not isinstance(label, str) or len(label) > 64:
                raise PipelineError("invalid_label")
            results.append({"label": label, "png": base64.b64encode(output).decode("ascii"), "safety": safety})
        check()
        return {"candidates": results, "productionApproved": False,
                "status": "review_required" if results else "no_candidates"}
    finally:
        image.close()
