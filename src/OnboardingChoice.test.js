import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingChoice } from "./OnboardingChoice.js";
import { OnboardingChoiceGroup } from "./OnboardingChoiceGroup.js";

test("compatibility export points to the semantic choice group", () => {
  assert.equal(OnboardingChoice, OnboardingChoiceGroup);
});

test("single choice renders a labelled radiogroup tied to its value", () => {
  const html = renderToStaticMarkup(React.createElement(OnboardingChoiceGroup, {
    n: "01", title: "Goal", items: ["Work", "Walk"], value: "Walk", set() {},
  }));

  assert.match(html, /<fieldset[^>]+role="radiogroup"[^>]+aria-labelledby="onboarding-01-label"/);
  assert.match(html, /id="onboarding-01-label">Goal/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((html.match(/name="onboarding-01"/g) ?? []).length, 2);
  assert.match(html, /type="radio"[^>]+checked=""[^>]+value="Walk"/);
  assert.doesNotMatch(html, /role="tab"|aria-selected|aria-pressed/);
});

test("multiple constraints render labelled checkboxes with independent values", () => {
  const html = renderToStaticMarkup(React.createElement(OnboardingChoiceGroup, {
    n: "04", title: "Limits", items: ["Warm", "Comfort"], value: ["Warm"], multi: true, set() {},
  }));

  assert.match(html, /<fieldset[^>]+role="group"[^>]+aria-labelledby="onboarding-04-label"/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.doesNotMatch(html, /name="onboarding-04"/);
});

test("description, required state, and validation error are associated with the group and controls", () => {
  const html = renderToStaticMarkup(React.createElement(OnboardingChoiceGroup, {
    n: "05", title: "Finish", description: "Choose one option", error: "Selection required",
    required: true, items: ["Yes", "No"], value: "", set() {},
  }));

  assert.match(html, /aria-describedby="onboarding-05-description onboarding-05-error"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-required="true"/);
  assert.equal((html.match(/required=""/g) ?? []).length, 2);
  assert.match(html, /id="onboarding-05-error" role="alert">Selection required/);
});

test("change and Enter activation route the option value to the controlled setter", () => {
  const chosen = [];
  const tree = OnboardingChoiceGroup({
    n: "02", title: "Style", items: ["Minimal", "Classic"], value: "Minimal", set: (item) => chosen.push(item),
  });
  const inputs = tree.props.children[2].props.children.map((label) => label.props.children[0]);

  inputs[1].props.onChange();
  let prevented = false;
  inputs[0].props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  inputs[0].props.onKeyDown({ key: "ArrowRight", preventDefault() { throw new Error("native arrow handling must remain intact"); } });

  assert.deepEqual(chosen, ["Classic", "Minimal"]);
  assert.equal(prevented, true);
});
