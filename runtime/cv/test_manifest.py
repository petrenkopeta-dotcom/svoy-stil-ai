import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from model_adapters import verified_snapshot
from pipeline import PipelineError

class ManifestTests(unittest.TestCase):
    def test_snapshot_requires_all_file_hashes_and_confines_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = root / "model"; model.mkdir()
            (model / "config.json").write_text("{}")
            (model / "model.safetensors").write_bytes(b"synthetic weights")
            spec = {"directory": "model", "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in model.iterdir()}}
            self.assertEqual(verified_snapshot(spec, root), str(model.resolve()))
            (model / "model.safetensors").write_bytes(b"tampered")
            with self.assertRaisesRegex(PipelineError, "hash_mismatch"): verified_snapshot(spec, root)
            spec["directory"] = ".."
            with self.assertRaises(PipelineError): verified_snapshot(spec, root)

if __name__ == "__main__": unittest.main()
