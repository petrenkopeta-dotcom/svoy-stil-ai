import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from model_adapters import verified_snapshot, load_model
from model_manifest import validate_manifest, semantic_ids, ATR_LABELS, VERSIONS, ROLES
from unittest.mock import Mock
from pipeline import PipelineError

class ManifestTests(unittest.TestCase):
    def manifest(self):
        # Deliberately synthetic hashes; never used as checkpoint evidence.
        return {"schema_version": 2, "versions": dict(VERSIONS), "garment_labels": ["shirt", "shoe"],
                "models": {role: {"repository": "test/synthetic", "revision": "1" * 40,
                    "directory": role, "sha256": {"config.json": "2" * 64, "model.safetensors": "3" * 64}}
                    for role in ROLES}}

    def test_old_incomplete_and_unpinned_manifests_rejected(self):
        self.assertEqual(validate_manifest(self.manifest())["schema_version"], 2)
        for field, value in (("schema_version", 1), ("schema_version", True), ("versions", {}),
                             ("garment_labels", ["face"]), ("garment_labels", ["shirt", "shirt"]), ("models", {})):
            manifest = self.manifest(); manifest[field] = value
            with self.assertRaises(PipelineError): validate_manifest(manifest)
        for field, value in (("revision", "main"), ("sha256", {}), ("sha256", {"config.json": None}),
                             ("directory", "../outside"), ("directory", "C:/outside"),
                             ("directory", "/absolute"), ("directory", "a\\b")):
            manifest = self.manifest(); manifest["models"][ROLES[0]][field] = value
            with self.assertRaises(PipelineError): validate_manifest(manifest)
        manifest = self.manifest(); del manifest["schema_version"]
        with self.assertRaises(PipelineError): validate_manifest(manifest)

    def test_atr_mapping_never_includes_skin_hair_or_background(self):
        labels = {str(i): name.title() for i, name in enumerate(ATR_LABELS)}
        self.assertEqual(semantic_ids(labels, ["shirt", "shoe"]), [4, 9, 10])
        self.assertEqual(semantic_ids(labels, ["pants", "jeans"]), [6])
        labels["4"] = "Face"
        with self.assertRaisesRegex(PipelineError, "garment_classes_missing"):
            semantic_ids(labels, ["shirt"])
        with self.assertRaises(PipelineError): semantic_ids({0: "person"}, ["shirt"])

    def test_incomplete_parameter_load_is_fatal(self):
        for key in ("missing_keys", "unexpected_keys", "mismatched_keys", "error_msgs"):
            loader = Mock(); model = Mock()
            loader.from_pretrained.return_value = (model, {key: ["synthetic"]})
            with self.assertRaisesRegex(PipelineError, "model_parameters_incomplete"):
                load_model(loader, "synthetic-local")
            model.eval.assert_not_called()
        loader.from_pretrained.return_value = (model, {})
        load_model(loader, "synthetic-local")
        loader.from_pretrained.assert_called_with("synthetic-local", local_files_only=True,
            trust_remote_code=False, use_safetensors=True, output_loading_info=True)

    def test_pickle_and_invalid_hash_rejected_even_when_listed(self):
        with tempfile.TemporaryDirectory() as temporary:
            model = Path(temporary) / "model"; model.mkdir()
            for name in ("config.json", "model.safetensors", "pytorch_model.bin"):
                (model / name).write_bytes(b"synthetic")
            spec = {"directory": "model", "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in model.iterdir()}}
            with self.assertRaisesRegex(PipelineError, "manifest_invalid"): verified_snapshot(spec, temporary)
            spec["sha256"]["config.json"] = None
            with self.assertRaises(PipelineError): verified_snapshot(spec, temporary)

    def test_snapshot_requires_all_file_hashes_and_confines_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = root / "model"; model.mkdir()
            (model / "config.json").write_text("{}")
            (model / "model.safetensors").write_bytes(b"synthetic weights")
            spec = {"directory": "model", "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in model.iterdir()}}
            self.assertEqual(verified_snapshot(spec, root), str(model.resolve()))
            incomplete = {"directory": "model", "sha256": {"config.json": spec["sha256"]["config.json"]}}
            with self.assertRaisesRegex(PipelineError, "manifest_incomplete"): verified_snapshot(incomplete, root)
            (model / "extra.json").write_text("{}")
            with self.assertRaisesRegex(PipelineError, "manifest_incomplete"): verified_snapshot(spec, root)
            # Only synthetic temporary files created by this test are removed.
            (model / "extra.json").unlink()
            (model / "model.safetensors").write_bytes(b"tampered")
            with self.assertRaisesRegex(PipelineError, "hash_mismatch"): verified_snapshot(spec, root)
            spec["directory"] = ".."
            with self.assertRaises(PipelineError): verified_snapshot(spec, root)

if __name__ == "__main__": unittest.main()
