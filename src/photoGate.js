export const PHOTO_GATE_OUTCOME = Object.freeze({
  ACCEPT: "accept",
  SAVE_AND_REVIEW: "save_and_review",
  RETAKE: "retake",
});

const HIGH = "high";

/**
 * Converts local detector signals into a fail-closed product decision.
 * This function never reads, uploads, hashes or logs the image.
 */
export function decidePhotoGate(signals = {}) {
  const personSafelyExcluded =
    signals.personPresent === false && signals.personConfidence === HIGH;

  if (!personSafelyExcluded) {
    return decision(PHOTO_GATE_OUTCOME.RETAKE, "person_not_safely_excluded");
  }

  if (signals.sceneSupported === false) {
    return decision(PHOTO_GATE_OUTCOME.RETAKE, "unsupported_scene");
  }

  if (signals.sceneSupported !== true || signals.garmentUsable !== true) {
    return decision(PHOTO_GATE_OUTCOME.RETAKE, "scene_not_safely_supported");
  }

  const certain =
    signals.sceneConfidence === HIGH && signals.garmentConfidence === HIGH;

  if (certain) {
    return decision(PHOTO_GATE_OUTCOME.ACCEPT, "supported_garment", true);
  }

  return decision(
    PHOTO_GATE_OUTCOME.SAVE_AND_REVIEW,
    "admissible_uncertainty",
    false,
  );
}

function decision(outcome, reason, backgroundRemovalAllowed = false) {
  const upload_allowed = outcome !== PHOTO_GATE_OUTCOME.RETAKE;
  return Object.freeze({
    outcome,
    reason,
    upload_allowed,
    background_removal_allowed: backgroundRemovalAllowed,
    preserve_original: outcome === PHOTO_GATE_OUTCOME.SAVE_AND_REVIEW,
  });
}

/** Keeps every image network operation behind the same privacy decision. */
export function assertImageNetworkAllowed(gateDecision) {
  if (gateDecision?.upload_allowed !== true) {
    throw new Error("PHOTO_UPLOAD_BLOCKED");
  }
}
