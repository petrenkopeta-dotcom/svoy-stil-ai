const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function cropPixels(bounds, width, height) {
  const x = clamp(bounds?.x, 0, 1);
  const y = clamp(bounds?.y, 0, 1);
  const right = clamp(x + clamp(bounds?.width, 0, 1), x, 1);
  const bottom = clamp(y + clamp(bounds?.height, 0, 1), y, 1);
  const sx = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  return Object.freeze({
    sx,
    sy,
    sw: Math.max(1, Math.ceil(right * width) - sx),
    sh: Math.max(1, Math.ceil(bottom * height) - sy),
  });
}

/** Crops existing pixels only. It does not reconstruct or generate hidden garment areas. */
export async function cropReferenceBlob(blob, bounds, {
  createBitmap = globalThis.createImageBitmap,
  createCanvas = () => document.createElement("canvas"),
} = {}) {
  if (!(blob instanceof Blob) || !blob.type.startsWith("image/") || typeof createBitmap !== "function") {
    throw new TypeError("LOCAL_REFERENCE_IMAGE_REQUIRED");
  }
  const bitmap = await createBitmap(blob);
  try {
    const { sx, sy, sw, sh } = cropPixels(bounds, bitmap.width, bitmap.height);
    const canvas = createCanvas();
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("LOCAL_CROP_UNAVAILABLE");
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const result = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: "image/webp", quality: 0.9 })
      : await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("LOCAL_CROP_ENCODE_FAILED")), "image/webp", 0.9));
    if (!(result instanceof Blob) || result.size < 1) throw new Error("LOCAL_CROP_ENCODE_FAILED");
    return result;
  } finally {
    bitmap.close?.();
  }
}

/** Crops an already-masked local image and preserves its alpha channel as PNG. */
export async function cropAlphaBlob(blob, bounds, {
  createBitmap = globalThis.createImageBitmap,
  createCanvas = () => document.createElement("canvas"),
} = {}) {
  if (!(blob instanceof Blob) || !blob.type.startsWith("image/") || typeof createBitmap !== "function") throw new TypeError("LOCAL_MASKED_IMAGE_REQUIRED");
  const bitmap = await createBitmap(blob);
  try {
    const { sx, sy, sw, sh } = cropPixels(bounds, bitmap.width, bitmap.height);
    const canvas = createCanvas(); canvas.width = sw; canvas.height = sh;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("LOCAL_CROP_UNAVAILABLE");
    context.clearRect(0, 0, sw, sh); context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const result = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("LOCAL_CROP_ENCODE_FAILED")), "image/png"));
    if (!(result instanceof Blob) || result.size < 1) throw new Error("LOCAL_CROP_ENCODE_FAILED");
    return result;
  } finally { bitmap.close?.(); }
}
