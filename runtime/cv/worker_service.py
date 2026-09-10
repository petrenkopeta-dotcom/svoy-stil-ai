"""Bounded JSONL worker: bytes via pipes; never image paths or image files."""
import base64
import contextlib
import io
import json
import os
import sys
import time

# No library logging, telemetry, downloads or bytecode writes.
os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", TOKENIZERS_PARALLELISM="false")
sys.dont_write_bytecode = True
protocol = sys.stdout
class Discard(io.TextIOBase):
    def write(self, value): return len(value)
    def flush(self): pass
sys.stderr = Discard()

def emit(value):
    protocol.write(json.dumps(value, separators=(",", ":")) + "\n")
    protocol.flush()

try:
    with contextlib.redirect_stdout(Discard()):
        from model_adapters import load_adapters
        from pipeline import process_image, verify_output, PipelineError
        generator, verifier = load_adapters(os.environ["CV_MODEL_MANIFEST"], os.environ["CV_MODEL_ROOT"])
    emit({"type": "ready", "protocol": 1})
except Exception:
    emit({"type": "error", "code": "model_runtime_unavailable"})
    raise SystemExit(21)

while True:
    line = sys.stdin.buffer.readline(14 * 1024 * 1024 + 1)
    if not line: break
    if len(line) > 14 * 1024 * 1024 or not line.endswith(b"\n"):
        emit({"type": "error", "code": "protocol_limit"})
        raise SystemExit(22)
    job = None
    try:
        job = json.loads(line)
        if set(job) != {"id", "image", "remainingMs", "operation"} or job["operation"] not in ("analyze", "verify") or not isinstance(job["remainingMs"], (int, float)) or not 0 < job["remainingMs"] <= 20000:
            raise PipelineError("protocol_invalid")
        data = base64.b64decode(job.pop("image"), validate=True)
        line = None
        with contextlib.redirect_stdout(Discard()):
            if job["operation"] == "analyze":
                result = process_image(data, generator, verifier, deadline=time.monotonic() + job["remainingMs"] / 1000)
            else:
                result = {"productionApproved": False, "candidates": [{"label": "verified", "png": base64.b64encode(data).decode("ascii"), "safety": verify_output(data, verifier)}]}
        emit({"type": "result", "id": job["id"], "result": result})
    except Exception:
        # Exception strings/tracebacks may contain input; never serialize them.
        emit({"type": "error", "id": job.get("id") if isinstance(job, dict) else None, "code": "image_processing_rejected"})
    finally:
        data = None
        job = None
        line = None
        result = None
