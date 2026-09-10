"""Synthetic contract/pixel tests. These do NOT measure ML model accuracy."""
import base64
import builtins
import hashlib
import io
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image
from pipeline import process_image, verify_output, encode_cutout, decode_image, PipelineError


def fixture(format="PNG"):
    output = io.BytesIO()
    Image.new("RGB", (8, 8), (20, 40, 180)).save(output, format=format)
    return output.getvalue()


class SyntheticGenerator:
    def candidates(self, image, limit):
        mask = np.zeros((image.height, image.width), dtype=bool)
        mask[2:6, 2:6] = True
        return [{"label": "shirt", "mask": mask}]


class SyntheticVerifier:
    def __init__(self): self.calls = []
    def inspect(self, image, visible):
        self.calls.append((image.size, int(visible.sum())))
        return {"personPresent": False, "facePresent": False, "garmentOnly": True}


class PipelineTests(unittest.TestCase):
    def test_real_png_transformation_never_opens_output_files(self):
        data = fixture()
        verifier = SyntheticVerifier()
        # Image codecs are initialized before forbidding file opens.
        with patch.object(builtins, "open", side_effect=AssertionError("disk access")):
            result = process_image(data, SyntheticGenerator(), verifier)
        self.assertFalse(result["productionApproved"])
        encoded = base64.b64decode(result["candidates"][0]["png"])
        self.assertNotEqual(encoded, data)
        self.assertEqual(hashlib.sha256(encoded).hexdigest(), result["candidates"][0]["safety"]["sha256"])
        self.assertEqual(verifier.calls, [((6, 6), 16)])
        pixels = np.asarray(decode_image(encoded, output=True))
        self.assertTrue((pixels[pixels[:, :, 3] == 0, :3] == 0).all())

    def test_jpeg_and_webp_decode_in_memory(self):
        for format in ("JPEG", "WEBP"):
            self.assertEqual(decode_image(fixture(format)).size, (8, 8))

    def test_missing_failed_and_unsafe_verifiers_fail_closed(self):
        for decision in ({}, {"personPresent": True}, {"personPresent": False, "facePresent": False, "garmentOnly": False}):
            class Verifier:
                def inspect(self, image, visible): return decision
            with self.assertRaises(PipelineError): process_image(fixture(), SyntheticGenerator(), Verifier())
        with self.assertRaises(PipelineError): process_image(fixture(), SyntheticGenerator(), None)

    def test_deadline_and_malformed_image(self):
        with self.assertRaisesRegex(PipelineError, "deadline"):
            process_image(fixture(), SyntheticGenerator(), SyntheticVerifier(), deadline=1, clock=lambda: 2)
        for invalid in (b"", b"not an image", b"x" * (10 * 1024 * 1024 + 1)):
            with self.assertRaises(PipelineError): decode_image(invalid)

    def test_exact_output_hidden_rgb_and_metadata_rejected(self):
        pixels = np.zeros((4, 4, 4), dtype=np.uint8)
        pixels[1, 1] = [20, 40, 180, 255]
        pixels[0, 0] = [180, 0, 0, 0]
        output = io.BytesIO(); Image.fromarray(pixels).save(output, format="PNG")
        with self.assertRaisesRegex(PipelineError, "hidden_pixels"):
            verify_output(output.getvalue(), SyntheticVerifier())

    def test_empty_wrong_size_and_non_boolean_masks_rejected(self):
        image = Image.new("RGB", (8, 8))
        for mask in (np.zeros((8, 8), dtype=bool), np.ones((4, 4), dtype=bool), np.ones((8, 8))):
            with self.assertRaisesRegex(PipelineError, "invalid_mask"): encode_cutout(image, mask)


if __name__ == "__main__": unittest.main()
