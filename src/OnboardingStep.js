import React, { useEffect, useRef } from "react";

export function focusOnboardingStep(container) {
  const heading = container?.querySelector?.("[data-onboarding-step-heading]");
  heading?.focus?.();
  return heading ?? null;
}

export function focusOnboardingError(container) {
  const invalid = container?.querySelector?.('[aria-invalid="true"] input, input[aria-invalid="true"], [role="alert"]');
  invalid?.focus?.();
  return invalid ?? null;
}

export function OnboardingStep({
  step,
  total = 5,
  title,
  description,
  error,
  children,
  onNext,
  onBack,
  nextLabel,
  backLabel,
  validate = () => true,
}) {
  const containerRef = useRef(null);
  const titleId = `onboarding-step-${step}-title`;
  const descriptionId = `onboarding-step-${step}-description`;
  const errorId = `onboarding-step-${step}-error`;

  useEffect(() => {
    focusOnboardingStep(containerRef.current);
  }, [step]);

  const next = () => {
    if (!validate()) {
      focusOnboardingError(containerRef.current);
      return;
    }
    onNext?.();
  };

  return React.createElement(
    "section",
    {
      ref: containerRef,
      className: "onboarding-step",
      "aria-labelledby": titleId,
      "aria-describedby": [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined,
    },
    React.createElement("p", { className: "onboarding-progress", "aria-label": `Шаг ${step} из ${total}` }, `${step} / ${total}`),
    React.createElement("h2", { id: titleId, tabIndex: -1, "data-onboarding-step-heading": "" }, title),
    description ? React.createElement("p", { id: descriptionId }, description) : null,
    children,
    error ? React.createElement("p", { id: errorId, role: "alert", className: "onboarding-error" }, error) : null,
    React.createElement(
      "div",
      { className: "onboarding-navigation" },
      onBack ? React.createElement("button", { type: "button", onClick: onBack }, backLabel) : null,
      React.createElement("button", { type: "button", onClick: next }, nextLabel),
    ),
  );
}
