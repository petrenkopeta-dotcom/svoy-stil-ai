import test from "node:test";
import assert from "node:assert/strict";
import { runCvAutoLocal } from "./cvAutoLocal.mjs";
import { createPhotoStorage, MemoryPhotoBackend, PHOTO_POLICY_VERSION } from "../src/photoStorage.js";
import { rejectDetectedPersonOrFace, analyzeLocalGarments } from "../src/localCvAuto.js";

test("disabled legacy processor never invokes a disk based worker", async () => {
  await assert.rejects(runCvAutoLocal({ bytes: Buffer.from("synthetic"), manager: { analyze() { assert.fail("worker must not run"); } } }), /photo_safety_unavailable/);
});

test("missing, incomplete and failed safety never becomes success", () => {
  for (const safety of [undefined, {}, { checked: false }, { checked: true, personPresent: false }, { personPresent: false, facePresent: false }]) {
    assert.throws(() => rejectDetectedPersonOrFace({ safety }), /cv_safety_unavailable/);
  }
});

test("all storage entry points require an actual validator, not metadata", async () => {
  for (const validateCutout of [undefined, async () => false, async () => { throw new Error("detector failed"); }]) {
    const backend = new MemoryPhotoBackend();
    const storage = createPhotoStorage({ backend, validateCutout });
    await assert.rejects(storage.save(new Blob(["synthetic"], { type: "image/png" }), { granted: true, policyVersion: PHOTO_POLICY_VERSION }, { safety: { checked: true } }), /проверка/);
    assert.equal(backend.records.size, 0);
  }
});

test("pre-cancelled request never sends image bytes", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(analyzeLocalGarments({ blob: new Blob(["x"]), networkAllowed: false }, { flag: "true", hostname: "localhost", signal, fetchImpl() { assert.fail("no request"); } }), /cv_auto_cancelled/);
});

test("deadline is a timeout, never successful detection or user cancellation", async () => {
  await assert.rejects(analyzeLocalGarments({ blob: new Blob(["x"]), networkAllowed: false }, { flag: "true", hostname: "localhost", timeoutMs: 5, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")))) }), /cv_auto_timeout/);
});
