export const IMAGE_IMPORT_VERSION = "input-image-v1";

export const IMAGE_IMPORT_LIMITS = Object.freeze({
  maxBytes: 15 * 1024 * 1024,
  maxWidth: 12000,
  maxHeight: 12000,
  maxPixels: 40_000_000,
  maxOutputEdge: 2048,
  decodeTimeoutMs: 8000,
});

export const IMAGE_IMPORT_CODES = Object.freeze({
  NO_IMAGE: "image_import_no_image",
  PERMISSION_DENIED: "image_import_permission_denied",
  UNSUPPORTED_FORMAT: "image_import_unsupported_format",
  MIME_MISMATCH: "image_import_mime_mismatch",
  EMPTY: "image_import_empty",
  TOO_LARGE: "image_import_too_large",
  TOO_MANY_PIXELS: "image_import_too_many_pixels",
  DECODE_FAILED: "image_import_decode_failed",
  DECODE_TIMEOUT: "image_import_decode_timeout",
  CANCELLED: "image_import_cancelled",
  SANITIZE_FAILED: "image_import_sanitize_failed",
  ANIMATED: "image_import_animated_not_supported",
});

const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PURPOSES = new Set(["reference", "personal"]);
const PROVENANCE = new Set(["gallery", "file", "camera", "drag", "paste"]);
const HEADER_BYTES = 64 * 1024;

export class ImageImportError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = "ImageImportError";
    this.code = code;
  }
}

export function detectImportMime(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && text(b, 0, 4) === "RIFF" && text(b, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function isAnimatedImport(bytes, mime) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (mime === "image/png") return text(b, 0, b.length).includes("acTL");
  if (mime === "image/webp") return text(b, 0, b.length).includes("ANIM") || (b.length > 20 && text(b, 12, 16) === "VP8X" && (b[20] & 0x02) !== 0);
  return false;
}

export function imageFromClipboardEvent(event) {
  const items = [...(event?.clipboardData?.items || [])];
  const item = items.find((candidate) => candidate.kind === "file" && ALLOWED_MIMES.has(candidate.type?.toLowerCase()));
  const files = [...(event?.clipboardData?.files || [])];
  const file = item?.getAsFile?.() || files.find((candidate) => ALLOWED_MIMES.has(candidate.type?.toLowerCase())) || null;
  if (!file) throw new ImageImportError(items.some((candidate) => candidate.kind === "file") || files.length ? IMAGE_IMPORT_CODES.UNSUPPORTED_FORMAT : IMAGE_IMPORT_CODES.NO_IMAGE);
  event.preventDefault?.();
  return file;
}

export async function imageFromClipboardApi(clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard || typeof clipboard.read !== "function") throw new ImageImportError(IMAGE_IMPORT_CODES.PERMISSION_DENIED);
  let entries;
  try { entries = await clipboard.read(); }
  catch (error) { throw new ImageImportError(IMAGE_IMPORT_CODES.PERMISSION_DENIED, { cause: error }); }
  for (const entry of entries || []) {
    const type = [...(entry.types || [])].find((candidate) => ALLOWED_MIMES.has(candidate.toLowerCase()));
    if (!type) continue;
    const blob = await entry.getType(type);
    return new File([blob], `clipboard.${type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1]}`, { type });
  }
  throw new ImageImportError(IMAGE_IMPORT_CODES.NO_IMAGE);
}

export function imageFromDropEvent(event) {
  const files = [...(event?.dataTransfer?.files || [])];
  const file = files.find((candidate) => ALLOWED_MIMES.has(candidate.type?.toLowerCase()));
  if (!file) throw new ImageImportError(files.length ? IMAGE_IMPORT_CODES.UNSUPPORTED_FORMAT : IMAGE_IMPORT_CODES.NO_IMAGE);
  event.preventDefault?.();
  return file;
}

export async function validateImportImage(file, { limits = IMAGE_IMPORT_LIMITS, decode = decodeDimensions, signal } = {}) {
  abortIfNeeded(signal);
  if (!file || typeof file.arrayBuffer !== "function") throw new ImageImportError(IMAGE_IMPORT_CODES.NO_IMAGE);
  if (!Number.isFinite(file.size) || file.size < 1) throw new ImageImportError(IMAGE_IMPORT_CODES.EMPTY);
  if (file.size > limits.maxBytes) throw new ImageImportError(IMAGE_IMPORT_CODES.TOO_LARGE);
  const declared = file.type?.toLowerCase();
  if (!ALLOWED_MIMES.has(declared)) throw new ImageImportError(IMAGE_IMPORT_CODES.UNSUPPORTED_FORMAT);
  const headerBlob = typeof file.slice === "function" ? file.slice(0, HEADER_BYTES) : file;
  const bytes = new Uint8Array(await headerBlob.arrayBuffer());
  abortIfNeeded(signal);
  const detected = detectImportMime(bytes);
  if (!detected) throw new ImageImportError(IMAGE_IMPORT_CODES.UNSUPPORTED_FORMAT);
  if (detected !== declared) throw new ImageImportError(IMAGE_IMPORT_CODES.MIME_MISMATCH);
  if (isAnimatedImport(bytes, detected)) throw new ImageImportError(IMAGE_IMPORT_CODES.ANIMATED);
  const dimensions = dimensionsFromHeader(bytes, detected) || await withDeadline(decode(file, { signal }), limits.decodeTimeoutMs, signal);
  const { width, height } = dimensions || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ImageImportError(IMAGE_IMPORT_CODES.DECODE_FAILED);
  if (width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) throw new ImageImportError(IMAGE_IMPORT_CODES.TOO_MANY_PIXELS);
  return Object.freeze({ mime: detected, width, height });
}

export async function normalizeImportImage(file, validation, { limits = IMAGE_IMPORT_LIMITS, signal } = {}) {
  abortIfNeeded(signal);
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new ImageImportError(IMAGE_IMPORT_CODES.SANITIZE_FAILED);
  let bitmap;
  try {
    bitmap = await withDeadline(createImageBitmap(file, { imageOrientation: "from-image" }), limits.decodeTimeoutMs, signal);
    abortIfNeeded(signal);
    const scale = Math.min(1, limits.maxOutputEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const preserveAlpha = validation.mime === "image/png";
    const context = canvas.getContext("2d", { alpha: preserveAlpha });
    if (!context) throw new Error("canvas unavailable");
    if (!preserveAlpha) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); }
    context.drawImage(bitmap, 0, 0, width, height);
    const mime = preserveAlpha ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode failed")), mime, 0.9));
    abortIfNeeded(signal);
    return Object.freeze({ blob, mime, width, height, alphaPreserved: preserveAlpha });
  } catch (error) {
    if (error instanceof ImageImportError) throw error;
    throw new ImageImportError(IMAGE_IMPORT_CODES.SANITIZE_FAILED, { cause: error });
  } finally { bitmap?.close?.(); }
}

export function createImageImportController({ normalize = normalizeImportImage, createObjectURL = (blob) => URL.createObjectURL(blob), revokeObjectURL = (url) => URL.revokeObjectURL(url) } = {}) {
  let generation = 0;
  let activeAbort = null;
  let previewUrl = null;
  const releasePreview = () => { if (previewUrl) revokeObjectURL(previewUrl); previewUrl = null; };
  return Object.freeze({
    async import(file, { provenance = "file", purpose = "reference", limits, decode } = {}) {
      if (!PROVENANCE.has(provenance) || !PURPOSES.has(purpose)) throw new TypeError("Invalid image provenance or purpose");
      const current = ++generation;
      activeAbort?.abort();
      activeAbort = new AbortController();
      releasePreview();
      try {
        const validation = await validateImportImage(file, { limits, decode, signal: activeAbort.signal });
        const normalized = await normalize(file, validation, { limits, signal: activeAbort.signal });
        if (current !== generation) throw new ImageImportError(IMAGE_IMPORT_CODES.CANCELLED);
        previewUrl = createObjectURL(normalized.blob);
        return Object.freeze({
          version: IMAGE_IMPORT_VERSION,
          blob: normalized.blob,
          mime: normalized.mime,
          width: normalized.width,
          height: normalized.height,
          byteSize: normalized.blob.size,
          provenance,
          purpose,
          storagePartition: purpose === "reference" ? "reference_images" : "personal_images",
          previewUrl,
          metadataStripped: true,
          exifGpsStripped: true,
          alphaPreserved: normalized.alphaPreserved === true,
          networkAllowed: false,
        });
      } catch (error) {
        if (activeAbort?.signal.aborted || current !== generation) throw new ImageImportError(IMAGE_IMPORT_CODES.CANCELLED);
        throw error instanceof ImageImportError ? error : new ImageImportError(IMAGE_IMPORT_CODES.SANITIZE_FAILED, { cause: error });
      }
    },
    cancel() { generation += 1; activeAbort?.abort(); activeAbort = null; releasePreview(); },
    dispose() { this.cancel(); },
  });
}

function text(bytes, start, end) { return String.fromCharCode(...bytes.subarray(start, end)); }
function dimensionsFromHeader(bytes, mime) {
  if (mime === "image/png" && bytes.length >= 24) { const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return { width: view.getUint32(16), height: view.getUint32(20) }; }
  if (mime === "image/jpeg") {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if (sof.has(marker) && length >= 7) return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      offset += length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const chunk = text(bytes, 12, 16);
    if (chunk === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) return { width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10) };
  }
  return null;
}
function abortIfNeeded(signal) { if (signal?.aborted) throw new ImageImportError(IMAGE_IMPORT_CODES.CANCELLED); }
function withDeadline(promise, ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ImageImportError(IMAGE_IMPORT_CODES.DECODE_TIMEOUT)), ms);
    const abort = () => reject(new ImageImportError(IMAGE_IMPORT_CODES.CANCELLED));
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, (error) => reject(new ImageImportError(IMAGE_IMPORT_CODES.DECODE_FAILED, { cause: error }))).finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", abort); });
  });
}
async function decodeDimensions(file) {
  if (typeof createImageBitmap !== "function") throw new Error("decoder unavailable");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try { return { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close?.(); }
}
