import React from "react";
import { PrivacyDataControls } from "./PrivacyDataControls.jsx";

export function LocalProfilePanel(props) {
  return (
    <aside className="local-profile-panel" aria-label="Локальный профиль">
      <PrivacyDataControls {...props} />
    </aside>
  );
}

export { PrivacyDataControls } from "./PrivacyDataControls.jsx";
export { createPrivacyDataController } from "./privacyDataController.js";
