import test from "node:test";
import assert from "node:assert/strict";
import { cvAutoRequestAllowed } from "./cvAutoLocal.mjs";
import { createCvWorkerManager } from "./cvAutoLocal.mjs";
import { resolveCvRuntime } from "./cvAutoLocal.mjs";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

const request = (overrides = {}) => ({
  method: "POST",
  headers: {
    host: "127.0.0.1:4173",
    "x-cv-auto-local": "1",
    "content-type": "image/jpeg",
    ...overrides,
  },
});
test("local endpoint rejects non-loopback, disabled flags, wrong methods and non-images", () => {
  assert.equal(cvAutoRequestAllowed(request(), true), true);
  assert.equal(cvAutoRequestAllowed(request(), false), false);
  assert.equal(
    cvAutoRequestAllowed(request({ host: "stylist.example" }), true),
    false,
  );
  assert.equal(
    cvAutoRequestAllowed({ ...request(), method: "GET" }, true),
    false,
  );
  assert.equal(
    cvAutoRequestAllowed(request({ "content-type": "application/json" }), true),
    false,
  );
});

test("worker startup is single-flight and the ready process is reused", async () => {
  let starts = 0;
  const stdout = new PassThrough(),
    stderr = new PassThrough();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      const job = JSON.parse(String(chunk));
      queueMicrotask(() =>
        stdout.write(
          `${JSON.stringify({ type: "result", id: job.id, report: { candidates: [] } })}\n`,
        ),
      );
      done();
    },
  });
  const manager = createCvWorkerManager({
    preflightImpl: () => ({ ok: true, code: "preflight_ok" }),
    capabilityPreflightImpl: async () => ({
      ok: true,
      code: "runtime_capability_ok",
    }),
    spawnImpl: () => {
      starts += 1;
      queueMicrotask(() =>
        stdout.write(
          `${JSON.stringify({ type: "ready", model_load_ms: 12, pid: 7 })}\n`,
        ),
      );
      return child;
    },
  });
  const [first, second] = await Promise.all([
    manager.analyze({ image: "a", output: "o" }),
    manager.analyze({ image: "b", output: "p" }),
  ]);
  assert.equal(starts, 1);
  assert.equal(manager.status().starts, 1);
  assert.equal(first.worker.reused, false);
  assert.equal(second.worker.reused, false);
  const third = await manager.analyze({ image: "c", output: "q" });
  assert.equal(third.worker.reused, true);
  manager.stop();
});

test("a timed out job terminates the worker instead of hanging", async () => {
  const stdout = new PassThrough(),
    stderr = new PassThrough();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const manager = createCvWorkerManager({
    jobTimeoutMs: 5,
    preflightImpl: () => ({ ok: true, code: "preflight_ok" }),
    capabilityPreflightImpl: async () => ({
      ok: true,
      code: "runtime_capability_ok",
    }),
    spawnImpl: () => {
      queueMicrotask(() =>
        stdout.write(
          `${JSON.stringify({ type: "ready", model_load_ms: 1, pid: 8 })}\n`,
        ),
      );
      return child;
    },
  });
  await assert.rejects(
    manager.analyze({ image: "a", output: "o" }),
    /worker_timeout/,
  );
  assert.equal(child.killed, true);
  assert.equal(manager.status().running, false);
});

test("startup failure evidence is sanitized and preserves the exit reason", async () => {
  const stdout = new PassThrough(),
    stderr = new PassThrough();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = new PassThrough();
  child.killed = false;
  child.pid = 91;
  child.kill = () => {
    child.killed = true;
  };
  const manager = createCvWorkerManager({
    root: "C:\\private\\workspace",
    runtime: { python: "python.exe", pythonPath: "packages", hfHome: "models" },
    preflightImpl: () => ({ ok: true, code: "preflight_ok" }),
    capabilityPreflightImpl: async () => ({
      ok: true,
      code: "runtime_capability_ok",
    }),
    spawnImpl: () => {
      queueMicrotask(() => {
        stderr.write("Traceback C:\\private\\workspace\\worker.py missing\n");
        child.emit("exit", 1);
      });
      return child;
    },
  });
  await assert.rejects(manager.ensureReady(), /worker_exit_1/);
  const status = manager.status();
  assert.equal(status.lastFailure.code, "worker_exit_1");
  assert.equal(status.lastFailure.exitCode, 1);
  assert.doesNotMatch(status.lastFailure.stderr, /private|workspace/);
  assert.equal(
    status.events.some((event) => event.event === "worker_start_failed"),
    true,
  );
});

test("preflight fails closed without spawning or silently retrying", async () => {
  let spawns = 0;
  const manager = createCvWorkerManager({
    preflightImpl: () => ({ ok: false, code: "weights_snapshot_missing" }),
    spawnImpl: () => {
      spawns += 1;
    },
  });
  await assert.rejects(manager.ensureReady(), /weights_snapshot_missing/);
  assert.equal(spawns, 0);
  assert.equal(manager.status().starts, 1);
  assert.equal(manager.status().lastFailure.code, "weights_snapshot_missing");
});

test("an incompatible transformers API fails capability preflight before worker spawn", async () => {
  let workerSpawns = 0;
  const manager = createCvWorkerManager({
    preflightImpl: () => ({ ok: true, code: "preflight_ok" }),
    capabilityPreflightImpl: async () => ({
      ok: false,
      code: "runtime_capability_missing",
      stderr: "ImportError: required CV classes unavailable",
    }),
    spawnImpl: () => {
      workerSpawns += 1;
    },
  });
  await assert.rejects(manager.ensureReady(), /runtime_capability_missing/);
  assert.equal(workerSpawns, 0);
  assert.equal(manager.status().lastFailure.stage, "capability_preflight");
  assert.equal(manager.status().lastFailure.code, "runtime_capability_missing");
});

test("worker bootstrap reports exact-import failure with a stable reason", async () => {
  const stdout = new PassThrough(),
    stderr = new PassThrough();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  const manager = createCvWorkerManager({
    preflightImpl: () => ({ ok: true, code: "preflight_ok" }),
    capabilityPreflightImpl: async () => ({
      ok: true,
      code: "runtime_capability_deferred_to_worker",
    }),
    spawnImpl: () => {
      queueMicrotask(() => {
        stdout.write(
          `${JSON.stringify({ type: "capability_error", code: "runtime_capability_missing", detail: "ImportError: required CV API unavailable" })}\n`,
          () => child.emit("exit", 21),
        );
      });
      return child;
    },
  });
  await assert.rejects(manager.ensureReady(), /runtime_capability_missing/);
  assert.equal(manager.status().lastFailure.code, "runtime_capability_missing");
  assert.equal(manager.status().lastFailure.stage, "capability_preflight");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.status().running, false);
  assert.equal(
    manager.status().events.filter((event) => event.event === "worker_stopped")
      .length,
    1,
  );
});

test("runtime resolution is workspace-only and ignores external overrides", () => {
  const runtime = resolveCvRuntime({
    root: "Z:\\definitely-missing-workspace",
    env: {
      CV_AUTO_PYTHON: "C:\\external\\python.exe",
      CV_AUTO_PYTHONPATH: "C:\\external\\packages",
      CV_AUTO_HF_HOME: "C:\\external\\hf",
    },
  });
  assert.equal(runtime.python, null);
  assert.equal(runtime.pythonPath, null);
  assert.equal(runtime.hfHome, null);
  assert.equal(runtime.source, "workspace_hermetic");
});
