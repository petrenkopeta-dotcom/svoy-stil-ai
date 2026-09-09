import test from "node:test";
import assert from "node:assert/strict";
import { featherMask, paddedAlphaBounds, pointerToImagePoint, postprocessMask, removeSmallIslands } from "./maskEditor.js";

test("editor pointer coordinates follow the rendered canvas at every scale", () => {
  const rect = { left: 10, top: 20, width: 200, height: 400 };
  assert.deepEqual(pointerToImagePoint(rect, 110, 220, 1000, 2000), { x: 500, y: 1000 });
  assert.equal(pointerToImagePoint(rect, 9, 220, 1000, 2000), null);
  assert.equal(pointerToImagePoint({ ...rect, width: 0 }, 10, 20, 10, 10), null);
});

test("postprocessing closes a one-pixel break and removes small islands", () => {
  const width = 9, height = 9, mask = new Uint8ClampedArray(width * height);
  for (let y = 2; y <= 6; y += 1) for (let x = 2; x <= 6; x += 1) mask[y * width + x] = 255;
  mask[4 * width + 4] = 0; mask[0] = 255;
  const result = postprocessMask(mask, width, height);
  assert.equal(result[4 * width + 4], 255);
  assert.equal(result[0], 0);
  assert.equal(removeSmallIslands(mask, width, height, 2)[0], 0);
});

test("feather is narrow and crop includes bounded four-percent safety padding", () => {
  const width = 20, height = 20, mask = new Uint8ClampedArray(width * height);
  for (let y = 5; y < 15; y += 1) for (let x = 5; x < 15; x += 1) mask[y * width + x] = 255;
  const feathered = featherMask(mask, width, height);
  assert.equal(feathered[10 * width + 10], 255);
  assert.equal(feathered[0], 0);
  assert.deepEqual(paddedAlphaBounds(feathered, width, height, .04), { x: .15, y: .15, width: .7, height: .7 });
});
