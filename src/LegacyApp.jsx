import React from "react";
import { ContextProvider } from "./ContextProvider.jsx";
import { App } from "./main.jsx";

export default function LegacyApp() {
  return (
    <ContextProvider>
      <App />
    </ContextProvider>
  );
}
