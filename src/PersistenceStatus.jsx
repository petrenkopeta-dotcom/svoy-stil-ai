import React from "react";
import { persistenceCopy } from "./persistenceState.js";

export function PersistenceStatus({ result, onRetry, className = "persistence-status" }) {
  if (!result) return null;
  const canRetry = result.state === "retryable_error" && typeof onRetry === "function";
  return <p className={className} role={result.state === "failed" || result.state === "conflict" || result.state === "recovery_required" ? "alert" : "status"} aria-live="polite">
    {persistenceCopy[result.state] || persistenceCopy.unsaved}
    {canRetry && <> <button type="button" onClick={onRetry}>Повторить</button></>}
  </p>;
}
