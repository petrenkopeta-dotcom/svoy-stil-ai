"""Injected tensor/model contracts only; no model-quality or Torch evidence."""
from contextlib import nullcontext
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
import numpy as np
from PIL import Image
from model_adapters import IndependentOutputVerifier
from pipeline import PipelineError


class Tensor:
    def __init__(self, values): self.values = np.asarray(values)
    def __getitem__(self, key): return Tensor(self.values[key])
    def softmax(self, dim):
        exp = np.exp(self.values - self.values.max(axis=dim, keepdims=True))
        return Tensor(exp / exp.sum(axis=dim, keepdims=True))
    def sum(self, dim): return Tensor(self.values.sum(axis=dim))
    def cpu(self): return self
    def numpy(self): return self.values


class AdapterTests(unittest.TestCase):
    def verifier(self, detections=((), ()), probability=0.999):
        verifier = IndependentOutputVerifier.__new__(IndependentOutputVerifier)
        verifier.person, verifier.face = {0}, {1}
        verifier.allowed, verifier.confidence = [4], 0.995
        verifier.torch = SimpleNamespace(inference_mode=nullcontext, isfinite=np.isfinite,
            nn=SimpleNamespace(functional=SimpleNamespace(interpolate=lambda logits, **kw: logits)))
        verifier.pp = Mock(return_value={})
        verifier.pp.post_process_object_detection.side_effect = [
            [{"labels": np.asarray(labels)}] for labels in detections]
        verifier.presence = Mock(return_value=SimpleNamespace(logits=np.zeros((1, 2, 2)), pred_boxes=np.zeros((1, 2, 4))))
        verifier.sp = Mock(return_value={})
        logits = np.zeros((1, 18, 3, 3))
        logits[:, 4] = np.log(17 * probability / (1 - probability))
        verifier.semantic = Mock(return_value=SimpleNamespace(logits=Tensor(logits)))
        return verifier

    def inspect(self, verifier):
        with Image.new("RGBA", (3, 3), (0, 0, 0, 0)) as rgba:
            rgba.putpixel((1, 1), (10, 20, 30, 255))
            visible = np.zeros((3, 3), dtype=bool); visible[1, 1] = True
            return verifier.inspect(rgba, visible)

    def test_person_and_face_queries_reject_on_either_composite(self):
        for detections, expected in ((([0],), "personPresent"), (([], [1]), "facePresent")):
            verifier = self.verifier(detections)
            decision = self.inspect(verifier)
            self.assertTrue(decision[expected]); self.assertFalse(decision["garmentOnly"])
            for call in verifier.pp.call_args_list:
                self.assertEqual(call.kwargs["text"], [["a person", "a human face"]])

    def test_both_composites_and_every_visible_pixel_required(self):
        verifier = self.verifier()
        colors = []
        verifier.pp.side_effect = lambda **kw: colors.append(kw["images"].getpixel((0, 0))) or {}
        self.assertTrue(self.inspect(verifier)["garmentOnly"])
        self.assertEqual(colors, [(255, 255, 255), (0, 0, 0)])
        self.assertEqual(verifier.semantic.call_count, 2)
        self.assertFalse(self.inspect(self.verifier(probability=0.994))["garmentOnly"])
        verifier = self.verifier()
        verifier.semantic.return_value.logits.values[0, :, 1, 1] = 0
        self.assertFalse(self.inspect(verifier)["garmentOnly"])

    def test_nonfinite_presence_output_rejected_before_threshold_filtering(self):
        verifier = self.verifier()
        verifier.presence.return_value.logits[0, 0, 0] = np.nan
        with self.assertRaisesRegex(PipelineError, "invalid_detection"): self.inspect(verifier)
        verifier.pp.post_process_object_detection.assert_not_called()


if __name__ == "__main__": unittest.main()
