import test from "node:test";
import assert from "node:assert/strict";
import { createGarmentSelection } from "./garmentSelection.js";
import { nearestPointIndex, normalizeClosedTrace, pointFromClient } from "./outlineGeometry.js";
test("manual outline requires finite bounded non-degenerate geometry", () => {
  assert.equal(createGarmentSelection([]), null);
  assert.equal(createGarmentSelection([{ x: -.2, y: .1 }, { x: .8, y: .2 }, { x: .5, y: 1.2 }]), null);
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: .5, y: .5 }, { x: 1, y: 1 }]), null);
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }]), null);
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 0 }, { x: .5, y: 1 }]), null, "rejects collinear adjacent overlap");
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: .5 }, { x: 0, y: 1 }, { x: .5, y: .5 }]), null, "rejects repeated non-consecutive self-touch");
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 0 }, { x: .5, y: 0 }]), null, "rejects zero-length edges");
  assert.equal(createGarmentSelection([{ x: 0, y: 0 }, { x: Number.NaN, y: .5 }, { x: 1, y: 1 }]), null);
  const result = createGarmentSelection([{ x: .1, y: .1 }, { x: .8, y: .2 }, { x: .5, y: .9 }]);
  assert.equal(result.source, "user_confirmed");
  assert.deepEqual(result.bounds, { x: .1, y: .1, width: .7000000000000001, height: .8 });
  assert.ok(createGarmentSelection([{ x: .1, y: .1 }, { x: .5, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }]), "allows adjacent collinear endpoints without overlap");
  assert.ok(createGarmentSelection([{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }]), "allows convex polygon");
  assert.ok(createGarmentSelection([{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .55, y: .45 }, { x: .9, y: .9 }, { x: .1, y: .9 }]), "allows simple concave polygon");
});

test("pointer coordinates use the actual rendered image bounds", () => {
  const rect = { left: 200, top: 100, right: 600, bottom: 700, width: 400, height: 600 };
  assert.deepEqual(pointFromClient(rect, 300, 250), { x: .25, y: .25 });
  assert.equal(pointFromClient(rect, 199, 250), null);
  assert.equal(pointFromClient(rect, 300, 701), null);
});

test("nearest handle is selected in rendered pixels", () => {
  const rect = { width: 400, height: 600 };
  const points = [{ x: .25, y: .25 }, { x: .8, y: .8 }];
  assert.equal(nearestPointIndex(points, { x: .27, y: .25 }, rect), 0);
  assert.equal(nearestPointIndex(points, { x: .5, y: .5 }, rect), -1);
});

test("a hand-drawn trace closes without a duplicate terminal vertex", () => {
  const rect = { width: 400, height: 600 };
  const points = [{ x: .1, y: .1 }, { x: .8, y: .1 }, { x: .8, y: .8 }, { x: .105, y: .105 }];
  assert.deepEqual(normalizeClosedTrace(points, rect), points.slice(0, -1));
  assert.equal(normalizeClosedTrace(points.slice(0, -1), rect).length, 3);
});
