export const PERSON_PRESENCE = Object.freeze({
  PRESENT: true,
  ABSENT: false,
  UNKNOWN: "unknown",
});

export const PERSON_PRESENCE_REASON = Object.freeze({
  PERSON_PRESENT: "person_present",
  FACE_PRESENT: "face_present",
  SAFELY_ABSENT: "person_and_face_safely_absent",
  CONSENT_REQUIRED: "consent_required",
  LOCAL_PROCESSING_REQUIRED: "local_processing_required",
  MODE_REQUIRED: "demo_or_personal_mode_required",
  SIGNAL_MISSING: "presence_signal_missing",
  SIGNAL_INVALID: "presence_signal_invalid",
  CONFIDENCE_INSUFFICIENT: "presence_confidence_insufficient",
});

const ALLOWED_MODES = new Set(["demo", "personal"]);
const HIGH_CONFIDENCE = "high";
const ALLOWED_INPUT_FIELDS = new Set([
  "consentGranted",
  "processingLocation",
  "mode",
  "person",
  "face",
]);
const ALLOWED_SIGNAL_FIELDS = new Set(["present", "confidence"]);

/**
 * Fail-closed boundary for already-produced, local person/face signals.
 *
 * The gate deliberately accepts no image, identity, embedding, template or
 * biometric payload. It is stateless, performs no I/O, and retains nothing.
 * Callers remain responsible for deleting their ephemeral detector inputs.
 */
export function evaluatePersonPresenceGate(input = {}) {
  if (
    !isPlainRecord(input) ||
    Object.keys(input).some((key) => !ALLOWED_INPUT_FIELDS.has(key))
  ) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.SIGNAL_INVALID,
    );
  }

  if (input.consentGranted !== true) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.CONSENT_REQUIRED,
    );
  }

  if (input.processingLocation !== "local") {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.LOCAL_PROCESSING_REQUIRED,
    );
  }

  if (!ALLOWED_MODES.has(input.mode)) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.MODE_REQUIRED,
    );
  }

  const signals = [input.person, input.face];
  if (signals.some((signal) => signal == null)) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.SIGNAL_MISSING,
    );
  }

  if (
    signals.some(
      (signal) =>
        !isPlainRecord(signal) ||
        Object.keys(signal).some((key) => !ALLOWED_SIGNAL_FIELDS.has(key)) ||
        typeof signal.present !== "boolean",
    )
  ) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.SIGNAL_INVALID,
    );
  }

  if (signals.some((signal) => signal.confidence !== HIGH_CONFIDENCE)) {
    return result(
      PERSON_PRESENCE.UNKNOWN,
      PERSON_PRESENCE_REASON.CONFIDENCE_INSUFFICIENT,
    );
  }

  if (input.person.present) {
    return result(
      PERSON_PRESENCE.PRESENT,
      PERSON_PRESENCE_REASON.PERSON_PRESENT,
    );
  }

  if (input.face.present) {
    return result(
      PERSON_PRESENCE.PRESENT,
      PERSON_PRESENCE_REASON.FACE_PRESENT,
    );
  }

  return result(
    PERSON_PRESENCE.ABSENT,
    PERSON_PRESENCE_REASON.SAFELY_ABSENT,
  );
}

function result(presence, reason_code) {
  return Object.freeze({ presence, reason_code });
}

function isPlainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
