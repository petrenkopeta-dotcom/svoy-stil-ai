import test from "node:test";
import assert from "node:assert/strict";
import { catalogForLocalPilot, isLocalCapsuleEnabled, isLocalPilotPhotoEnabled, runAddGarmentEntry } from "./localPilotPolicy.js";

test("local photo pilot requires both the explicit flag and a loopback host", () => {
  for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"])
    assert.equal(isLocalPilotPhotoEnabled({ flag: "true", hostname }), true);
  assert.equal(isLocalPilotPhotoEnabled({ flag: "false", hostname: "localhost" }), false);
  assert.equal(isLocalPilotPhotoEnabled({ flag: undefined, hostname: "localhost" }), false);
  assert.equal(isLocalPilotPhotoEnabled({ flag: "true", hostname: "pilot.example.com" }), false);
});

test("capsule entry is disabled by default and cannot be enabled off loopback", () => {
  assert.equal(isLocalCapsuleEnabled({ flag: "true", hostname: "localhost" }), true);
  assert.equal(isLocalCapsuleEnabled({ flag: "false", hostname: "localhost" }), false);
  assert.equal(isLocalCapsuleEnabled({ flag: "true", hostname: "app.example.com" }), false);
});

test("local pilot opens device-only intake without invoking auth", () => {
  let opened = 0, authCalls = 0;
  const result = runAddGarmentEntry({ localPilot: true, open: () => opened++, requireAuth: () => authCalls++ });
  assert.equal(result, "local_pilot");
  assert.equal(opened, 1);
  assert.equal(authCalls, 0);
});

test("default and production entry preserve the auth gate", () => {
  let opened = 0, action = null;
  const result = runAddGarmentEntry({
    localPilot: false,
    open: () => opened++,
    requireAuth: (requestedAction) => { action = requestedAction; },
  });
  assert.equal(result, "auth_required");
  assert.equal(action, "wardrobe");
  assert.equal(opened, 0);
});

test("device catalog is exposed only inside the local pilot policy", () => {
  const personal = [{ id: "local" }], fallback = [{ id: "demo" }];
  assert.equal(catalogForLocalPilot({ localPilot: true, personal, fallback }), personal);
  assert.equal(catalogForLocalPilot({ localPilot: false, personal, fallback }), fallback);
});
