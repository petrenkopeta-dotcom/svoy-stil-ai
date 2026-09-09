import { createLocalTelemetryCollector } from "./localCollector.js";

const query = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
export const telemetry = createLocalTelemetryCollector({ environment: query.get("pilotMetrics") === "1" ? "pilot" : "dev" });

if (typeof window !== "undefined") window.__ATELIER_LOCAL_TELEMETRY__ = telemetry;
