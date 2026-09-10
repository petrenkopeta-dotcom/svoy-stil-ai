import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";
import { createStagingApi } from "./stagingApi.mjs";

export function startStagingServer({ env = process.env, budgetAllowed = () => false, photoFlow } = {}) {
  if (!env.STAGING_DATA_DIR || !env.VK_APP_SECRET || !env.VK_APP_ID || !env.STAGING_ORIGIN) throw new Error("staging_configuration_required");
  const db = new DatabaseSync(path.join(env.STAGING_DATA_DIR, "metadata.sqlite"));
  const sessions = createSqliteSessionStore({ filename: path.join(env.STAGING_DATA_DIR, "sessions.sqlite") });
  // No opt-in environment bypass: provider billing enforcement is not connected.
  const handler = createStagingApi({ db, sessions, origin: env.STAGING_ORIGIN, secret: env.VK_APP_SECRET, appId: env.VK_APP_ID, budgetAllowed, photoFlow });
  let inFlight = 0;
  const server = createServer(async (request, response) => {
    if (inFlight >= 2) { response.writeHead(429, { Connection: "close" }).end(); return; }
    inFlight++;
    const abort = new AbortController();
    const timer = setTimeout(() => { abort.abort(); request.destroy(); }, 20_000);
    response.once("close", () => { inFlight--; clearTimeout(timer); abort.abort(); });
    request.once("aborted", () => abort.abort());
    try {
      // Admission is checked before reading a body, then again by the API.
      if (await budgetAllowed() !== true) {
        response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store", Connection: "close" }).end(JSON.stringify({ code: "staging_budget_blocked" }));
        return;
      }
      const photoRequest = /^\/api\/staging\/photos\/(analyze|confirm|[a-f0-9-]{36})$/.test(request.url || "");
      if (photoRequest && photoFlow?.enabled() !== true) { response.writeHead(503, { Connection: "close" }).end(); return; }
      if (photoRequest) {
        const session = await handler(new Request("http://localhost/api/staging/session", { headers: request.headers }));
        if (!session.ok) { response.writeHead(session.status, { Connection: "close" }).end(); return; }
      }
      if (!photoRequest && !/^\/api\/staging\/(vk-session|session|wardrobe|logout)$/.test(request.url || "")) {
        response.writeHead(404, { Connection: "close" }).end(); return;
      }
      const limit = request.url.endsWith("/photos/analyze") ? 10 * 1024 * 1024 : 16384;
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) { response.writeHead(413, { Connection: "close" }).end(); return; }
        chunks.push(chunk);
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const result = await handler(new Request(`http://localhost${request.url}`, { method: request.method, headers: request.headers, signal: abort.signal, ...(body ? { body } : {}) }));
      response.writeHead(result.status, { ...Object.fromEntries(result.headers), Connection: "close" });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(503, { "Cache-Control": "no-store", Connection: "close" }).end(); }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.on("close", () => { photoFlow?.close(); sessions.close(); db.close(); });
  return server.listen(Number(env.PORT || 8788), "127.0.0.1");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startStagingServer();
