import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";
import { createStagingApi } from "./stagingApi.mjs";

export function createTesterAdmission(appId, raw = "[]") {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 4096)
    throw new Error("staging_tester_configuration_invalid");
  let ids;
  try {
    ids = JSON.parse(raw);
  } catch {
    throw new Error("staging_tester_configuration_invalid");
  }
  if (
    !/^[1-9]\d*$/.test(appId || "") ||
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string" || !/^[1-9]\d{0,19}$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("staging_tester_configuration_invalid");
  const owners = new Set(ids.map((id) => `vk:${appId}:${id}`));
  return (owner) => owners.has(owner);
}

export function startStagingServer({
  env = process.env,
  budgetAllowed = () => false,
  testerAllowed,
  photoFlow,
  profileAllowed = () => false,
} = {}) {
  if (
    !env.STAGING_DATA_DIR ||
    !env.VK_APP_SECRET ||
    !env.VK_APP_ID ||
    !env.STAGING_ORIGIN
  )
    throw new Error("staging_configuration_required");
  const configuredOrigin = new URL(env.STAGING_ORIGIN);
  if (
    configuredOrigin.protocol !== "https:" ||
    configuredOrigin.origin !== env.STAGING_ORIGIN ||
    configuredOrigin.username ||
    configuredOrigin.password
  )
    throw new Error("staging_configuration_required");
  testerAllowed ??= createTesterAdmission(
    env.VK_APP_ID,
    env.STAGING_TESTER_IDS || "[]",
  );
  const db = new DatabaseSync(
    path.join(env.STAGING_DATA_DIR, "metadata.sqlite"),
  );
  let sessions, handler;
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000",
    );
    sessions = createSqliteSessionStore({
      filename: path.join(env.STAGING_DATA_DIR, "sessions.sqlite"),
    });
    // No opt-in environment bypass: provider billing enforcement is not connected.
    handler = createStagingApi({
      db,
      sessions,
      origin: env.STAGING_ORIGIN,
      secret: env.VK_APP_SECRET,
      appId: env.VK_APP_ID,
      budgetAllowed,
      testerAllowed,
      photoFlow,
      profileAllowed,
    });
  } catch {
    sessions?.close();
    db.close();
    throw new Error("staging_storage_unavailable");
  }
  let inFlight = 0;
  const server = createServer(
    { maxHeaderSize: 16384 },
    async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (inFlight >= 2) {
        response.writeHead(429, { Connection: "close" }).end();
        return;
      }
      inFlight++;
      const abort = new AbortController();
      const timer = setTimeout(() => {
        abort.abort();
        request.destroy();
      }, 20_000);
      response.once("close", () => {
        inFlight--;
        clearTimeout(timer);
        abort.abort();
      });
      request.once("aborted", () => abort.abort());
      try {
        // Admission is checked before reading a body, then again by the API.
        const logout =
          request.url === "/api/staging/logout" && request.method === "POST";
        if (!logout && (await budgetAllowed()) !== true) {
          response
            .writeHead(503, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              Connection: "close",
            })
            .end(JSON.stringify({ code: "staging_budget_blocked" }));
          return;
        }
        if (
          request.url === "/api/staging/profile" &&
          profileAllowed() !== true
        ) {
          response
            .writeHead(503, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              Connection: "close",
            })
            .end(JSON.stringify({ code: "profile_release_unapproved" }));
          return;
        }
        const photoRequest =
          (request.method === "GET" && request.url === "/api/staging/photos") ||
          /^\/api\/staging\/photos\/(analyze|confirm|[a-f0-9-]{36})$/.test(
            request.url || "",
          );
        if (photoRequest && photoFlow?.enabled() !== true) {
          response.writeHead(503, { Connection: "close" }).end();
          return;
        }
        if (photoRequest) {
          const session = await handler(
            new Request("http://localhost/api/staging/session", {
              headers: request.headers,
            }),
          );
          if (!session.ok) {
            response.writeHead(session.status, { Connection: "close" }).end();
            return;
          }
        }
        const capabilityRequest =
          request.method === "GET" &&
          request.url === "/api/staging/capabilities";
        if (
          !photoRequest &&
          !capabilityRequest &&
          !/^\/api\/staging\/(vk-session|session|wardrobe|logout|profile)$/.test(
            request.url || "",
          )
        ) {
          response.writeHead(404, { Connection: "close" }).end();
          return;
        }
        const limit = request.url.endsWith("/photos/analyze")
          ? 10 * 1024 * 1024
          : 16384;
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > limit) {
            response.writeHead(413, { Connection: "close" }).end();
            return;
          }
          chunks.push(chunk);
        }
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const result = await handler(
          new Request(`http://localhost${request.url}`, {
            method: request.method,
            headers: request.headers,
            signal: abort.signal,
            ...(body ? { body } : {}),
          }),
        );
        response.writeHead(result.status, {
          ...Object.fromEntries(result.headers),
          Connection: "close",
        });
        response.end(Buffer.from(await result.arrayBuffer()));
      } catch {
        response
          .writeHead(503, { "Cache-Control": "no-store", Connection: "close" })
          .end();
      }
    },
  );
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 16;
  server.maxHeadersCount = 64;
  server.keepAliveTimeout = 1000;
  server.on("clientError", (_error, socket) => {
    socket.end(
      "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
  });
  server.on("close", () => {
    photoFlow?.close();
    sessions.close();
    db.close();
  });
  return server.listen(Number(env.PORT || 8788), "127.0.0.1");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startStagingServer();
