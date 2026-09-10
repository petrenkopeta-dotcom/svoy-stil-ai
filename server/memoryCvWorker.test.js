import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createMemoryCvWorker } from "./memoryCvWorker.mjs";

function fixture(behavior, timeoutMs = 100) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kill = (signal) => { child.killed = true; child.killSignal = signal; queueMicrotask(() => child.emit("exit", 1)); };
  let spawns = 0;
  const manager = createMemoryCvWorker({ python: "synthetic", manifest: "synthetic", modelRoot: "synthetic", timeoutMs, spawnImpl: () => { spawns++; behavior?.(child); return child; } });
  return { manager, child, count: () => spawns };
}
test("server deadline includes cold start and hard kills hung worker without restarting", async () => {
  const f = fixture(undefined, 10);
  await assert.rejects(f.manager.analyze(Buffer.from("synthetic")), /deadline/);
  assert.equal(f.child.killSignal, "SIGKILL");
  await assert.rejects(f.manager.analyze(Buffer.from("synthetic")), /faulted/);
  assert.equal(f.count(), 1);
});
test("busy, oversized and pre-aborted requests never enter model queue", async () => {
  const f = fixture();
  await assert.rejects(f.manager.analyze(Buffer.from("x"), { signal: AbortSignal.abort() }), /cancelled/);
  await assert.rejects(f.manager.analyze(Buffer.alloc(10 * 1024 * 1024 + 1)), /input_limit/);
  assert.equal(f.count(), 0);
  const first = f.manager.analyze(Buffer.from("x"));
  await assert.rejects(f.manager.analyze(Buffer.from("y")), /busy/);
  f.manager.close(); await assert.rejects(first, /closed/);
});
test("abort during inference kills worker; stderr never reaches error detail", async () => {
  const f = fixture((child) => queueMicrotask(() => { child.stderr.write("private pixels or model exception"); child.stdout.write('{"type":"ready","protocol":1}\n'); }));
  const abort = new AbortController();
  const job = f.manager.analyze(Buffer.from("synthetic"), { signal: abort.signal });
  abort.abort();
  await assert.rejects(job, { message: "cv_cancelled" });
  assert.equal(f.child.killSignal, "SIGKILL");
});
test("pipe protocol is memory-only and supports warm reuse", async () => {
  const f = fixture((child) => {
    child.stdin.on("data", (chunk) => {
      const job = JSON.parse(chunk);
      assert.equal(Buffer.from(job.image, "base64").toString(), "synthetic");
      assert.ok(job.remainingMs <= 20000);
      assert.equal("path" in job, false);
      child.stdout.write(JSON.stringify({ type: "result", id: job.id, result: { productionApproved: false, candidates: [] } }) + "\n");
    });
    queueMicrotask(() => child.stdout.write('{"type":"ready","protocol":1}\n'));
  });
  assert.equal((await f.manager.analyze(Buffer.from("synthetic"))).cold, true);
  assert.equal((await f.manager.analyze(Buffer.from("synthetic"))).cold, false);
  assert.equal(f.count(), 1); f.manager.close();
});

test("deadline kills a real hung OS process, not just an adapter promise", async () => {
  let child;
  const manager = createMemoryCvWorker({ python: "synthetic", manifest: "synthetic", modelRoot: "synthetic", timeoutMs: 150, spawnImpl: (_binary, _args, options) => {
    child = spawn(process.execPath, ["-e", "process.stdout.write('{\"type\":\"ready\",\"protocol\":1}\\n');setInterval(()=>{},1000)"], options);
    return child;
  } });
  const job = manager.analyze(Buffer.from("synthetic"));
  const exit = once(child, "exit");
  await assert.rejects(job, /deadline/);
  await exit;
  assert.equal(child.killed, true);
});
