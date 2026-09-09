export const CV_AUTO_TIMEOUT_MS = 120_000;

export function isCvAutoRuntimeEnabled({ flag, hostname } = {}) {
  return flag === "true" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(hostname || "").toLowerCase());
}

export function rejectDetectedPersonOrFace(payload) {
  const safety = payload?.safety;
  if (safety?.personPresent === true || safety?.facePresent === true) throw new Error("cv_person_or_face_present");
  return payload;
}

export async function analyzeLocalGarments(dto, { photoId, signal, fetchImpl = globalThis.fetch, timeoutMs = CV_AUTO_TIMEOUT_MS, flag = import.meta.env?.VITE_LOCAL_PILOT_PHOTO, hostname = globalThis.location?.hostname } = {}) {
  if (!dto?.blob || dto.networkAllowed !== false || !isCvAutoRuntimeEnabled({ flag, hostname })) {
    throw new Error("cv_auto_disabled");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl("/api/cv-auto", {
      method: "POST", body: dto.blob, signal: controller.signal,
      headers: { "Content-Type": dto.mime, "X-CV-Auto-Local": "1", "X-Photo-Id": photoId },
      credentials: "same-origin", cache: "no-store",
    });
    if (!response.ok) throw new Error(response.status === 408 ? "cv_auto_timeout" : "cv_auto_failed");
    return rejectDetectedPersonOrFace(await response.json());
  } catch (error) {
    if (controller.signal.aborted) throw new Error("cv_auto_cancelled");
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
  }
}
