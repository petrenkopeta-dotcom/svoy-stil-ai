import { assertImageNetworkAllowed } from "./photoGate.js";
import { analyzeImageLocally, evaluatePhotoQuality } from "./photoQuality.js";
import { createGarmentSelection } from "./garmentSelection.js";

export const PHOTO_INTAKE_STATUS = Object.freeze({
  ACCEPT: "accept",
  REVIEW: "save_and_review",
  RETAKE: "retake",
});

export const PHOTO_INTAKE_LIMITS = Object.freeze({
  maxBytes: 15 * 1024 * 1024,
  minWidth: 400,
  minHeight: 400,
  maxWidth: 12000,
  maxHeight: 12000,
  maxPixels: 40_000_000,
});

// The quality analyser samples at 256px and the original is retained separately.
// A 640px local working copy preserves review detail while avoiding a
// full-resolution PNG encode on the critical intake path.
export const MAX_SANITIZED_EDGE = 640;

const HEADER_BYTES = 32;

const FORMAT = Object.freeze({
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
});

const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

export function detectImageFormat(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return FORMAT.jpeg;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return FORMAT.png;
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return FORMAT.webp;
  return null;
}

export async function validateLocalImage(file, limits = PHOTO_INTAKE_LIMITS, decode = decodeImage) {
  if (!file || typeof file.arrayBuffer !== "function") return invalid("file_missing");
  if (!Number.isFinite(file.size) || file.size <= 0) return invalid("file_empty");
  if (file.size > limits.maxBytes) return invalid("file_too_large");

  // Signatures and PNG dimensions live in the fixed header. Reading only that
  // prefix avoids copying multi-megabyte photos during fail-closed validation.
  const headerSource = typeof file.slice === "function" ? file.slice(0, HEADER_BYTES) : file;
  const bytes = new Uint8Array(await headerSource.arrayBuffer());
  const format = detectImageFormat(bytes);
  if (!format && HEIC_MIMES.has(file.type?.toLowerCase())) return invalid("heic_not_supported_in_this_browser");
  if (!format) return invalid("unsupported_signature");
  if (file.type?.toLowerCase() !== format.mime) return invalid("mime_mismatch");

  let dimensions = dimensionsFromHeader(bytes, format);
  if (!dimensions) {
    try {
      dimensions = await decode(file);
    } catch {
      return invalid("decode_failed");
    }
  }
  const { width, height } = dimensions || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return invalid("invalid_dimensions");
  if (width < limits.minWidth || height < limits.minHeight) return invalid("resolution_too_small");
  if (width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) return invalid("resolution_too_large");
  return Object.freeze({ ok: true, format, width, height });
}

export async function sanitizeImage(file, validation) {
  if (!validation?.ok) throw new Error("PHOTO_NOT_VALIDATED");
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new Error("LOCAL_IMAGE_TOOLS_UNAVAILABLE");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SANITIZED_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: validation.format.mime === "image/png" });
    if (!context) throw new Error("LOCAL_IMAGE_TOOLS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, validation.format.mime, 0.92));
    if (!blob) throw new Error("IMAGE_SANITIZE_FAILED");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

export function createPhotoIntakeController({ sanitize = sanitizeImage, qualityAnalyzer = analyzeImageLocally, trustedDetector = null } = {}) {
  let state = emptyState();
  let selectionVersion = 0;
  const snapshot = () => Object.freeze({ ...state });

  return Object.freeze({
    getState: snapshot,
    async select(file, options = {}) {
      const version = ++selectionVersion;
      state = { ...emptyState(), busy: true, phase: "validating", selectionVersion: version };
      const validation = await validateLocalImage(file, options.limits, options.decode);
      if (version !== selectionVersion) return snapshot();
      if (!validation.ok) {
        state = blocked(validation.reason);
        return snapshot();
      }
      let sanitized;
      try {
        sanitized = await sanitize(file, validation);
      } catch {
        if (version !== selectionVersion) return snapshot();
        state = blocked("sanitize_failed");
        return snapshot();
      }
      if (version !== selectionVersion) return snapshot();

      state = {
        ...emptyState(),
        original: file,
        uploadBlob: sanitized,
        validation,
        phase: "analyzing_quality",
        selectionVersion: version,
        reason: "manual_declaration_required",
      };

      try {
        const metrics = await qualityAnalyzer(sanitized);
        if (version !== selectionVersion) return snapshot();
        state = { ...state, metrics, quality_analysis_available: true, phase: "awaiting_scene_declaration" };
      } catch {
        if (version !== selectionVersion) return snapshot();
        state = { ...state, metrics: null, quality_analysis_available: false, phase: "awaiting_scene_declaration" };
      }

      if (typeof trustedDetector === "function") {
        const signals = await trustedDetector(sanitized);
        if (version !== selectionVersion) return snapshot();
        state = applyTrustedSignals(state, signals);
      }
      return snapshot();
    },
    declareGarmentOnly(confirmed) {
      return decideScene(confirmed === true ? { person: false, itemCount: 1 } : { person: "unknown", itemCount: "unknown" });
    },
    setSubjectSelection(selection) {
      const validated = selection?.version === "manual-outline-v1" && selection?.source === "user_confirmed" ? createGarmentSelection(selection.points) : null;
      if (!validated) throw new Error("PHOTO_SELECTION_INVALID");
      state = { ...state, subjectSelection: validated };
      return snapshot();
    },
    declareScene(declarations) {
      return decideScene(declarations);
    },
    grantProcessingConsent({ granted, policyVersion = "photo-processing-consent-v1", grantedAt = new Date().toISOString() } = {}) {
      state = { ...state, processingConsent: granted === true ? { granted: true, policyVersion, grantedAt } : null, upload_allowed: granted === true && state.status === PHOTO_INTAKE_STATUS.ACCEPT && state.quality?.status === "pass" };
      return snapshot();
    },
    clear() {
      selectionVersion++;
      state = emptyState();
      return snapshot();
    },
    getUploadPayload() {
      assertImageNetworkAllowed(state);
      return Object.freeze({
        blob: state.uploadBlob,
        original: state.original,
        preserve_original: true,
        background_removal_allowed: false,
        review_required: state.status !== PHOTO_INTAKE_STATUS.ACCEPT,
        exif_stripped: true,
        processing_consent: state.processingConsent,
      });
    },
    getLocalReviewPayload() {
      if (state.phase !== "quality_decided" || state.status !== PHOTO_INTAKE_STATUS.REVIEW || state.local_ready !== true || !state.quality) {
        throw new Error("PHOTO_LOCAL_REVIEW_NOT_READY");
      }
      return Object.freeze({
        blob: state.uploadBlob,
        original: state.original,
        status: PHOTO_INTAKE_STATUS.REVIEW,
        storage_scope: "local_device",
        network_allowed: false,
        preserve_original: true,
        background_removal_allowed: false,
        user_review_required: true,
        scene_declaration: state.sceneDeclaration,
        quality_decision: state.quality,
        subject_selection: state.subjectSelection,
      });
    },
  });

  function decideScene(declarations) {
      if (!state.uploadBlob || state.busy || state.phase === "quality_decided") return snapshot();
      const sceneDeclaration = Object.freeze({ ...declarations });
      if (state.quality_analysis_available !== true || !state.metrics) {
        state = { ...state, phase: "quality_decided", sceneDeclaration, status: PHOTO_INTAKE_STATUS.RETAKE, reason: "quality_analysis_unavailable", local_ready: false, upload_allowed: false, quality: unavailableQuality() };
        return snapshot();
      }
      const quality = evaluatePhotoQuality(state.metrics, sceneDeclaration);
      state = { ...state, phase: "quality_decided", sceneDeclaration, quality, status: quality.status === "retake" ? PHOTO_INTAKE_STATUS.RETAKE : PHOTO_INTAKE_STATUS.REVIEW, reason: quality.status === "retake" ? quality.issues[0]?.code : "quality_review_required", local_ready: quality.status !== "retake", upload_allowed: false };
      return snapshot();
  }
}

function applyTrustedSignals(current, signals) {
  if (signals?.person !== "absent") return detectorBlock(current, "person_not_safely_excluded");
  if (signals?.subject === "unsupported" || signals?.subject === "unknown") return detectorBlock(current, "unsupported_or_unknown_subject");
  if (signals?.subject !== "garment") return detectorBlock(current, "detector_result_missing");
  return { ...current, detectorSignals: Object.freeze({ ...signals }), reason: "manual_declaration_required", upload_allowed: false };
}

function detectorBlock(current, reason) {
  return { ...current, phase: "quality_decided", status: PHOTO_INTAKE_STATUS.RETAKE, reason, local_ready: false, upload_allowed: false, quality: Object.freeze({ version: "local-photo-quality-v1", status: "retake", issues: Object.freeze([{ code: reason, severity: "block", guide: "Снимите одну вещь отдельно, без человека, рук и других предметов." }]), limitations: Object.freeze([]), local_heuristic: true, production_validated: false }) };
}

function emptyState() {
  return { status: null, phase: "empty", reason: "select_photo", local_ready: false, upload_allowed: false, busy: false, original: null, uploadBlob: null, validation: null, metrics: null, quality: null, sceneDeclaration: null, subjectSelection: null, processingConsent: null };
}

function blocked(reason) {
  return { ...emptyState(), status: PHOTO_INTAKE_STATUS.RETAKE, reason };
}

function invalid(reason) {
  return Object.freeze({ ok: false, reason });
}

function unavailableQuality() {
  return Object.freeze({ version: "local-photo-quality-v1", status: "retake", issues: Object.freeze([{ code: "quality_analysis_unavailable", severity: "block", guide: "Не удалось безопасно проверить резкость и экспозицию. Выберите исходный JPEG, PNG или WebP и повторите попытку." }]), limitations: Object.freeze(["local_quality_unavailable"]), local_heuristic: true, production_validated: false });
}

function ascii(bytes, from, to) {
  return String.fromCharCode(...bytes.subarray(from, to));
}

function dimensionsFromHeader(bytes, format) {
  if (format !== FORMAT.png || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function decodeImage(file) {
  if (typeof createImageBitmap !== "function") throw new Error("LOCAL_IMAGE_TOOLS_UNAVAILABLE");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}
