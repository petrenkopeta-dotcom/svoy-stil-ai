import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { startStagingServer } from "../server/stagingServer.mjs";

// Separate loopback listener: never accepts photos, credentials or diagnostics.
export function createStatusServer() {
  const server = createServer((request, response) => {
    const health = request.method === "GET" && request.url === "/healthz";
    const ready = request.method === "GET" && request.url === "/readyz";
    response.writeHead(health ? 200 : ready ? 503 : 404, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Connection: "close",
    });
    response.end(
      JSON.stringify(
        health
          ? { live: true }
          : ready
            ? { ready: false }
            : { code: "not_found" },
      ),
    );
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.maxConnections = 8;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const app = startStagingServer(); // Budget and photo defaults remain denied.
    const status = createStatusServer();
    const stop = () => {
      status.close();
      app.close();
      setTimeout(() => {
        app.closeAllConnections();
        status.closeAllConnections();
        process.exitCode = 1;
      }, 21_000).unref();
    };
    for (const server of [app, status])
      server.on("error", () => {
        process.exitCode = 1;
        stop();
      });
    app.once("listening", () => status.listen(8789, "127.0.0.1"));
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } catch {
    // Never print configuration values or exception objects.
    process.stderr.write("server_start_failed\n");
    process.exitCode = 1;
  }
}
