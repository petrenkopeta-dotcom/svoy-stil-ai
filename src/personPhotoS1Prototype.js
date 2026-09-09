import {
  PERSON_PRESENCE,
  evaluatePersonPresenceGate,
} from "./personPresenceGate.js";
import { createGarmentSelection } from "./garmentSelection.js";

export const PERSON_PHOTO_S1_ENABLED = false;
export const PERSON_PHOTO_S1_FIXTURE_IDS = Object.freeze([
  "pp06-blur",
  "pp06-low-light",
  "pp06-compression",
  "pp06-occlusion",
  "pp06-same-color",
  "pp06-motion",
  "pp06-glare",
  "pp06-tiny-subject",
]);

const FIXTURE_IDS = new Set(PERSON_PHOTO_S1_FIXTURE_IDS);
const MODES = new Set(["demo"]);
const DISPOSE_REASONS = new Set([
  "cancel",
  "exit",
  "revoke",
  "pagehide",
  "owner_change",
  "failure",
]);
const SELECTION_KEYS = new Set([
  "version", "purpose", "source", "image_revision", "oriented_width",
  "oriented_height", "garment_count", "points",
]);

export function confirmGuidanceSelection(input) {
  if (!plain(input) || Object.keys(input).some((key) => !SELECTION_KEYS.has(key))) return null;
  if (input.version !== "manual-outline-v1" || input.purpose !== "guidance_only" || input.source !== "user_confirmed") return null;
  if (!opaque(input.image_revision) || !positiveInteger(input.oriented_width) || !positiveInteger(input.oriented_height) || input.garment_count !== 1) return null;
  if (!Array.isArray(input.points) || input.points.length < 3 || input.points.length > 64) return null;
  if (input.points.some((point) => !plain(point) || Object.keys(point).length !== 2)) return null;
  const geometry = createGarmentSelection(input.points);
  if (!geometry) return null;
  return Object.freeze({ ...input, points: geometry.points });
}

export function createPersonPhotoS1Controller({
  enabled = PERSON_PHOTO_S1_ENABLED,
  fixtureProvider,
  objectUrls = globalThis.URL,
  pageLifecycle,
} = {}) {
  let generation = 0;
  let state = frozenState();
  let ownedUrl = null;
  let pagehideHandler = null;

  const publish = (next) => (state = frozenState(next));
  const revokeUrl = () => {
    if (!ownedUrl) return [];
    const url = ownedUrl;
    ownedUrl = null;
    try { objectUrls.revokeObjectURL(url); return ["object_url"]; }
    catch (error) { return [{ scope: "object_url", error: error instanceof Error ? error.message : "revoke_failed" }]; }
  };
  const dispose = (reason = "exit") => {
    if (!DISPOSE_REASONS.has(reason)) reason = "failure";
    generation += 1;
    const result = revokeUrl();
    if (pagehideHandler) pageLifecycle?.removeEventListener?.("pagehide", pagehideHandler);
    pagehideHandler = null;
    const failures = result.filter((item) => typeof item === "object");
    const verifiedScopes = result.filter((item) => typeof item === "string");
    publish({ status: "disposed", dispose_reason: reason });
    return Object.freeze({ completed: failures.length === 0, verifiedScopes: Object.freeze(verifiedScopes), failures: Object.freeze(failures) });
  };

  async function openSyntheticFixture({ fixtureId, ownerScope, mode = "demo", injectedSignals } = {}) {
    if (!enabled) return publish({ status: "disabled" });
    if (!FIXTURE_IDS.has(fixtureId) || !opaque(ownerScope) || !MODES.has(mode) || !plain(injectedSignals)) return publish({ status: "blocked", reason: "invalid_synthetic_session" });
    if (state.owner_scope && state.owner_scope !== ownerScope) dispose("owner_change");
    else { generation += 1; revokeUrl(); }
    const requestGeneration = generation;
    publish({ status: "loading", fixture_id: fixtureId, owner_scope: ownerScope, mode });
    try {
      const fixture = await fixtureProvider?.(fixtureId);
      if (requestGeneration !== generation || state.owner_scope !== ownerScope) return state;
      if (!plain(fixture) || fixture.id !== fixtureId || fixture.synthetic_only !== true || fixture.person_present !== false || fixture.faces !== false || !(fixture.blob instanceof Blob) || (typeof File !== "undefined" && fixture.blob instanceof File)) throw new Error("SYNTHETIC_FIXTURE_REQUIRED");
      const gate = evaluatePersonPresenceGate({ consentGranted: true, processingLocation: "local", mode, person: injectedSignals.person, face: injectedSignals.face });
      if (requestGeneration !== generation) return state;
      ownedUrl = objectUrls.createObjectURL(fixture.blob);
      const revision = `s1-${requestGeneration}-${fixtureId}`;
      publish({ status: gate.presence === PERSON_PRESENCE.ABSENT ? "guidance" : "blocked", fixture_id: fixtureId, owner_scope: ownerScope, mode, image_revision: revision, preview_url: ownedUrl, gate });
      return state;
    } catch {
      if (requestGeneration === generation) dispose("failure");
      return state;
    }
  }

  const confirmSelection = (selection) => {
    const gateBefore = state.gate;
    const validated = confirmGuidanceSelection(selection);
    if (state.status !== "guidance" || !validated || validated.image_revision !== state.image_revision) return null;
    publish({ ...state, selection: validated, gate: gateBefore });
    return validated;
  };

  if (pageLifecycle?.addEventListener) {
    pagehideHandler = () => dispose("pagehide");
    pageLifecycle.addEventListener("pagehide", pagehideHandler, { once: true });
  }
  return Object.freeze({ getState: () => state, openSyntheticFixture, confirmSelection, cancel: () => dispose("cancel"), exit: () => dispose("exit"), revoke: () => dispose("revoke"), dispose });
}

function frozenState(next = { status: "idle" }) { return Object.freeze({ ...next }); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function opaque(value) { return typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value); }
function positiveInteger(value) { return Number.isInteger(value) && value > 0 && value <= 16384; }
