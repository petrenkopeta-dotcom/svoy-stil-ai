import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";
import { createStagingApi } from "./stagingApi.mjs";

export function startStagingServer({ env = process.env } = {}) {
  if (!env.STAGING_DATA_DIR || !env.VK_APP_SECRET || !env.VK_APP_ID || !env.STAGING_ORIGIN) throw new Error("staging_configuration_required");
  const db = new DatabaseSync(path.join(env.STAGING_DATA_DIR, "metadata.sqlite"));
  const sessions = createSqliteSessionStore({ filename: path.join(env.STAGING_DATA_DIR, "sessions.sqlite") });
  // No opt-in environment bypass: provider billing enforcement is not connected.
  const handler = createStagingApi({ db, sessions, origin: env.STAGING_ORIGIN, secret: env.VK_APP_SECRET, appId: env.VK_APP_ID });
  const server = createServer(async (request, response) => {
    try {
      // Refuse all bodies before reading while the deployment gate is closed.
      const result = await handler(new Request(`http://localhost${request.url}`, { method: "GET" }));
      response.writeHead(result.status, { ...Object.fromEntries(result.headers), Connection: "close" });
      response.end(await result.text());
    } catch { response.writeHead(503, { "Cache-Control": "no-store", Connection: "close" }).end(); }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.on("close", () => { sessions.close(); db.close(); });
  return server.listen(Number(env.PORT || 8788), "127.0.0.1");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startStagingServer();
