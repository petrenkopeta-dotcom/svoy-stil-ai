import test from "node:test";
import assert from "node:assert/strict";
import {
  PHOTO_GATE_OUTCOME,
  assertImageNetworkAllowed,
  decidePhotoGate,
} from "./photoGate.js";

const safe = {
  personPresent: false,
  personConfidence: "high",
  sceneSupported: true,
  sceneConfidence: "high",
  garmentUsable: true,
  garmentConfidence: "high",
};

test("a supported garment is accepted", () => {
  assert.deepEqual(decidePhotoGate(safe), {
    outcome: PHOTO_GATE_OUTCOME.ACCEPT,
    reason: "supported_garment",
    upload_allowed: true,
    background_removal_allowed: true,
    preserve_original: false,
  });
});

test("admissible uncertainty preserves the original and skips background removal", () => {
  const result = decidePhotoGate({ ...safe, garmentConfidence: "medium" });
  assert.equal(result.outcome, PHOTO_GATE_OUTCOME.SAVE_AND_REVIEW);
  assert.equal(result.upload_allowed, true);
  assert.equal(result.background_removal_allowed, false);
  assert.equal(result.preserve_original, true);
});

test("a person is blocked even in an otherwise supported scene", () => {
  const result = decidePhotoGate({ ...safe, personPresent: true });
  assert.equal(result.outcome, PHOTO_GATE_OUTCOME.RETAKE);
  assert.equal(result.upload_allowed, false);
});

test("unknown person state fails closed", () => {
  const result = decidePhotoGate({ ...safe, personPresent: undefined });
  assert.equal(result.outcome, PHOTO_GATE_OUTCOME.RETAKE);
  assert.equal(result.upload_allowed, false);
});

test("low-confidence no-person result fails closed", () => {
  const result = decidePhotoGate({ ...safe, personConfidence: "medium" });
  assert.equal(result.outcome, PHOTO_GATE_OUTCOME.RETAKE);
});

test("unsupported and unknown scenes fail closed", () => {
  for (const sceneSupported of [false, undefined]) {
    const result = decidePhotoGate({ ...safe, sceneSupported });
    assert.equal(result.outcome, PHOTO_GATE_OUTCOME.RETAKE);
    assert.equal(result.upload_allowed, false);
  }
});

test("network guard blocks until upload_allowed is exactly true", () => {
  for (const value of [undefined, null, {}, { upload_allowed: false }]) {
    assert.throws(() => assertImageNetworkAllowed(value), /PHOTO_UPLOAD_BLOCKED/);
  }
  assert.doesNotThrow(() => assertImageNetworkAllowed({ upload_allowed: true }));
});
