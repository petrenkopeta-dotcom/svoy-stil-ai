import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoIntakeController, detectImageFormat, MAX_SANITIZED_EDGE, PHOTO_INTAKE_STATUS, validateLocalImage } from "./photoIntake.js";
import { readFile } from "node:fs/promises";

test("manual scene UI maps the explicit no-person answer to person absent", async () => {
  const source = await readFile(new URL("./PhotoIntake.jsx", import.meta.url), "utf8");
  assert.match(source, /data\.get\("person"\) === "no" \? false : true/);
});

const bytes = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
};

function file(data, type = "image/jpeg") {
  return { size: data.length, type, arrayBuffer: async () => data.buffer };
}
const decode = async () => ({ width: 1000, height: 1200 });

test("recognizes JPEG, PNG and WebP by signature", () => {
  assert.equal(detectImageFormat(bytes.jpeg).mime, "image/jpeg");
  assert.equal(detectImageFormat(bytes.png).mime, "image/png");
  assert.equal(detectImageFormat(bytes.webp).mime, "image/webp");
  assert.equal(detectImageFormat(new Uint8Array([1, 2, 3])), null);
});

test("sanitized working copy has a bounded long edge", () => {
  assert.equal(MAX_SANITIZED_EDGE, 640);
});

test("PNG validation reads only the header and avoids a redundant decode", async () => {
  const data = new Uint8Array(32);
  data.set(bytes.png);
  new DataView(data.buffer).setUint32(16, 800);
  new DataView(data.buffer).setUint32(20, 1200);
  let slicedTo = null;
  let decoded = false;
  const png = {
    size: 5_000_000,
    type: "image/png",
    arrayBuffer: async () => { throw new Error("full file must not be read"); },
    slice: (_from, to) => ({ arrayBuffer: async () => { slicedTo = to; return data.buffer; } }),
  };
  const result = await validateLocalImage(png, undefined, async () => { decoded = true; return { width: 1, height: 1 }; });
  assert.equal(result.ok, true);
  assert.equal(result.width, 800);
  assert.equal(result.height, 1200);
  assert.equal(slicedTo, 32);
  assert.equal(decoded, false);
});

test("rejects MIME spoofing and unsafe dimensions", async () => {
  assert.equal((await validateLocalImage(file(bytes.png, "image/jpeg"), undefined, decode)).reason, "mime_mismatch");
  const tiny = await validateLocalImage(file(bytes.jpeg), undefined, async () => ({ width: 200, height: 200 }));
  assert.equal(tiny.reason, "resolution_too_small");
});

test("manual declaration still passes quality evaluation and preserves original", async () => {
  const original = file(bytes.jpeg);
  const sanitized = { type: "image/jpeg", sanitized: true };
  const controller = createPhotoIntakeController({ sanitize: async () => sanitized, qualityAnalyzer: async () => ({ sharpness: 20, meanLuma: 120, contrast: 50, noise: 2, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "known", edgeMarginShare: .1 }) });
  await controller.select(original, { decode });
  assert.equal(controller.getState().upload_allowed, false);
  assert.throws(() => controller.getUploadPayload(), /PHOTO_UPLOAD_BLOCKED/);
  const declared = controller.declareGarmentOnly(true);
  assert.equal(declared.status, PHOTO_INTAKE_STATUS.REVIEW);
  assert.equal(declared.local_ready, true);
  assert.equal(declared.upload_allowed, false);
  assert.equal(declared.sceneDeclaration.person, false);
  assert.equal(declared.quality.status, "pass");
  assert.throws(() => controller.getUploadPayload(), /PHOTO_UPLOAD_BLOCKED/);
  const payload = controller.getLocalReviewPayload();
  assert.equal(payload.blob, sanitized);
  assert.equal(payload.original, original);
  assert.equal(payload.preserve_original, true);
  assert.equal(payload.background_removal_allowed, false);
  assert.equal(payload.status, PHOTO_INTAKE_STATUS.REVIEW);
  assert.equal(payload.storage_scope, "local_device");
  assert.equal(payload.network_allowed, false);
  assert.equal(payload.user_review_required, true);
});

test("local review payload stays unavailable before explicit confirmation", async () => {
  const controller = createPhotoIntakeController({ sanitize: async () => ({}) });
  await controller.select(file(bytes.jpeg), { decode });
  assert.throws(() => controller.getLocalReviewPayload(), /PHOTO_LOCAL_REVIEW_NOT_READY/);
  controller.declareGarmentOnly(false);
  assert.throws(() => controller.getLocalReviewPayload(), /PHOTO_LOCAL_REVIEW_NOT_READY/);
});

test("person, unknown and unsupported detector results fail closed", async () => {
  for (const signals of [
    { person: "present", subject: "garment" },
    { person: "unknown", subject: "garment" },
    { person: "absent", subject: "unknown" },
    { person: "absent", subject: "unsupported" },
  ]) {
    const controller = createPhotoIntakeController({ sanitize: async () => ({}), trustedDetector: async () => signals });
    const result = await controller.select(file(bytes.jpeg), { decode });
    assert.equal(result.status, PHOTO_INTAKE_STATUS.RETAKE);
    assert.equal(result.upload_allowed, false);
  }
});

test("trusted local detector cannot skip scene declaration or quality gate", async () => {
  const controller = createPhotoIntakeController({
    sanitize: async () => ({}),
    trustedDetector: async () => ({ person: "absent", subject: "garment" }), qualityAnalyzer: async () => ({ sharpness: 20, meanLuma: 120, contrast: 50, noise: 2, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "known", edgeMarginShare: .1 }),
  });
  const result = await controller.select(file(bytes.jpeg), { decode });
  assert.equal(result.status, null);
  assert.equal(result.upload_allowed, false);
  assert.throws(() => controller.getUploadPayload(), /PHOTO_UPLOAD_BLOCKED/);
  assert.equal(controller.grantProcessingConsent({ granted: true }).upload_allowed, false);
  assert.equal(controller.declareGarmentOnly(true).status, PHOTO_INTAKE_STATUS.REVIEW);
});

test("HEIC has an honest unsupported result when browser decoding is unavailable", async () => {
  const heic = { size: 12, type: "image/heic", arrayBuffer: async () => new Uint8Array(12).buffer };
  assert.equal((await validateLocalImage(heic, undefined, decode)).reason, "heic_not_supported_in_this_browser");
});

test("scene declaration applies local quality gate before recognition", async () => {
  const controller = createPhotoIntakeController({ sanitize: async () => ({}), qualityAnalyzer: async () => ({ sharpness: 1, meanLuma: 120, contrast: 50, noise: 2, shadowShare: 0, highlightShare: 0, edgeMarginShare: .1 }) });
  await controller.select(file(bytes.jpeg), { decode });
  const result = controller.declareScene({ person: false, itemCount: 1, background: "plain", backgroundContrast: "high" });
  assert.equal(result.status, PHOTO_INTAKE_STATUS.RETAKE); assert.equal(result.reason, "blur"); assert.equal(result.upload_allowed, false);
});

test("shortcut cannot bypass critical quality failure and decision is idempotent", async () => {
  const controller = createPhotoIntakeController({ sanitize: async () => ({}), qualityAnalyzer: async () => ({ sharpness: 1, meanLuma: 120, contrast: 50, noise: 2, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "known", edgeMarginShare: .1 }) });
  await controller.select(file(bytes.jpeg), { decode });
  const first = controller.declareGarmentOnly(true); const second = controller.declareGarmentOnly(true);
  assert.equal(first.status, PHOTO_INTAKE_STATUS.RETAKE); assert.equal(first.reason, "blur");
  assert.deepEqual(second, first); assert.throws(() => controller.getLocalReviewPayload(), /NOT_READY/);
});

test("stale async selection cannot overwrite a newer photo", async () => {
  let release, entered; const slow = new Promise((resolve) => { release = resolve; }); const firstEntered = new Promise((resolve) => { entered = resolve; }); let analyses = 0;
  const controller = createPhotoIntakeController({ sanitize: async () => ({}), qualityAnalyzer: async () => { analyses++; if (analyses === 1) { entered(); return slow; } return ({ sharpness: 20, meanLuma: 120, contrast: 50, noise: 2, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "known", edgeMarginShare: .1 }); } });
  const older = controller.select(file(bytes.jpeg), { decode }); await firstEntered; const newer = controller.select(file(bytes.jpeg), { decode });
  await newer; release({ sharpness: 1 }); await older;
  assert.equal(controller.getState().selectionVersion, 2); assert.equal(controller.getState().metrics.sharpness, 20);
});
