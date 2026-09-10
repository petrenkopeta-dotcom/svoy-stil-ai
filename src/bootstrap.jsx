import React from "react";
import { createRoot } from "react-dom/client";
import { ContextProvider } from "./ContextProvider.jsx";
import { App } from "./main.jsx";
const VkStagingApp = React.lazy(() =>
  import("./VkStagingApp.jsx").then((module) => ({
    default: module.VkStagingApp,
  })),
);

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Application root element is missing");

createRoot(rootElement).render(
  <ContextProvider>
    {import.meta.env.VITE_VK_STAGING === "true" ? (
      <React.Suspense fallback={<p>Проверяем вход…</p>}>
        <VkStagingApp />
      </React.Suspense>
    ) : (
      <App />
    )}
  </ContextProvider>,
);
