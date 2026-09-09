import test from "node:test";
import assert from "node:assert/strict";
import { cropAlphaBlob, cropPixels, cropReferenceBlob } from "./referenceCrop.js";

test("cropPixels converts normalized selection into bounded source pixels", () => {
  assert.deepEqual(cropPixels({ x: .25, y: .1, width: .5, height: .8 }, 1000, 500), { sx: 250, sy: 50, sw: 500, sh: 400 });
  assert.deepEqual(cropPixels({ x: -.2, y: .9, width: 2, height: .5 }, 100, 100), { sx: 0, sy: 90, sw: 100, sh: 10 });
});

test("cropReferenceBlob draws only selected pixels and closes the bitmap", async () => {
  const calls = [];
  const bitmap = { width: 400, height: 200, close: () => calls.push("close") };
  const output = new Blob(["crop"], { type: "image/webp" });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => calls.push(args) }), toBlob: (done) => done(output) };
  const result = await cropReferenceBlob(new Blob(["source"], { type: "image/png" }), { x: .25, y: .25, width: .5, height: .5 }, { createBitmap: async () => bitmap, createCanvas: () => canvas });
  assert.equal(result, output);
  assert.equal(canvas.width, 200);
  assert.equal(canvas.height, 100);
  assert.deepEqual(calls[0].slice(1), [100, 50, 200, 100, 0, 0, 200, 100]);
  assert.equal(calls[1], "close");
});

test("cropAlphaBlob preserves the edited cutout as PNG and closes the bitmap", async () => {
  let closed = false, encodedType = null;
  const blob = await cropAlphaBlob(new Blob(["masked"], { type: "image/png" }), { x: .1, y: .2, width: .5, height: .5 }, {
    createBitmap: async () => ({ width: 100, height: 80, close: () => { closed = true; } }),
    createCanvas: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {} }), convertToBlob: async ({ type }) => { encodedType = type; return new Blob(["png"], { type }); } }),
  });
  assert.equal(blob.type, "image/png"); assert.equal(encodedType, "image/png"); assert.equal(closed, true);
});
