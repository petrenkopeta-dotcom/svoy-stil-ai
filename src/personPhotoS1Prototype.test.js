import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPersonPhotoS1Controller, confirmGuidanceSelection, PERSON_PHOTO_S1_ENABLED } from "./personPhotoS1Prototype.js";
import { decidePhotoGate } from "./photoGate.js";

const signals = { person: { present: false, confidence: "high" }, face: { present: false, confidence: "high" } };
const fixtureProvider = async (id) => ({ id, synthetic_only: true, person_present: false, faces: false, blob: new Blob([await readFile(new URL(`../qa/photo-person-06/generated/${id}.svg`, import.meta.url))], { type: "image/svg+xml" }) });
function harness(overrides = {}) {
  const created = [], revoked = [];
  const controller = createPersonPhotoS1Controller({ enabled: true, fixtureProvider, objectUrls: { createObjectURL(blob) { const url = `blob:s1-${created.length}`; created.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } }, ...overrides });
  return { controller, created, revoked };
}

test("S1 is default-off and exposes no real-file intake", async () => {
  assert.equal(PERSON_PHOTO_S1_ENABLED, false);
  const controller = createPersonPhotoS1Controller();
  assert.equal("select" in controller, false);
  assert.equal("upload" in controller, false);
  assert.equal((await controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "developer_s1", injectedSignals: signals })).status, "disabled");
});

test("uses PHOTO-PERSON-06 fixture with injected coarse signals and no detector claim", async () => {
  const { controller, created } = harness();
  const state = await controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "developer_s1", injectedSignals: signals });
  assert.equal(state.status, "guidance"); assert.equal(state.gate.presence, false); assert.equal(created.length, 1);
  assert.equal(state.fixture_id, "pp06-blur");
});

test("guidance_only DTO is strict, revision-bound, and cannot alter acceptance", async () => {
  const { controller } = harness();
  const state = await controller.openSyntheticFixture({ fixtureId: "pp06-glare", ownerScope: "developer_s1", injectedSignals: signals });
  const gateBefore = state.gate;
  const dto = { version: "manual-outline-v1", purpose: "guidance_only", source: "user_confirmed", image_revision: state.image_revision, oriented_width: 640, oriented_height: 800, garment_count: 1, points: [{x:.1,y:.1},{x:.9,y:.1},{x:.5,y:.9}] };
  assert.ok(controller.confirmSelection(dto)); assert.equal(controller.getState().gate, gateBefore);
  assert.equal(confirmGuidanceSelection({ ...dto, upload_allowed: true }), null);
  assert.equal(controller.confirmSelection({ ...dto, image_revision: "stale_rev" }), null);
});

test("cancel, exit, revoke, pagehide, owner change, and failure verify object URL cleanup", async () => {
  for (const action of ["cancel", "exit", "revoke"]) { const h = harness(); await h.controller.openSyntheticFixture({ fixtureId: "pp06-motion", ownerScope: "developer_s1", injectedSignals: signals }); const receipt = h.controller[action](); assert.equal(receipt.completed, true); assert.deepEqual(receipt.verifiedScopes, ["object_url"]); assert.equal(h.revoked.length, 1); }
  const listeners = new Map(); const h = harness({ pageLifecycle: { addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: (n) => listeners.delete(n) } }); await h.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "developer_s1", injectedSignals: signals }); listeners.get("pagehide")(); assert.equal(h.revoked.length, 1);
  const owners = harness(); await owners.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "owner_one", injectedSignals: signals }); await owners.controller.openSyntheticFixture({ fixtureId: "pp06-glare", ownerScope: "owner_two", injectedSignals: signals }); assert.equal(owners.revoked.length, 1);
  const failed = harness({ fixtureProvider: async () => { throw new Error("fixture failure"); } }); assert.equal((await failed.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "developer_s1", injectedSignals: signals })).dispose_reason, "failure");
  const revokeFailure = harness({ objectUrls: { createObjectURL: () => "blob:failure", revokeObjectURL: () => { throw new Error("cannot revoke"); } } });
  await revokeFailure.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "developer_s1", injectedSignals: signals });
  const incomplete = revokeFailure.controller.exit(); assert.equal(incomplete.completed, false); assert.deepEqual(incomplete.verifiedScopes, []); assert.equal(incomplete.failures[0].scope, "object_url");
});

test("stale async results and demo/owner mixing are rejected", async () => {
  let resolve; const pending = new Promise((done) => { resolve = done; });
  const h = harness({ fixtureProvider: () => pending });
  const opening = h.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "owner_one", injectedSignals: signals }); h.controller.cancel();
  resolve(await fixtureProvider("pp06-blur")); await opening; assert.equal(h.created.length, 0); assert.equal(h.controller.getState().status, "disposed");
  assert.equal((await h.controller.openSyntheticFixture({ fixtureId: "pp06-blur", ownerScope: "owner_one", mode: "personal", injectedSignals: signals })).status, "blocked");
  assert.equal((await h.controller.openSyntheticFixture({ fixtureId: "unknown", ownerScope: "owner_one", injectedSignals: signals })).status, "blocked");
});

test("controller has zero storage/network/telemetry dependencies and default garment gate is unchanged", () => {
  const source = createPersonPhotoS1Controller.toString();
  for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "telemetry", "indexedDB"]) assert.equal(source.includes(forbidden), false);
  assert.deepEqual(decidePhotoGate({ personPresent: true, personConfidence: "high", sceneSupported: true, sceneConfidence: "high", garmentUsable: true, garmentConfidence: "high" }), { outcome: "retake", reason: "person_not_safely_excluded", upload_allowed: false, background_removal_allowed: false, preserve_original: false });
});
