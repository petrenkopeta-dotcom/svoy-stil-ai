import React, { createContext, useContext, useMemo, useState } from "react";
import { clearPersistedContext, confirmManualContext, contextLabels, createManualContext, emptyManualContext, loadConsentedContext, persistContext, withContextInStylistRequest } from "./contextAdapter.js";

const StylistContext = createContext(null);

export function ContextProvider({ children, storage = globalThis.localStorage }) {
  const [context, setContextState] = useState(() => loadConsentedContext(storage));
  const setContext = (next) => setContextState(createManualContext(typeof next === "function" ? next(context) : next));
  const value = useMemo(() => ({
    context,
    labels: contextLabels(context),
    setContext,
    confirmContext: (next) => setContextState(confirmManualContext(next)),
    resetContext: () => {
      clearPersistedContext(storage);
      setContextState(emptyManualContext());
    },
    saveContext: (consent, next = context) => persistContext(storage, next, { consent }),
    toStylistRequest: (request) => withContextInStylistRequest(request, context),
  }), [context, storage]);
  return <StylistContext.Provider value={value}>{children}</StylistContext.Provider>;
}

export function useStylistContext() {
  const value = useContext(StylistContext);
  if (!value) throw new Error("useStylistContext must be used inside ContextProvider");
  return value;
}
