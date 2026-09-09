import test from "node:test";
import assert from "node:assert/strict";
import { createCapsuleExplanation } from "./capsuleExplanation.js";

const trace = {
  source: "personal",
  trace_id: "trace-1",
  facts: [
    { fact_id: "color-1", confirmed: true },
    { fact_id: "sil-1", confirmed: true },
    { fact_id: "ctx-1", confirmed: true },
    { fact_id: "advice-1", confirmed: true },
  ],
  dimensions: {
    color: { status: "supported", fact_ids: ["color-1"], text: "Нейтральная основа оставляет один цветовой акцент." },
    silhouette: { status: "supported", fact_ids: ["sil-1"], text: "Один объёмный слой сочетается с более собранным низом." },
    context: { status: "tradeoff", fact_ids: ["ctx-1"], text: "Для указанного дождя обувь не подтверждена.", action: "Проверьте другую закрытую пару из гардероба." },
    practical_advice: { status: "supported", fact_ids: ["advice-1"], text: "Расстегните верхний слой, чтобы обозначить границу слоёв." },
  },
};

test("renders the four scoped dimensions only from confirmed trace facts", () => {
  const result = createCapsuleExplanation(trace);
  assert.deepEqual(Object.keys(result.dimensions), ["color", "silhouette", "context", "practical_advice"]);
  assert.equal(result.confidence, "high");
  assert.deepEqual(result.dimensions.context.fact_ids, ["ctx-1"]);
  assert.match(result.dimensions.context.action, /гардероба/);
});
test("missing or unconfirmed evidence becomes unknown instead of a claim", () => {
  const input = structuredClone(trace);
  input.facts[0].confirmed = false;
  input.dimensions.silhouette.fact_ids = ["absent"];
  const result = createCapsuleExplanation(input);
  assert.equal(result.dimensions.color.status, "unknown");
  assert.equal(result.dimensions.silhouette.status, "unknown");
  assert.deepEqual(result.dimensions.color.fact_ids, []);
  assert.doesNotMatch(result.dimensions.color.text, /нейтральная основа/);
});

test("unsafe invented claims and actionless tradeoffs fail closed", () => {
  const input = structuredClone(trace);
  input.dimensions.color.text = "Этот цвет точно стройнит фигуру.";
  input.dimensions.context.action = "";
  const result = createCapsuleExplanation(input);
  assert.equal(result.dimensions.color.status, "unknown");
  assert.equal(result.dimensions.context.status, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /стройнит|фигуру/);
});

test("demo output is explicit and never claims personal provenance", () => {
  const result = createCapsuleExplanation({ ...trace, source: "demo" });
  assert.equal(result.source, "demo");
  assert.match(result.summary, /демо-вещах/);
});
