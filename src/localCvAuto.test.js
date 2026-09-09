import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLocalGarments, isCvAutoRuntimeEnabled, rejectDetectedPersonOrFace } from "./localCvAuto.js";

test("CV auto flag is fail-closed and loopback-only", () => {
  assert.equal(isCvAutoRuntimeEnabled({ flag: "true", hostname: "127.0.0.1" }), true);
  assert.equal(isCvAutoRuntimeEnabled({ flag: "true", hostname: "localhost" }), true);
  assert.equal(isCvAutoRuntimeEnabled({ flag: "true", hostname: "stylist.example" }), false);
  assert.equal(isCvAutoRuntimeEnabled({ flag: "false", hostname: "localhost" }), false);
});

test("person or face presence fails closed without identity or trait processing", async () => {
  for (const safety of [{ personPresent: true, facePresent: false }, { personPresent: false, facePresent: true }]) {
    assert.throws(() => rejectDetectedPersonOrFace({ status: "review_required", safety, candidates: [{ id: "must-not-pass" }] }), /cv_person_or_face_present/);
  }
  assert.deepEqual(Object.keys(rejectDetectedPersonOrFace({ safety: { personPresent: false, facePresent: false }, candidates: [] }).safety).sort(), ["facePresent", "personPresent"]);
});

test("analysis posts only normalized local bytes to same-origin endpoint and requires review", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "localhost" } });
  const calls = [];
  const result = await analyzeLocalGarments({ blob: new Blob(["x"], { type: "image/png" }), mime: "image/png", networkAllowed: false }, {
    photoId: "p1", flag: "true", hostname: "localhost", fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ status: "review_required", confirmationRequired: true, candidates: [] }) }; },
  });
  assert.equal(calls[0].url, "/api/cv-auto");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.headers["X-Photo-Id"], "p1");
  assert.equal(result.confirmationRequired, true);
  Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
});
