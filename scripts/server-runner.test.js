import test from "node:test";
import assert from "node:assert/strict";
import { discoverTests, testPhases, runTests } from "./run-tests.mjs";

const perf = "src/stylistCandidateEngine.test.js";
const files = ["server/example.test.js", perf, "scripts/example.test.js"];

test("runner partitions actual discovery exactly once and reserves the full perf file", () => {
  const discovered = discoverTests();
  const phases = testPhases(discovered);
  assert.deepEqual(phases.flat().sort(), [...discovered].sort());
  assert.equal(phases[1].length, 1);
  assert.equal(phases[1][0].replaceAll("\\", "/"), perf);
  assert.ok(phases[0].every((file) => file.replaceAll("\\", "/") !== perf));
});

test("runner refuses absent or duplicated perf and duplicate ordinary files before spawn", () => {
  for (const invalid of [
    [],
    [files[0]],
    [perf],
    [...files, perf],
    [...files, perf.replaceAll("/", "\\")],
    [...files, files[0]],
  ]) {
    let calls = 0;
    assert.throws(() =>
      runTests(invalid, () => {
        calls++;
        return { status: 0 };
      }),
    );
    assert.equal(calls, 0);
  }
});

test("runner completes ordinary phase before isolated perf with unchanged file membership", () => {
  const calls = [];
  const status = runTests(files, (binary, args, options) => {
    calls.push({ binary, args, options });
    return { status: 0 };
  });
  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, [
    "--test",
    "--test-concurrency=2",
    files[0],
    files[2],
  ]);
  assert.deepEqual(calls[1].args, ["--test", "--test-concurrency=1", perf]);
  assert.ok(
    calls.every(
      (call) =>
        call.binary === process.execPath && call.options.stdio === "inherit",
    ),
  );
});

test("runner keeps either phase failure, signal, spawn error or exception nonzero", () => {
  for (const failure of [
    { status: 1 },
    { status: null, signal: "SIGTERM" },
    { status: 0, error: new Error("synthetic") },
    "throw",
  ]) {
    for (const failingPhase of [0, 1]) {
      let calls = 0;
      const status = runTests(files, () => {
        const index = calls++;
        if (index !== failingPhase) return { status: 0 };
        if (failure === "throw") throw new Error("synthetic");
        return failure;
      });
      assert.equal(status, 1);
      assert.equal(calls, 2);
    }
  }
});
