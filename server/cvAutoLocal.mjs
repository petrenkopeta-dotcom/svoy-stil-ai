import { spawn } from "node:child_process";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]),
  MAX_BYTES = 15 * 1024 * 1024;
const MIME_EXT = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const firstExisting = (candidates, kind = "file") =>
  candidates.find((candidate) => {
    if (!candidate || !existsSync(candidate)) return false;
    try {
      accessSync(candidate, fsConstants.R_OK);
      return kind === "directory" ? readdirSync(candidate).length > 0 : true;
    } catch {
      return false;
    }
  }) || null;

export function resolveCvRuntime({ root = process.cwd() } = {}) {
  const workspaceRuntime = path.join(root, ".cv-auto-runtime");
  return Object.freeze({
    python: firstExisting([
      path.join(workspaceRuntime, "python", "python.exe"),
    ]),
    pythonPath: firstExisting(
      [path.join(workspaceRuntime, "packages")],
      "directory",
    ),
    hfHome: firstExisting([path.join(workspaceRuntime, "hf")], "directory"),
    source: "workspace_hermetic",
  });
}

function sanitizeWorkerDetail(value, { root = process.cwd() } = {}) {
  let clean = String(value || "").replaceAll("\0", "");
  for (const privateRoot of [root, homedir(), tmpdir()].filter(Boolean))
    clean = clean.replaceAll(privateRoot, "<local>");
  clean = clean
    .replace(/[A-Za-z]:\\[^\r\n:'"]+/g, "<local-path>")
    .replace(/(?:file:\/\/|\/)[^\s:'"]+/g, "<local-path>");
  return clean.split(/\r?\n/).filter(Boolean).slice(-8).join("\n").slice(-1200);
}

function runtimePreflight(runtime) {
  if (!runtime.python) return { ok: false, code: "python_unavailable" };
  if (!runtime.pythonPath)
    return { ok: false, code: "dependencies_unavailable" };
  if (!runtime.hfHome) return { ok: false, code: "weights_unavailable" };
  const lockPath = path.join(
    path.dirname(runtime.python),
    "..",
    "runtime-lock.json",
  );
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return { ok: false, code: "runtime_lock_unavailable" };
  }
  if (
    lock.schemaVersion !== 1 ||
    lock.runtimeSource !== "workspace_hermetic" ||
    lock.versions?.torch !== "2.8.0" ||
    lock.versions?.torchvision !== "0.23.0" ||
    lock.versions?.transformers !== "4.56.1" ||
    lock.versions?.accelerate !== "1.10.1"
  )
    return { ok: false, code: "runtime_lock_mismatch" };
  for (const moduleName of ["torch", "transformers", "numpy"])
    if (!existsSync(path.join(runtime.pythonPath, moduleName)))
      return { ok: false, code: `dependency_missing_${moduleName}` };
  const hub = path.join(runtime.hfHome, "hub"),
    models = [
      [
        "detectorSnapshot",
        "models--IDEA-Research--grounding-dino-tiny",
        "a2bb814dd30d776dcf7e30523b00659f4f141c71",
        689359096,
      ],
      [
        "segmenterSnapshot",
        "models--facebook--sam2.1-hiera-tiny",
        "de431c4043854a71d8101e17995dfe596bf101a5",
        155908064,
      ],
    ],
    snapshots = {};
  for (const [key, model, revision, expectedBytes] of models) {
    const snapshot = path.join(hub, model, "snapshots", revision);
    try {
      if (!existsSync(path.join(snapshot, "config.json")))
        return { ok: false, code: "weights_manifest_missing" };
      if (
        statSync(path.join(snapshot, "model.safetensors")).size !==
        expectedBytes
      )
        return { ok: false, code: "weights_manifest_mismatch" };
      snapshots[key] = snapshot;
    } catch {
      return { ok: false, code: "weights_snapshot_unreadable" };
    }
  }
  return {
    ok: true,
    code: "runtime_manifest_ok",
    snapshots,
    identity: {
      source: "workspace_hermetic",
      lockHash: createHash("sha256")
        .update(JSON.stringify(lock))
        .digest("hex")
        .slice(0, 16),
    },
  };
}

export function cvAutoRequestAllowed(
  request,
  enabled = process.env.VITE_LOCAL_PILOT_PHOTO === "true",
) {
  const host = String(request.headers.host || "")
    .split(":")[0]
    .toLowerCase();
  return (
    enabled &&
    LOOPBACK.has(host) &&
    request.method === "POST" &&
    request.headers["x-cv-auto-local"] === "1" &&
    MIME_EXT.has(String(request.headers["content-type"] || "").split(";")[0])
  );
}
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES)
      throw Object.assign(new Error("input_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) throw Object.assign(new Error("empty_input"), { status: 400 });
  return Buffer.concat(chunks);
}

export function createCvWorkerManager({
  root = process.cwd(),
  runtime = resolveCvRuntime({ root }),
  jobTimeoutMs = 100000,
  startupTimeoutMs = 90000,
  spawnImpl = spawn,
  preflightImpl = runtimePreflight,
  capabilityPreflightImpl = async () => ({
    ok: true,
    code: "runtime_capability_deferred_to_worker",
  }),
} = {}) {
  let child = null,
    startPromise = null,
    ready = null,
    stdout = "",
    stderr = "",
    starts = 0,
    events = [],
    lastFailure = null,
    launchedPid = null,
    activeRuntime = runtime;
  const pending = new Map();
  const record = (event, detail = {}) => {
    events.push({ at: new Date().toISOString(), event, ...detail });
    if (events.length > 40) events.shift();
  };
  const stop = (reason = "worker_stopped") => {
    const current = child,
      stoppedPid = ready?.pid ?? launchedPid;
    if (!current && !ready && pending.size === 0) return;
    child = null;
    startPromise = null;
    ready = null;
    launchedPid = null;
    if (current && !current.killed && !reason.startsWith("worker_exit_"))
      current.kill();
    record("worker_stopped", { reason, pid: stoppedPid });
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(reason));
    }
    pending.clear();
  };
  const launchWorker = () =>
    new Promise((resolve, reject) => {
      const script = path.join(
        root,
        "runtime",
        "cv",
        "worker_service.py",
      );
      stderr = "";
      child = spawnImpl(activeRuntime.python, ["-u", script], {
        cwd: path.dirname(script),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONPATH: activeRuntime.pythonPath,
          HF_HOME: activeRuntime.hfHome,
          CV_AUTO_DETECTOR_SNAPSHOT: activeRuntime.detectorSnapshot,
          CV_AUTO_SEGMENTER_SNAPSHOT: activeRuntime.segmenterSnapshot,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          HF_DATASETS_OFFLINE: "1",
          NO_PROXY: "*",
          no_proxy: "*",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      launchedPid = child.pid ?? null;
      child.stderr.on("data", (chunk) => {
        stderr = sanitizeWorkerDetail(stderr + chunk, { root });
      });
      const startupTimer = setTimeout(() => {
        record("worker_start_timeout", { timeoutMs: startupTimeoutMs });
        reject(new Error("worker_start_timeout"));
        stop("worker_start_timeout");
      }, startupTimeoutMs);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        for (let newline; (newline = stdout.indexOf("\n")) >= 0;) {
          const line = stdout.slice(0, newline);
          stdout = stdout.slice(newline + 1);
          if (!line.trim()) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (message.type === "ready") {
            clearTimeout(startupTimer);
            ready = {
              ...message,
              starts,
              runtimeIdentity: activeRuntime.identity,
            };
            record("worker_ready", {
              pid: message.pid,
              modelLoadMs: message.model_load_ms,
            });
            startPromise = null;
            resolve(ready);
            continue;
          }
          if (message.type === "capability_ready") {
            record("worker_exact_import_preflight", {
              result: "runtime_capability_ok",
              versions: message.versions,
            });
            record("worker_starting", { starts });
            continue;
          }
          if (message.type === "capability_error") {
            clearTimeout(startupTimer);
            lastFailure = {
              stage: "capability_preflight",
              code: message.code,
              exitCode: null,
              stderr: sanitizeWorkerDetail(message.detail, { root }),
            };
            record("worker_start_failed", { reason: message.code });
            reject(new Error(message.code));
            continue;
          }
          const job = pending.get(message.id);
          if (!job) continue;
          pending.delete(message.id);
          clearTimeout(job.timer);
          record(message.type === "result" ? "job_completed" : "job_failed", {
            id: message.id,
            elapsedMs: Date.now() - job.startedAt,
          });
          message.type === "result"
            ? job.resolve({
                report: message.report,
                worker: { ...ready, reused: job.workerWasReady },
              })
            : job.reject(new Error(message.code || "worker_failed"));
        }
      });
      child.once("error", (error) => {
        clearTimeout(startupTimer);
        lastFailure = {
          stage: "spawn",
          code: "worker_spawn_error",
          exitCode: null,
          stderr: sanitizeWorkerDetail(error.message, { root }),
        };
        reject(new Error("worker_spawn_error"));
        stop("worker_start_failed");
      });
      child.once("exit", (code) => {
        clearTimeout(startupTimer);
        if (!ready && lastFailure?.stage !== "capability_preflight") {
          lastFailure = {
            stage: "startup",
            code: `worker_exit_${code}`,
            exitCode: code,
            stderr,
          };
          record("worker_start_failed", { reason: `worker_exit_${code}` });
          reject(new Error(`worker_exit_${code}`));
        }
        stop(`worker_exit_${code}`);
      });
    });
  const start = () => {
    if (child && ready) return Promise.resolve(ready);
    if (startPromise) return startPromise;
    if (child && lastFailure)
      return Promise.reject(new Error(lastFailure.code));
    starts += 1;
    const preflight = preflightImpl(runtime);
    record("runtime_manifest_preflight", { result: preflight.code });
    if (!preflight.ok) {
      lastFailure = {
        stage: "preflight",
        code: preflight.code,
        exitCode: null,
        stderr: "",
      };
      record("worker_start_failed", { reason: preflight.code });
      return Promise.reject(new Error(preflight.code));
    }
    activeRuntime = Object.freeze({
      ...runtime,
      ...preflight.snapshots,
      identity: preflight.identity,
    });
    lastFailure = null;
    startPromise = (async () => {
      const capability = await capabilityPreflightImpl(activeRuntime);
      record("worker_bootstrap_starting", {
        result: capability.code,
        versions: capability.versions || null,
      });
      if (!capability.ok) {
        lastFailure = {
          stage: "capability_preflight",
          code: capability.code,
          exitCode: null,
          stderr: capability.stderr || "",
        };
        record("worker_start_failed", { reason: capability.code });
        throw new Error(capability.code);
      }
      return launchWorker();
    })().catch((error) => {
      startPromise = null;
      throw error;
    });
    return startPromise;
  };
  const analyze = async ({ image, output, maxCandidates = 3, signal }) => {
    const workerWasReady = Boolean(ready);
    await start();
    if (signal?.aborted) throw new Error("cancelled");
    const id = randomUUID();
    record("job_started", {
      id,
      reused: workerWasReady,
      timeoutMs: jobTimeoutMs,
    });
    return new Promise((resolve, reject) => {
      const cancel = () => {
        pending.delete(id);
        stop("cancelled");
        reject(new Error("cancelled"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      const done = (value) => {
          signal?.removeEventListener("abort", cancel);
          resolve(value);
        },
        fail = (error) => {
          signal?.removeEventListener("abort", cancel);
          reject(error);
        };
      const timer = setTimeout(() => {
        pending.delete(id);
        record("job_timeout", { id, timeoutMs: jobTimeoutMs });
        stop("worker_timeout");
        fail(new Error("worker_timeout"));
      }, jobTimeoutMs);
      pending.set(id, {
        resolve: done,
        reject: fail,
        timer,
        workerWasReady,
        startedAt: Date.now(),
      });
      child.stdin.write(
        `${JSON.stringify({ id, image, output, max_candidates: maxCandidates })}\n`,
      );
    });
  };
  return Object.freeze({
    analyze,
    ensureReady: start,
    stop,
    status: () => ({
      running: Boolean(child),
      ready: Boolean(ready),
      starts,
      modelLoadMs: ready?.model_load_ms ?? null,
      pid: ready?.pid ?? launchedPid,
      runtimeIdentity: ready?.runtimeIdentity ?? activeRuntime.identity ?? null,
      lastFailure: lastFailure ? { ...lastFailure } : null,
      events: [...events],
    }),
  });
}

let sharedManager;
export function sharedCvWorkerManager(options = {}) {
  if (!sharedManager) sharedManager = createCvWorkerManager(options);
  return sharedManager;
}
export function resetSharedCvWorkerForTests() {
  sharedManager?.stop();
  sharedManager = null;
}

/** Disabled until an independently validated in-memory detector is wired.
 * The historical research worker writes images and is not a safe runtime. */
export async function runCvAutoLocal({ signal } = {}) {
  if (signal?.aborted) throw new Error("cancelled");
  throw Object.assign(new Error("photo_safety_unavailable"), { status: 503 });
}

export function createCvAutoMiddleware({
  root = process.cwd(),
  enabled,
  manager = sharedCvWorkerManager({ root }),
} = {}) {
  return async function (request, response, next) {
    if (request.url === "/api/cv-auto/ready") {
      if (
        !cvAutoRequestAllowed(
          {
            ...request,
            method: "POST",
            headers: {
              ...request.headers,
              "x-cv-auto-local": "1",
              "content-type": "image/png",
            },
          },
          enabled,
        )
      ) {
        response.writeHead(404).end();
        return;
      }
      try {
        await manager.ensureReady();
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(JSON.stringify(manager.status()));
      } catch (error) {
        const failure = manager.status();
        response
          .writeHead(503, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(
            JSON.stringify({
              ready: false,
              reason:
                failure.lastFailure?.code ||
                (error.message === "worker_start_timeout"
                  ? "worker_start_timeout"
                  : "worker_start_failed"),
              lifecycle: failure,
            }),
          );
      }
      return;
    }
    if (request.url === "/api/cv-auto/shutdown") {
      if (
        !cvAutoRequestAllowed(
          {
            ...request,
            method: "POST",
            headers: {
              ...request.headers,
              "x-cv-auto-local": "1",
              "content-type": "image/png",
            },
          },
          enabled,
        )
      ) {
        response.writeHead(404).end();
        return;
      }
      manager.stop("explicit_shutdown");
      response
        .writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(JSON.stringify({ stopped: true }));
      return;
    }
    if (request.url === "/api/cv-auto/status") {
      if (
        !cvAutoRequestAllowed(
          {
            ...request,
            method: "POST",
            headers: {
              ...request.headers,
              "x-cv-auto-local": "1",
              "content-type": "image/png",
            },
          },
          enabled,
        )
      ) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(JSON.stringify(manager.status()));
      return;
    }
    if (request.url !== "/api/cv-auto") return next();
    if (!cvAutoRequestAllowed(request, enabled)) {
      response.writeHead(404).end();
      return;
    }
    const abort = new AbortController();
    request.once("aborted", () => abort.abort());
    response.once("close", () => {
      if (!response.writableEnded) abort.abort();
    });
    try {
      const mime = String(request.headers["content-type"]).split(";")[0],
        result = await runCvAutoLocal({
          bytes: await body(request),
          mime,
          photoId: String(request.headers["x-photo-id"] || "local-photo"),
          root,
          signal: abort.signal,
          manager,
        });
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(result));
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const timeout = error.message === "worker_timeout";
      response.writeHead(
        error.status ||
          (error.message === "cancelled" ? 499 : timeout ? 408 : 500),
        { "Content-Type": "application/json", "Cache-Control": "no-store" },
      );
      response.end(
        JSON.stringify({
          status: "manual_fallback",
          reason: timeout
            ? "timeout"
            : error.message === "cancelled"
              ? "cancelled"
              : "worker_failed",
        }),
      );
    }
  };
}
