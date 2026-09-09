import test from "node:test";
import assert from "node:assert/strict";
import { createReadinessState, readinessFromWardrobe, readinessView, transitionReadiness, READINESS_STATES } from "./honestReadiness.js";

const own = (id, name = id) => ({ id, name, source: "personal" });

test("wardrobe readiness counts only personal items", () => {
  assert.equal(readinessFromWardrobe({ wardrobe: [{ id: "d", source: "demo" }], canBuild: true }).kind, READINESS_STATES.INSUFFICIENT);
  assert.equal(readinessFromWardrobe({ wardrobe: [own("top")], canBuild: true }).kind, READINESS_STATES.READY);
});

test("demo is always explicit and cannot contain a personal result", () => {
  const state = transitionReadiness(null, { type: "SHOW_DEMO", items: [{ id: "d", name: "Пример рубашки", source: "personal" }] });
  assert.equal(state.kind, READINESS_STATES.DEMO);
  assert.equal(state.items[0].source, "demo");
  assert.equal(state.result, null);
  assert.match(readinessView(state).eyebrow, /Демо-гардероб/);
});

test("personal result is accepted only when every item belongs to personal wardrobe", () => {
  const wardrobe = [own("top"), own("bottom")];
  const valid = transitionReadiness(null, { type: "PERSONAL_BUILT", wardrobe, result: { items: wardrobe } });
  assert.equal(valid.kind, READINESS_STATES.PERSONAL);
  assert.equal(valid.result.kind, "personal");

  const mixed = transitionReadiness(null, { type: "PERSONAL_BUILT", wardrobe, result: { items: [own("top"), { id: "demo", source: "demo" }] } });
  assert.deepEqual(mixed, { kind: READINESS_STATES.ERROR, reason: "unverified_personal_result" });
});

test("failure never falls back to demo or ready", () => {
  const failed = transitionReadiness(createReadinessState(READINESS_STATES.READY), { type: "BUILD_FAILED", reason: "no_candidate" });
  assert.equal(failed.kind, READINESS_STATES.ERROR);
  assert.match(readinessView(failed).body, /Демо не было подставлено/);
});

test("retry returns to honest wardrobe readiness", () => {
  const error = createReadinessState(READINESS_STATES.ERROR);
  assert.equal(transitionReadiness(error, { type: "RETRY", wardrobe: [], canBuild: false }).kind, READINESS_STATES.INSUFFICIENT);
  assert.equal(transitionReadiness(error, { type: "RETRY", wardrobe: [own("dress")], canBuild: true }).kind, READINESS_STATES.READY);
});

test("all five states have non-empty user copy", () => {
  for (const kind of Object.values(READINESS_STATES)) {
    const view = readinessView({ kind });
    for (const field of ["eyebrow", "title", "body", "action"]) assert.ok(view[field]);
  }
});
