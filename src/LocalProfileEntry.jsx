import React from "react";
import "./LocalProfileEntry.css";

/**
 * Honest entry point for the device-only profile.
 *
 * Authentication and sync deliberately have no props or actions here: neither
 * capability exists in the active local-first application.
 */
export function LocalProfileEntry({ onOpen, avatarIndex = 1, className = "" }) {
  const index = Math.min(9, Math.max(1, Number(avatarIndex) || 1));
  const column = (index - 1) % 3;
  const row = Math.floor((index - 1) / 3);
  return (
    <button
      className={`local-profile-entry ${className}`.trim()}
      type="button"
      aria-label={`Открыть профиль. Аватар ${index}. Данные на устройстве, без аккаунта`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span className="local-profile-avatar" aria-hidden="true" style={{ backgroundPosition: `${column * 50}% ${row * 50}%` }} />
      <span className="local-profile-entry-label">Профиль</span>
    </button>
  );
}
