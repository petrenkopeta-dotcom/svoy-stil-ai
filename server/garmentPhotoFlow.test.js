import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createGarmentPhotoFlow } from "./garmentPhotoFlow.mjs";

// Protocol test adapter, intentionally not evidence of pixel/model accuracy.
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=", "base64");
const safety = { sha256: createHash("sha256").update(bytes).digest("hex"), checked: true, garmentOnly: true, personPresent: false, facePresent: false };
test("server confirmation rechecks exact bytes, isolates owners and persists only output", async () => {
  const db = new DatabaseSync(":memory:"); const calls = [];
  const worker = { analyze: async (data, options) => { calls.push(options); return { candidates: [{ label: "shirt", png: bytes.toString("base64"), safety }] }; }, close() {} };
  const flow = createGarmentPhotoFlow({ worker, db, releaseApproved: () => true });
  try {
    const [candidate] = await flow.analyze("owner-a", Buffer.from("synthetic original"));
    await assert.rejects(flow.confirm("owner-b", candidate.id), /not_found/);
    const saved = await flow.confirm("owner-a", candidate.id);
    assert.equal(calls[1].operation, "verify");
    assert.deepEqual(flow.read("owner-a", saved.id).bytes, bytes);
    assert.throws(() => flow.read("owner-b", saved.id), /not_found/);
    await assert.rejects(flow.confirm("owner-a", candidate.id), /not_found/);
  } finally { flow.close(); db.close(); }
});
test("release gate defaults to deny, missing proof never invokes worker", async () => {
  const db = new DatabaseSync(":memory:");
  const flow = createGarmentPhotoFlow({ db, worker: { analyze() { assert.fail("model must not run"); }, close() {} } });
  try { await assert.rejects(flow.analyze("owner", bytes), /release_unapproved/); } finally { flow.close(); db.close(); }
});
