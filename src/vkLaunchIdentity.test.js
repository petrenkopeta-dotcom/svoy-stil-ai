import test from "node:test";
import assert from "node:assert/strict";
import { createVkStagingClient } from "./vkStagingClient.js";
const identity = { authenticated: true, userId: "vk:123:2" };
for (const scenario of [
  "lost",
  "mismatch",
  "missing",
  "unauthenticated",
  "401",
  "get-budget",
  "timeout",
]) {
  test(`launch B cannot restore old session A after ${scenario}`, async () => {
    const calls = [];
    const client = createVkStagingClient({
      launch: "synthetic-B",
      timeoutMs: 5,
      fetchImpl: async (url, options) => {
        calls.push(url);
        assert.equal(options.referrerPolicy, "no-referrer");
        assert.equal(options.redirect, "error");
        if (url.endsWith("vk-session")) {
          if (scenario === "lost") throw new TypeError("lost");
          if (scenario === "timeout")
            return new Promise((_, reject) =>
              options.signal.addEventListener("abort", () =>
                reject(new Error("aborted")),
              ),
            );
          return Response.json(identity);
        }
        if (scenario === "401") return Response.json({}, { status: 401 });
        if (scenario === "get-budget")
          return Response.json(
            { code: "staging_budget_blocked" },
            { status: 503 },
          );
        return Response.json(
          scenario === "missing"
            ? { authenticated: true }
            : scenario === "unauthenticated"
              ? { ...identity, authenticated: false }
              : { ...identity, userId: "vk:123:1" },
        );
      },
    });
    await assert.rejects(client.login(), { code: "vk_launch_reopen_required" });
    const count = calls.length;
    await assert.rejects(client.login(), { code: "vk_launch_reopen_required" });
    assert.equal(calls.length, count);
    assert.equal(calls.filter((x) => x.endsWith("vk-session")).length, 1);
    client.close();
  });
}
test("concurrent login exchanges once and verifies accepted cookie identity", async () => {
  const calls = [];
  const client = createVkStagingClient({
    launch: "synthetic",
    fetchImpl: async (url) => {
      calls.push(url);
      return Response.json(identity);
    },
  });
  const one = client.login(),
    two = client.login();
  assert.equal(one, two);
  await Promise.all([one, two]);
  await client.login();
  assert.deepEqual(calls, [
    "/api/staging/vk-session",
    "/api/staging/session",
    "/api/staging/session",
  ]);
  client.close();
});
test("late successful exchange after logout cannot verify or restore identity", async () => {
  let finish;
  const calls = [];
  const client = createVkStagingClient({
    launch: "synthetic",
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("vk-session"))
        return new Promise((resolve) => {
          finish = () => resolve(Response.json(identity));
        });
      return Response.json({ signedOut: true });
    },
  });
  const login = assert.rejects(client.login());
  await client.logout();
  finish();
  await login;
  await assert.rejects(client.login(), /reopen_required/);
  assert.deepEqual(calls, ["/api/staging/vk-session", "/api/staging/logout"]);
  client.close();
});
test("oversized or unredacted launch never sends a request", async () => {
  for (const options of [
    { launch: "x".repeat(8193) },
    { launch: "synthetic", launchError: "vk_launch_redaction_failed" },
  ]) {
    let count = 0;
    const client = createVkStagingClient({
      ...options,
      fetchImpl: async () => {
        count++;
        return Response.json(identity);
      },
    });
    await assert.rejects(client.login());
    await assert.rejects(client.login());
    assert.equal(count, 0);
    client.close();
  }
});
test("direct URL requires a structurally confirmed server session", async () => {
  for (const value of [
    {},
    { authenticated: false, userId: "vk:123:2" },
    { authenticated: true },
  ]) {
    const client = createVkStagingClient({
      fetchImpl: async () => Response.json(value),
    });
    await assert.rejects(client.login(), {
      code: "vk_session_missing",
      status: 401,
    });
    client.close();
  }
});
