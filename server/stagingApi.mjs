import { randomUUID } from "node:crypto";
import { verifyVkLaunch } from "./vkAuth.mjs";
import { createVkProfileStore } from "./vkProfileStore.mjs";
import { PROFILE_MAX_BYTES } from "../src/vkProfileContract.js";
import {
  validateVkWardrobe,
  WARDROBE_MAX_BYTES,
} from "../src/vkWardrobeMetadataContract.js";

// Storage failures must not masquerade as invalid input or an empty wardrobe.
const stored = async (operation) => {
  try {
    return await operation();
  } catch {
    throw new Error("storage_unavailable");
  }
};

/** Separate Russian backend contract. No Supabase or external photo forwarding. */
export function createStagingApi({
  db,
  sessions,
  origin,
  secret,
  appId,
  now = Date.now,
  budgetAllowed = () => false,
  photoFlow,
  profileAllowed = () => false,
}) {
  let profileStore;
  if (sessions?.durable !== true || !origin?.startsWith("https://"))
    throw new Error("staging_configuration_required");
  db.exec(
    "CREATE TABLE IF NOT EXISTS staging_wardrobe (owner TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const reply = (status, value, headers = {}) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    });
  return async (request) => {
    try {
      const url = new URL(request.url);
      const logout =
        url.pathname === "/api/staging/logout" &&
        request.method === "POST" &&
        !url.search;
      if (!logout && (await budgetAllowed()) !== true)
        return reply(503, { code: "staging_budget_blocked" });
      if (url.search) return reply(400, { code: "query_not_allowed" });
      if (
        request.method !== "GET" &&
        (request.headers.get("origin") !== origin ||
          request.headers.get("x-csrf-intent") !== "ai-stylist")
      )
        return reply(403, { code: "origin_rejected" });
      if (
        url.pathname === "/api/staging/vk-session" &&
        request.method === "POST"
      ) {
        const launch = await request.text();
        const identity = verifyVkLaunch(launch, { secret, appId, now: now() });
        const id = randomUUID();
        await stored(() =>
          sessions.put(id, {
            ...identity,
            expiresAt: Math.floor(now() / 1000) + 3600,
          }),
        );
        return reply(
          200,
          { userId: identity.userId },
          {
            "Set-Cookie": `stylist_vk=${id}; Path=/api/staging; HttpOnly; Secure; SameSite=None; Max-Age=3600`,
          },
        );
      }
      const id = request.headers
        .get("cookie")
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("stylist_vk="))
        ?.slice(11);
      const session = id && (await stored(() => sessions.get(id)));
      if (
        session &&
        (!Number.isSafeInteger(session.expiresAt) ||
          typeof session.userId !== "string" ||
          !session.userId.startsWith(`vk:${appId}:`) ||
          !/^[1-9]\d*$/.test(session.userId.slice(`vk:${appId}:`.length)))
      )
        throw new Error("storage_unavailable");
      if (!session || session.expiresAt * 1000 <= now())
        return reply(401, { code: "session_required" });
      if (url.pathname === "/api/staging/session" && request.method === "GET")
        return reply(200, { authenticated: true });
      if (url.pathname === "/api/staging/profile") {
        if (profileAllowed() !== true)
          return reply(503, { code: "profile_release_unapproved" });
        if (!["GET", "PUT"].includes(request.method))
          return reply(404, { code: "route_unavailable" });
        // Lazy creation only after authenticated explicit admission; never on normal startup.
        profileStore ??= await stored(() =>
          createVkProfileStore({ db, enabled: true, now }),
        );
        let result;
        if (request.method === "GET")
          result = profileStore.read(session.userId);
        else {
          const raw = await request.text();
          if (new TextEncoder().encode(raw).length > PROFILE_MAX_BYTES)
            return reply(413, { code: "request_too_large" });
          result = profileStore.write(
            session.userId,
            JSON.parse(raw),
            request.headers.get("if-match"),
          );
        }
        return reply(200, { profile: result.profile }, { ETag: result.etag });
      }
      if (
        url.pathname === "/api/staging/capabilities" &&
        request.method === "GET"
      )
        return reply(200, {
          photos: photoFlow?.enabled() === true,
          ...(profileAllowed() === true ? { profiles: true } : {}),
        });
      if (url.pathname === "/api/staging/logout" && request.method === "POST") {
        if ((await request.arrayBuffer()).byteLength > 16384)
          return reply(413, { code: "request_too_large" });
        photoFlow?.cancel(session.userId);
        await stored(() => sessions.delete(id));
        return reply(
          200,
          { signedOut: true },
          {
            "Set-Cookie":
              "stylist_vk=; Path=/api/staging; HttpOnly; Secure; SameSite=None; Max-Age=0",
          },
        );
      }
      if (url.pathname.startsWith("/api/staging/photos")) {
        if (photoFlow?.enabled() !== true)
          return reply(503, { code: "photo_release_unapproved" });
        if (url.pathname === "/api/staging/photos" && request.method === "GET")
          return reply(200, { items: photoFlow.list(session.userId) });
        if (
          url.pathname === "/api/staging/photos/analyze" &&
          request.method === "POST"
        ) {
          const bytes = Buffer.from(await request.arrayBuffer());
          if (!bytes.length || bytes.length > 10 * 1024 * 1024)
            return reply(413, { code: "image_bytes_limit" });
          return reply(200, {
            candidates: await photoFlow.analyze(session.userId, bytes, {
              signal: request.signal,
            }),
          });
        }
        if (
          url.pathname === "/api/staging/photos/confirm" &&
          request.method === "POST"
        ) {
          const value = await request.json();
          if (Object.keys(value).length !== 1 || typeof value.id !== "string")
            return reply(400, { code: "candidate_required" });
          return reply(
            200,
            await photoFlow.confirm(session.userId, value.id, {
              signal: request.signal,
            }),
          );
        }
        const match = url.pathname.match(
          /^\/api\/staging\/photos\/([a-f0-9-]{36})$/,
        );
        if (match && request.method === "GET") {
          const saved = photoFlow.read(session.userId, match[1]);
          return new Response(saved.bytes, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
        return reply(404, { code: "route_unavailable" });
      }
      if (
        url.pathname === "/api/staging/wardrobe" &&
        request.method === "GET"
      ) {
        const items = await stored(() => {
          const row = db
            .prepare("SELECT value FROM staging_wardrobe WHERE owner=?")
            .get(session.userId);
          const value = row ? JSON.parse(row.value) : [];
          if (!validateVkWardrobe(value))
            throw new Error("invalid_stored_wardrobe");
          return value;
        });
        return reply(200, { items });
      }
      if (
        url.pathname === "/api/staging/wardrobe" &&
        request.method === "PUT"
      ) {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > WARDROBE_MAX_BYTES)
          return reply(413, { code: "request_too_large" });
        const items = JSON.parse(raw);
        // A narrow metadata-only schema prevents photo/base64 persistence bypass.
        if (!validateVkWardrobe(items))
          return reply(422, { code: "invalid_wardrobe" });
        await stored(() =>
          db
            .prepare("INSERT OR REPLACE INTO staging_wardrobe VALUES (?,?)")
            .run(session.userId, JSON.stringify(items)),
        );
        return reply(200, { saved: true });
      }
      return reply(404, { code: "route_unavailable" });
    } catch (error) {
      // Only allowlisted protocol errors leave the server; never worker diagnostics.
      const status = {
        profile_release_unapproved: 503,
        profile_precondition_required: 428,
        profile_stale: 412,
        profile_mutation_conflict: 409,
        profile_receipts_full: 429,
        invalid_profile: 422,
        storage_unavailable: 503,
        photo_release_unapproved: 503,
        photo_busy: 409,
        candidate_not_found: 404,
        photo_not_found: 404,
        candidate_expired: 410,
        photo_cancelled: 408,
        cv_deadline_exceeded: 504,
        cv_cancelled: 408,
        cv_worker_faulted: 503,
        cv_runtime_unconfigured: 503,
      }[error.message];
      return reply(status ?? 400, {
        code: status ? error.message : "request_rejected",
      });
    }
  };
}
