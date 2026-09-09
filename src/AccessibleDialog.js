import React, { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let scrollLockCount = 0;
let previousBodyOverflow = "";

export function getFocusableElements(container) {
  return Array.from(container?.querySelectorAll?.(FOCUSABLE) ?? []).filter(
    (element) => element.getAttribute?.("aria-hidden") !== "true",
  );
}

export function handleDialogKeyDown(event, container, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = container.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function activateDialog(container, onClose, initialFocus) {
  const doc = container.ownerDocument;
  const returnFocus = doc.activeElement;
  const initial = initialFocus?.current ??
    (typeof initialFocus === "string" ? container.querySelector(initialFocus) : null) ??
    getFocusableElements(container)[0] ?? container;
  const onKeyDown = (event) => handleDialogKeyDown(event, container, onClose);

  doc.addEventListener("keydown", onKeyDown);
  if (scrollLockCount++ === 0) {
    previousBodyOverflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
  }
  initial.focus();

  return () => {
    doc.removeEventListener("keydown", onKeyDown);
    if (--scrollLockCount === 0) doc.body.style.overflow = previousBodyOverflow;
    if (returnFocus?.isConnected !== false) returnFocus?.focus?.();
  };
}

export function AccessibleDialog({
  as = "div",
  children,
  className = "modal",
  labelledBy,
  describedBy,
  initialFocus,
  onClose,
  onSubmit,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(
    () => activateDialog(dialogRef.current, () => onCloseRef.current(), initialFocus),
    [initialFocus],
  );

  return React.createElement(
    "div",
    { className: "modal-bg", onMouseDown: (event) => event.target === event.currentTarget && onClose() },
    React.createElement(
      as,
      {
        ref: dialogRef,
        className,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": labelledBy,
        "aria-describedby": describedBy,
        tabIndex: -1,
        onSubmit,
      },
      children,
    ),
  );
}
