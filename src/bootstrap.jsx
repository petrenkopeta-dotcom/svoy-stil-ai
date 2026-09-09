import React from "react";
import { createRoot } from "react-dom/client";
import { ContextProvider } from "./ContextProvider.jsx";
import { App } from "./main.jsx";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Application root element is missing");

createRoot(rootElement).render(
  <ContextProvider>
    <App />
  </ContextProvider>,
);
