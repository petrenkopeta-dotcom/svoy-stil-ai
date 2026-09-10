import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const MAX_INPUT = 10 * 1024 * 1024;
const MAX_OUTPUT = 44 * 1024 * 1024;

export function createMemoryCvWorker({ python, manifest, modelRoot, spawnImpl = spawn, timeoutMs = 20_000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_deadline");
  let child, ready = false, pending, faulted = false;
  let output = Buffer.alloc(0);
  const reject = (code, kill = true) => {
    faulted = true;
    const job = pending;
    pending = undefined;
    output = Buffer.alloc(0);
    if (job) { clearTimeout(job.timer); job.signal?.removeEventListener("abort", job.cancel); job.reject(new Error(code)); }
    if (kill && child && !child.killed) child.kill("SIGKILL");
  };
  const send = () => {
    if (!ready || !pending || pending.sent) return;
    const left = pending.deadline - performance.now();
    if (left <= 0) return reject("cv_deadline_exceeded");
    pending.sent = true;
    const message = JSON.stringify({ id: pending.id, image: pending.bytes.toString("base64"), operation: pending.operation, remainingMs: Math.min(left, 20_000) });
    pending.bytes = undefined;
    child.stdin.write(`${message}\n`, (error) => { if (error) reject("cv_protocol_failed"); });
  };
  const receive = (message) => {
    if (message.type === "ready" && message.protocol === 1 && !ready) { ready = true; send(); return; }
    if (message.type === "error") return reject("cv_processing_rejected");
    if (!pending || message.type !== "result" || message.id !== pending.id || performance.now() >= pending.deadline) return reject("cv_protocol_failed");
    try {
      const result = message.result;
      if (result?.productionApproved !== false || !Array.isArray(result.candidates) || result.candidates.length > 3) throw new Error();
      for (const candidate of result.candidates) {
        if (typeof candidate.png !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(candidate.png)) throw new Error();
        const bytes = Buffer.from(candidate.png, "base64");
        const safety = candidate.safety;
        if (bytes.length > MAX_INPUT || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || safety?.checked !== true || safety.personPresent !== false || safety.facePresent !== false || safety.garmentOnly !== true || createHash("sha256").update(bytes).digest("hex") !== safety.sha256) throw new Error();
      }
      const job = pending;
      pending = undefined;
      clearTimeout(job.timer);
      job.signal?.removeEventListener("abort", job.cancel);
      job.resolve({ ...result, elapsedMs: performance.now() - job.started, cold: job.cold });
    } catch { reject("cv_output_unverified"); }
  };
  const launch = () => {
    child = spawnImpl(python, ["-B", "-u", fileURLToPath(new URL("../runtime/cv/worker_service.py", import.meta.url))], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      // No inherited tokens, proxies or endpoint overrides in the model process.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CV_MODEL_MANIFEST: manifest, CV_MODEL_ROOT: modelRoot, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", PYTHONDONTWRITEBYTECODE: "1" },
    });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => reject("cv_protocol_failed"));
    child.stdout.on("data", (chunk) => {
      if (faulted) return;
      if (output.length + chunk.length > MAX_OUTPUT) return reject("cv_output_limit");
      output = Buffer.concat([output, chunk]);
      let index;
      while ((index = output.indexOf(10)) >= 0) {
        const line = output.subarray(0, index); output = output.subarray(index + 1);
        try { receive(JSON.parse(line.toString("utf8"))); } catch { reject("cv_protocol_failed"); }
        if (faulted) return;
      }
    });
    child.once("error", () => reject("cv_spawn_failed"));
    child.once("exit", () => { reject("cv_worker_exited", false); child = undefined; ready = false; });
  };
  return Object.freeze({
    analyze(bytes, { signal, operation = "analyze" } = {}) {
      if (!["analyze", "verify"].includes(operation)) return Promise.reject(new Error("cv_operation_invalid"));
      if (signal?.aborted) return Promise.reject(new Error("cv_cancelled"));
      if (faulted) return Promise.reject(new Error("cv_worker_faulted"));
      if (pending) return Promise.reject(new Error("cv_busy"));
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_INPUT) return Promise.reject(new Error("cv_input_limit"));
      if (!python || !manifest || !modelRoot) return Promise.reject(new Error("cv_runtime_unconfigured"));
      return new Promise((resolve, fail) => {
        const started = performance.now();
        const cancel = () => reject("cv_cancelled");
        pending = { id: randomUUID(), bytes, operation, signal, cancel, resolve, reject: fail, started, deadline: started + Math.min(timeoutMs, 20_000), cold: !ready };
        pending.timer = setTimeout(() => reject("cv_deadline_exceeded"), Math.min(timeoutMs, 20_000));
        signal?.addEventListener("abort", cancel, { once: true });
        try { if (!child) launch(); send(); } catch { reject("cv_spawn_failed"); }
      });
    },
    close() { reject("cv_closed"); },
  });
}
