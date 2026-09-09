export const PHOTO_QUALITY_VERSION = "local-photo-quality-v2";

export const QUALITY_THRESHOLDS = Object.freeze({
  darkLuma: 42, brightLuma: 224, minContrast: 32, maxNoise: 28,
  minSharpness: 5.5, severeBlurSharpness: 1.5, severeBlurMinContrast: 10,
  highContrastBlurSharpness: 3.4, highContrastBlurMinContrast: 60,
  maxClippedShare: 0.28, minEdgeMargin: 0.035,
});

const guide = Object.freeze({
  blur: "Зафиксируйте телефон, протрите объектив и снимите при ярком рассеянном свете.",
  too_dark: "Добавьте ровный дневной свет; не используйте цветной свет или фильтры.",
  overexposed: "Уберите прямую лампу или вспышку и коснитесь вещи на экране для экспозиции.",
  low_contrast: "Положите вещь на однотонный фон контрастного цвета.",
  noise_or_compression: "Используйте оригинал фото без скриншота и мессенджер-сжатия.",
  cropped: "Оставьте свободное поле вокруг всей вещи, включая рукава, ремешки и прозрачные края.",
  multiple_items: "Оставьте в кадре ровно одну вещь.",
  person_present: "Снимите вещь отдельно, без лица, тела, рук и отражений человека.",
  complex_background: "Используйте ровный однотонный фон без складок, теней и других предметов.",
  color_background_match: "Выберите фон, который заметно отличается по цвету от вещи.",
  thin_or_transparent_detail: "Расправьте тонкие детали и выберите матовый контрастный фон.",
  support_equipment: "Вешалка или стойка останутся на исходном фото; вручную проверьте контур вещи перед сохранением.",
});

export function evaluatePhotoQuality(metrics = {}, declarations = {}, thresholds = QUALITY_THRESHOLDS) {
  const issues = [];
  const add = (code, severity, confidence = null) => issues.push({ code, severity, confidence, guide: guide[code] });
  if (metrics.sharpness < thresholds.minSharpness) {
    const severe = (metrics.sharpness < thresholds.severeBlurSharpness && metrics.contrast >= thresholds.severeBlurMinContrast)
      || (metrics.sharpness < thresholds.highContrastBlurSharpness && metrics.contrast >= thresholds.highContrastBlurMinContrast);
    add("blur", severe ? "block" : "review", metrics.sharpnessConfidence);
  }
  // When the user has explicitly identified a same-colour background, extreme
  // frame luminance may describe the background rather than destroyed garment
  // detail. Keep the original and require review; ordinary dark/bright frames
  // remain blocked.
  const matchedBackground = declarations.backgroundContrast === "low";
  if (metrics.meanLuma < thresholds.darkLuma || metrics.shadowShare > thresholds.maxClippedShare) add("too_dark", matchedBackground ? "review" : "block");
  if (metrics.meanLuma > thresholds.brightLuma || metrics.highlightShare > thresholds.maxClippedShare) add("overexposed", matchedBackground ? "review" : "block");
  if (metrics.contrast < thresholds.minContrast) add("low_contrast", "review");
  if (metrics.noise > thresholds.maxNoise) add("noise_or_compression", "review");
  // A complex background can touch the frame itself; its edge proxy is not
  // reliable enough to prove that the garment is cropped. Keep it review-only.
  const cropEvidenceReviewOnly = declarations.background === "complex" || declarations.delicateDetails === true || declarations.supportEquipment === true;
  if (metrics.edgeMetricStatus === "known" && metrics.edgeMarginShare < thresholds.minEdgeMargin) add("cropped", cropEvidenceReviewOnly ? "review" : "block", metrics.edgeConfidence);
  if (declarations.person !== false) add("person_present", "block");
  if (declarations.itemCount !== 1) add("multiple_items", "block");
  if (declarations.background === "complex") add("complex_background", "review");
  if (declarations.backgroundContrast === "low") add("color_background_match", "review");
  if (declarations.delicateDetails === true) add("thin_or_transparent_detail", "review");
  if (declarations.supportEquipment === true) add("support_equipment", "review");
  const status = issues.some((x) => x.severity === "block") ? "retake" : issues.length ? "review" : "pass";
  const limitations = metrics.edgeMetricStatus === "unknown" ? ["crop_signal_unknown"] : [];
  return Object.freeze({ version: PHOTO_QUALITY_VERSION, status, issues: Object.freeze(issues), limitations: Object.freeze(limitations), local_heuristic: true, production_validated: false });
}

export async function analyzeImageLocally(blob, { sampleSize = 256 } = {}) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new Error("LOCAL_IMAGE_TOOLS_UNAVAILABLE");
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, sampleSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("LOCAL_IMAGE_TOOLS_UNAVAILABLE");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return metricsFromRgba(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } finally { bitmap.close?.(); }
}

export function metricsFromRgba(data, width, height) {
  const luma = new Float32Array(width * height); let sum = 0; let sum2 = 0; let shadows = 0; let highlights = 0; let noise = 0; let sharpness = 0;
  for (let p = 0, i = 0; p < luma.length; p++, i += 4) { const y = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; luma[p] = y; sum += y; sum2 += y * y; if (y < 18) shadows++; if (y > 242) highlights++; }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { const p = y * width + x; const lap = Math.abs(4 * luma[p] - luma[p - 1] - luma[p + 1] - luma[p - width] - luma[p + width]); sharpness += lap; noise += Math.abs(luma[p] - (luma[p - 1] + luma[p + 1]) / 2); }
  const inner = Math.max(1, (width - 2) * (height - 2)); const mean = sum / luma.length;
  const edge = estimateEdgeOccupancy(data, width, height);
  return Object.freeze({ meanLuma: mean, contrast: Math.sqrt(Math.max(0, sum2 / luma.length - mean * mean)), shadowShare: shadows / luma.length, highlightShare: highlights / luma.length, sharpness: sharpness / inner, noise: noise / inner, ...edge, width, height });
}

// Provider-neutral proxy: model the background from the outer border, then measure
// whether sufficiently distinct pixels touch it. It is deliberately "unknown" when
// a flat/transparent/low-contrast image cannot support an honest foreground estimate.
export function estimateEdgeOccupancy(data, width, height) {
  if (!(data?.length >= width * height * 4) || width < 8 || height < 8) return unknownEdge();
  const border = [];
  const take = (x, y) => { const i = (y * width + x) * 4; if (data[i + 3] > 24) border.push([data[i], data[i + 1], data[i + 2]]); };
  for (let x = 0; x < width; x++) { take(x, 0); take(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { take(0, y); take(width - 1, y); }
  if (border.length < 16) return unknownEdge();
  const bg = [0, 1, 2].map((c) => median(border.map((p) => p[c])));
  const borderSpread = median(border.map((p) => colorDistance(p, bg)));
  if (borderSpread > 58) return unknownEdge();
  const threshold = Math.max(28, borderSpread * 2.2);
  const mask = new Uint8Array(width * height); let foreground = 0;
  const band = Math.max(1, Math.round(Math.min(width, height) * .015));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] <= 24 || colorDistance([data[i], data[i + 1], data[i + 2]], bg) < threshold) continue;
    foreground++; mask[y * width + x] = 1;
  }
  const share = foreground / (width * height);
  if (share < .015 || share > .94) return unknownEdge();
  const component = largestComponent(mask, width, height, band);
  const componentShare = component?.count / (width * height);
  if (!component || componentShare < .03) return unknownEdge();
  const { minX, minY, maxX, maxY, contacts, count } = component;
  const margin = Math.min(minX / width, minY / height, (width - 1 - maxX) / width, (height - 1 - maxY) / height);
  const confidence = Math.max(0, Math.min(1, 1 - borderSpread / 58));
  if (confidence < .25) return unknownEdge();
  return Object.freeze({ edgeMetricStatus: "known", edgeMarginShare: Math.max(0, margin), borderContactShare: contacts / count, foregroundOccupancy: componentShare, edgeConfidence: confidence });
}

function colorDistance(a, b) { return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2); }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function largestComponent(mask, width, height, band) {
  const seen = new Uint8Array(mask.length); let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; let head = 0, count = 0, contacts = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    while (head < queue.length) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width); count++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x < band || y < band || x >= width - band || y >= height - band) contacts++;
      for (const next of [p - 1, p + 1, p - width, p + width]) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue;
        const nx = next % width; if (Math.abs(nx - x) > 1) continue;
        seen[next] = 1; queue.push(next);
      }
    }
    if (!best || count > best.count) best = { count, contacts, minX, minY, maxX, maxY };
  }
  return best;
}
function unknownEdge() { return Object.freeze({ edgeMetricStatus: "unknown", edgeMarginShare: null, borderContactShare: null, foregroundOccupancy: null, edgeConfidence: 0 }); }
