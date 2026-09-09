import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingStep, focusOnboardingError, focusOnboardingStep } from "./OnboardingStep.js";

test("five-step container has named progress, focus target, description and alert", () => {
  const html = renderToStaticMarkup(React.createElement(OnboardingStep, {
    step: 3, title: "Title", description: "Help", error: "Choose one", nextLabel: "Next", backLabel: "Back", onBack() {},
  }, React.createElement("div", null, "Choices")));

  assert.match(html, /aria-label="Шаг 3 из 5"/);
  assert.match(html, /<h2[^>]+tabindex="-1"[^>]+data-onboarding-step-heading=""[^>]*>Title/);
  assert.match(html, /aria-describedby="onboarding-step-3-description onboarding-step-3-error"/);
  assert.match(html, /role="alert"[^>]*>Choose one/);
  assert.equal((html.match(/type="button"/g) ?? []).length, 2);
});

test("focus helpers target the new heading and invalid control", () => {
  const focused = [];
  const heading = { focus: () => focused.push("heading") };
  const invalid = { focus: () => focused.push("invalid") };
  const container = { querySelector: (selector) => selector.includes("heading") ? heading : invalid };
  assert.equal(focusOnboardingStep(container), heading);
  assert.equal(focusOnboardingError(container), invalid);
  assert.deepEqual(focused, ["heading", "invalid"]);
});
