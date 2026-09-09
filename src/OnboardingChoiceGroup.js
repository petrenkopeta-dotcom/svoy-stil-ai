import React from "react";
import { Check } from "lucide-react";

export function OnboardingChoiceGroup({
  n,
  title,
  value,
  items,
  set,
  multi = false,
  description,
  error,
  required = false,
}) {
  const groupName = `onboarding-${String(n).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const labelId = `${groupName}-label`;
  const descriptionId = `${groupName}-description`;
  const errorId = `${groupName}-error`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined;
  const selectedValues = Array.isArray(value) ? value : [];

  return React.createElement(
    "fieldset",
    {
      className: "choice",
      "data-onboarding-group": n,
      role: multi ? "group" : "radiogroup",
      "aria-labelledby": labelId,
      "aria-describedby": describedBy,
      "aria-invalid": error ? "true" : undefined,
      "aria-required": required || undefined,
    },
    React.createElement(
      "legend",
      { className: "choice-legend" },
      React.createElement("span", { className: "num", "aria-hidden": "true" }, n),
      React.createElement("span", { className: "choice-title", id: labelId }, title),
    ),
    description ? React.createElement("p", { className: "choice-description", id: descriptionId }, description) : null,
    React.createElement(
      "div",
      { className: "chips" },
      items.map((item, index) => {
        const option = typeof item === "string" ? { value: item, label: item } : item;
        const selected = multi ? selectedValues.includes(option.value) : value === option.value;
        const id = `${groupName}-option-${index}`;
        return React.createElement(
          "label",
          { className: selected ? "chip active" : "chip", key: option.value, htmlFor: id },
          React.createElement("input", {
            id,
            name: multi ? undefined : groupName,
            type: multi ? "checkbox" : "radio",
            checked: selected,
            value: option.value,
            "aria-label": option.ariaLabel,
            required: !multi && required,
            "aria-describedby": describedBy,
            "aria-invalid": error ? "true" : undefined,
            onChange: () => set(option.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                set(option.value);
              }
            },
          }),
          React.createElement("span", { className: "chip-copy" },
            React.createElement("b", null, option.label),
            option.description ? React.createElement("small", null, option.description) : null,
          ),
          selected ? React.createElement(Check, { size: 13, "aria-hidden": "true" }) : null,
        );
      }),
    ),
    error ? React.createElement("p", { className: "choice-error", id: errorId, role: "alert" }, error) : null,
  );
}
