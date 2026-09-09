import React, { useId, useRef } from "react";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { nextTabForKey, WARDROBE_TABS } from "./wardrobeA11y.js";

export function WardrobeTabs({ activeTab, counts, onChange, children }) {
  const baseId = useId();
  const refs = useRef({});
  const selectFromKeyboard = (event) => {
    const next = nextTabForKey(activeTab, event.key);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    requestAnimationFrame(() => refs.current[next]?.focus());
  };

  return (
    <>
      <div className="closet-tabs" role="tablist" aria-label="Разделы гардероба">
        {WARDROBE_TABS.map((name) => (
          <button
            key={name}
            ref={(node) => { refs.current[name] = node; }}
            id={`${baseId}-${name}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === name}
            aria-controls={`${baseId}-${name}-panel`}
            tabIndex={activeTab === name ? 0 : -1}
            className={activeTab === name ? "active" : ""}
            onClick={() => onChange(name)}
            onKeyDown={selectFromKeyboard}
          >
            {name === "personal" ? "Мой гардероб" : "Демо-вещи"}{" "}
            <sup>{counts[name]}</sup>
          </button>
        ))}
      </div>
      {WARDROBE_TABS.map((name) => (
        <div
          key={name}
          id={`${baseId}-${name}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-${name}-tab`}
          tabIndex={0}
          hidden={activeTab !== name}
        >
          {activeTab === name ? children : null}
        </div>
      ))}
    </>
  );
}

export function DeleteGarmentDialog({ garment, onCancel, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <AccessibleDialog
      className="modal delete-garment-dialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocus="[data-delete-cancel]"
      onClose={onCancel}
    >
      <h2 id={titleId}>Удалить вещь?</h2>
      <p id={descriptionId}>
        «{garment.name}» будет удалена только из локального гардероба на этом устройстве.
      </p>
      <div className="confirm-actions">
        <button type="button" data-delete-cancel onClick={onCancel}>Отмена</button>
        <button type="button" className="danger" onClick={() => onConfirm(garment)}>
          Удалить
        </button>
      </div>
    </AccessibleDialog>
  );
}
