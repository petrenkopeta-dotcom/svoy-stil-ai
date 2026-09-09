import test from "node:test";
import assert from "node:assert/strict";
import { estimateEdgeOccupancy, evaluatePhotoQuality, metricsFromRgba } from "./photoQuality.js";

const good = { sharpness: 20, meanLuma: 128, contrast: 60, noise: 8, shadowShare: .01, highlightShare: .01, edgeMetricStatus: "known", edgeMarginShare: .08 };
const scene = { person: false, itemCount: 1, background: "plain", backgroundContrast: "high", delicateDetails: false };

test("quality gate passes only a declared single garment without person", () => {
  assert.equal(evaluatePhotoQuality(good, scene).status, "pass");
  assert.equal(evaluatePhotoQuality(good, { ...scene, person: true }).status, "retake");
  assert.equal(evaluatePhotoQuality(good, { ...scene, itemCount: 2 }).issues[0].code, "multiple_items");
});

test("crop metric measures border contact and reports unknown without evidence", () => {
  const image = (touches) => {
    const width = 40, height = 40, rgba = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 8; y < 32; y++) for (let x = touches ? 0 : 8; x < 32; x++) { const i = (y * width + x) * 4; rgba[i] = 30; rgba[i + 1] = 70; rgba[i + 2] = 120; rgba[i + 3] = 255; }
    return estimateEdgeOccupancy(rgba, width, height);
  };
  assert.equal(image(false).edgeMetricStatus, "known"); assert.ok(image(false).edgeMarginShare > .1);
  assert.equal(image(true).edgeMarginShare, 0);
  assert.equal(estimateEdgeOccupancy(new Uint8ClampedArray(4 * 4 * 4), 4, 4).edgeMetricStatus, "unknown");
  assert.deepEqual(evaluatePhotoQuality({ ...good, edgeMetricStatus: "unknown", edgeMarginShare: null }, scene).limitations, ["crop_signal_unknown"]);
});

test("quality gate gives concrete retake guidance and flags difficult details", () => {
  const result = evaluatePhotoQuality({ ...good, sharpness: 1, meanLuma: 20 }, { ...scene, backgroundContrast: "low", delicateDetails: true });
  assert.equal(result.status, "retake");
  assert.ok(result.issues.every((issue) => issue.guide.length > 20));
  assert.match(result.issues.map((x) => x.code).join(" "), /blur|too_dark/);
  assert.equal(result.production_validated, false);
});

test("compression-like softness is reviewable while severe blur remains blocked", () => {
  assert.equal(evaluatePhotoQuality({ ...good, sharpness: 3.4 }, scene).status, "review");
  assert.equal(evaluatePhotoQuality({ ...good, sharpness: .6 }, scene).status, "retake");
  assert.equal(evaluatePhotoQuality({ ...good, sharpness: .4, contrast: 3 }, scene).status, "review");
  assert.equal(evaluatePhotoQuality({ ...good, sharpness: 3.1, contrast: 65 }, scene).status, "retake");
});

test("complex background cannot make the crop proxy a blocking claim", () => {
  const result = evaluatePhotoQuality({ ...good, edgeMarginShare: 0 }, { ...scene, background: "complex" });
  assert.equal(result.status, "review");
  assert.equal(result.issues.find((issue) => issue.code === "cropped").severity, "review");
});

test("hanger or rack downgrades ambiguous border contact to review", () => {
  const result = evaluatePhotoQuality({ ...good, edgeMarginShare: 0, edgeConfidence: .7 }, { ...scene, supportEquipment: true });
  assert.equal(result.status, "review");
  assert.equal(result.issues.find((issue) => issue.code === "cropped").severity, "review");
  assert.ok(result.issues.some((issue) => issue.code === "support_equipment"));
});

test("implausibly tiny foreground becomes unknown instead of known crop evidence", () => {
  const width = 100, height = 100, rgba = new Uint8ClampedArray(width * height * 4).fill(220);
  for (let y = 40; y < 55; y++) for (let x = 40; x < 55; x++) { const i = (y * width + x) * 4; rgba[i] = 20; rgba[i + 1] = 30; rgba[i + 2] = 40; rgba[i + 3] = 255; }
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  assert.equal(estimateEdgeOccupancy(rgba, width, height).edgeMetricStatus, "unknown");
});

test("confirmed same-colour background keeps extreme exposure reviewable", () => {
  const common = { sharpness: 6, contrast: 4, noise: 1, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "unknown" };
  const dark = evaluatePhotoQuality({ ...common, meanLuma: 10 }, { person: false, itemCount: 1, background: "plain", backgroundContrast: "low" });
  const light = evaluatePhotoQuality({ ...common, meanLuma: 250 }, { person: false, itemCount: 1, background: "plain", backgroundContrast: "low" });
  assert.equal(dark.status, "review");
  assert.equal(light.status, "review");
  assert.equal(dark.issues.find((issue) => issue.code === "too_dark").severity, "review");
  assert.equal(light.issues.find((issue) => issue.code === "overexposed").severity, "review");
});

test("thin confirmed details at the edge require review without hiding an ordinary crop", () => {
  const metrics = { meanLuma: 128, sharpness: 6, contrast: 40, noise: 1, shadowShare: 0, highlightShare: 0, edgeMetricStatus: "known", edgeMarginShare: 0, edgeConfidence: 0.8 };
  const delicate = evaluatePhotoQuality(metrics, { person: false, itemCount: 1, background: "plain", backgroundContrast: "high", delicateDetails: true });
  const ordinary = evaluatePhotoQuality(metrics, { person: false, itemCount: 1, background: "plain", backgroundContrast: "high", delicateDetails: false });
  assert.equal(delicate.status, "review");
  assert.equal(ordinary.status, "retake");
});

test("RGBA metrics are deterministic and provider-neutral", () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 20, 20, 20, 255, 240, 240, 240, 255]);
  const metrics = metricsFromRgba(rgba, 2, 2);
  assert.equal(metrics.width, 2); assert.ok(metrics.contrast > 100);
});
