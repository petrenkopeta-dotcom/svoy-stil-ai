import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceDraftStore, MemoryReferenceDraftBackend } from "./referenceDraft.js";

test("reference draft restores local photo, review and editor state without URLs", async () => {
  const store = createReferenceDraftStore({ backend: new MemoryReferenceDraftBackend() }), dto = { blob: new Blob(["photo"], { type: "image/png" }), mime: "image/png", purpose: "reference", provenance: "gallery", networkAllowed: false };
  await store.save({ dto, items: [{ id: "candidate-1", previewUrl: "data:image/png;base64,eA==" }], stage: "editor", editingMaskId: "candidate-1" });
  const restored = await store.load(); assert.equal(restored.stage, "editor"); assert.equal(restored.editingMaskId, "candidate-1"); assert.ok(restored.dto.blob instanceof Blob); assert.equal("previewUrl" in restored.dto, false);
  await store.clear(); assert.equal(await store.load(), null);
});

test("unsafe or external-enabled drafts fail closed", async () => {
  const store = createReferenceDraftStore({ backend: new MemoryReferenceDraftBackend() });
  await assert.rejects(store.save({ dto: { blob: new Blob(["x"]), networkAllowed: true } }), /SAFE_LOCAL_REFERENCE_DRAFT_REQUIRED/);
});
