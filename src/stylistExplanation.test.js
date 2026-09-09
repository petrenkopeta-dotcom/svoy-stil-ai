import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderStylistExplanation, STYLIST_ACTIONS } from "./stylistExplanation.js";

const facts = [
  { code: "NEUTRAL_BASE_SINGLE_ACCENT", rule_version: "color-reasoning/1.0.0" },
  { code: "SILHOUETTE_VOLUME_BALANCED", rule_version: "silhouette-reasoning/1.0.0" },
  { code: "CONTEXT_FORMALITY_MATCH", rule_version: "context-reasoning/1.0.0" },
  { code: "PROFILE_COMFORT_NO_HEELS", rule_version: "profile-reasoning/1.0.0" },
];

test("long and short renderings match the golden snapshot", async () => {
  const snapshot = (value) => ({
    length: value.length,
    summary: value.summary,
    sections: value.sections,
    advice: value.advice,
    actions: value.actions.map(({ code, label }) => ({ code, label })),
  });
  const actual = { long: snapshot(renderStylistExplanation(facts)), short: snapshot(renderStylistExplanation(facts, { length: "short" })) };
  const expected = JSON.parse(await readFile(new URL("./stylistExplanation.golden.json", import.meta.url), "utf8"));
  assert.deepEqual(actual, expected);
});

test("unknown and explicitly unconfirmed facts never become claims", () => {
  const rendered = renderStylistExplanation([{ code: "MADE_UP_FACT" }, { code: "RELATED_SHADES_PRESENT", confirmed: false }]);
  assert.deepEqual(rendered.unknown_codes, ["MADE_UP_FACT"]);
  assert.equal(rendered.sections.every((section) => section.supported === false), true);
  assert.doesNotMatch(rendered.plain_text, /MADE_UP_FACT|близкие оттенки/i);
});

test("output is screen-reader friendly and exposes all bounded actions", () => {
  const rendered = renderStylistExplanation([]);
  assert.equal(rendered.accessibility_label, rendered.plain_text);
  assert.deepEqual(rendered.actions.map(({ code }) => code), STYLIST_ACTIONS.map(({ code }) => code));
  assert.equal(rendered.actions.every(({ label, aria_label, instruction }) => label && aria_label && instruction), true);
  assert.doesNotMatch(rendered.plain_text, /%|процент/i);
});
