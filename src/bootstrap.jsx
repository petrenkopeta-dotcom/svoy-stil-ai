import "./vkLaunchEntry.js";
import React from "react";
import { createRoot } from "react-dom/client";
// The local prototype has its own styles, persistence and telemetry. Do not
// evaluate that graph (or read its stored context) when starting the VK app.
const LegacyApp = React.lazy(() => import("./LegacyApp.jsx"));
const VkStagingApp = React.lazy(() =>
  import("./VkStagingApp.jsx").then((module) => ({
    default: module.VkStagingApp,
  })),
);

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Application root element is missing");

const isVkStaging = import.meta.env.VITE_VK_STAGING === "true";

createRoot(rootElement).render(
  <React.Suspense
    fallback={
      <p role="status" style={{ padding: 28, color: "#1E211D" }}>
        {isVkStaging ? "Проверяем вход…" : "Открываем приложение…"}
      </p>
    }
  >
    {isVkStaging ? <VkStagingApp /> : <LegacyApp />}
  </React.Suspense>,
);
