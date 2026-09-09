import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createBffAuthAdapter } from "./auth/BffAuthAdapter.js";
import { createAuthRepository } from "./auth/AuthRepository.js";
import { AUTH_ERROR_CODES, AUTH_STATES } from "./auth/AuthPort.js";
import { authTransportFromEnv } from "./auth/authConfig.js";

const response = (status, payload, malformed = false) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (malformed) throw new SyntaxError("invalid json");
    return payload;
  },
});

test("BFF offline and 503 remain provider_unavailable through repository", async () => {
  for (const fetchFn of [
    async () => {
      throw new TypeError("network details must not escape");
    },
    async () =>
      response(503, {
        code: "provider_unavailable",
        detail: "private upstream",
      }),
  ]) {
    const repository = createAuthRepository({
      port: createBffAuthAdapter({ fetchFn }),
    });
    const restored = await repository.restore();
    assert.equal(restored.status, AUTH_STATES.ERROR);
    assert.equal(restored.error, AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE);
    assert.doesNotMatch(
      JSON.stringify(restored),
      /network details|private upstream/,
    );
  }
});

test("malformed successful BFF responses fail closed without exposing PII or tokens", async () => {
  const malformedJson = createBffAuthAdapter({
    fetchFn: async () => response(200, null, true),
  });
  await assert.rejects(
    () => malformedJson.probe(),
    (error) => error.code === AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
  const malformedSession = createBffAuthAdapter({
    fetchFn: async () =>
      response(200, {
        email: "person@example.test",
        access_token: "raw-token",
      }),
  });
  await assert.rejects(
    () => malformedSession.getSession(),
    (error) =>
      error.code === AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE &&
      !/person@example|raw-token/.test(error.message),
  );
});

test("BFF checking probe supports retry and recovery after reload", async () => {
  let attempts = 0;
  const adapter = createBffAuthAdapter({
    fetchFn: async () => {
      attempts += 1;
      return attempts === 1
        ? response(503, { code: "provider_unavailable" })
        : response(401, { code: "session_expired" });
    },
  });
  await assert.rejects(
    () => adapter.probe(),
    (error) => error.code === AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
  assert.deepEqual(await adapter.probe(), { status: "available" });
  assert.equal(attempts, 2);
});

test("runtime and UI declare checking, unavailable retry and missing-config fail closed", () => {
  const main = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
  const dialog = fs.readFileSync(
    new URL("./AuthDialog.jsx", import.meta.url),
    "utf8",
  );
  assert.match(main, /authTransportFromEnv\(import\.meta\.env/);
  assert.match(main, /authTransport === "bff" \? "checking"/);
  assert.match(main, /setProviderStatus\("unavailable"\)/);
  assert.match(dialog, /Проверяем доступность защищённого входа/);
  assert.match(dialog, /Проверить ещё раз/);
  assert.match(dialog, /providerStatus !== "available"/);
});

test("BFF is default and direct auth requires an explicit loopback-only override", () => {
  assert.equal(authTransportFromEnv({}, "stylist.example"), "bff");
  assert.equal(
    authTransportFromEnv(
      { VITE_AUTH_TRANSPORT: "direct", VITE_ALLOW_DIRECT_AUTH: "true" },
      "stylist.example",
    ),
    "bff",
  );
  assert.equal(
    authTransportFromEnv({ VITE_AUTH_TRANSPORT: "direct" }, "localhost"),
    "bff",
  );
  assert.equal(
    authTransportFromEnv(
      { VITE_AUTH_TRANSPORT: "direct", VITE_ALLOW_DIRECT_AUTH: "true" },
      "localhost",
    ),
    "direct",
  );
});

test("BFF adapter forwards photo bytes only through the credentialed same-origin proxy", async () => {
  const calls = [];
  const rawResponse = { ok: true, status: 201 };
  const adapter = createBffAuthAdapter({
    fetchFn: async (...args) => {
      calls.push(args);
      return rawResponse;
    },
  });
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const result = await adapter.authenticatedRequest({
    method: "POST",
    path: "/storage/v1/object/wardrobe-photos/u1/item/idem",
    headers: { "Content-Type": "image/png", "x-upsert": "true" },
    body: blob,
    rawBody: true,
    returnResponse: true,
  });
  assert.equal(result, rawResponse);
  assert.equal(
    calls[0][0],
    "/api/provider/storage/v1/object/wardrobe-photos/u1/item/idem",
  );
  assert.equal(calls[0][1].credentials, "include");
  assert.equal(calls[0][1].headers["X-CSRF-Intent"], "ai-stylist");
  assert.equal(calls[0][1].body, blob);
});
