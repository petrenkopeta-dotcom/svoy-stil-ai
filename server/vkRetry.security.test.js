import test from "node:test";
import assert from "node:assert/strict";
import { createVkStagingClient } from "../src/vkStagingClient.js";

const launch = "vk_app_id=123&vk_ts=1800000000&sign=synthetic-retry-security";

test("security retry: only explicit budget denial retains unchanged launch", async () => {
  const calls = [];
  let denied = true;
  const client = createVkStagingClient({
    launch,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: options.body });
      return denied
        ? Response.json({ code: "staging_budget_blocked" }, { status: 503 })
        : Response.json({});
    },
  });
  try {
    await assert.rejects(client.login(), (error) => error.status === 503);
    await assert.rejects(client.login(), (error) => error.status === 503);
    denied = false;
    await client.login();
    await client.login();
    assert.deepEqual(
      calls.slice(0, 3).map((call) => call.body),
      [launch, launch, launch],
    );
    assert.equal(calls[3].url, "/api/staging/session");
    assert.equal(calls[3].body, undefined);
  } finally {
    client.close();
  }
});

test("security retry: rejection and ambiguous failures cannot replay launch", async () => {
  for (const [status, code] of [
    [400, "request_rejected"],
    [401, "session_required"],
    [500, "staging_budget_blocked"],
    [503, "provider_unavailable"],
    [503, undefined],
    [0, "network"],
  ]) {
    const calls = [];
    const client = createVkStagingClient({
      launch,
      fetchImpl: async (url, options) => {
        calls.push({ url, body: options.body });
        if (calls.length > 1) return Response.json({});
        if (!status) throw new TypeError("synthetic network failure");
        return Response.json({ code }, { status });
      },
    });
    try {
      await assert.rejects(client.login());
      await client.login();
      assert.equal(calls[1].url, "/api/staging/session");
      assert.equal(calls[1].body, undefined);
    } finally {
      client.close();
    }
  }
});

test("security retry: late budget denial cannot restore credentials after logout or close", async () => {
  for (const end of ["logout", "close"]) {
    let finish;
    const calls = [];
    const client = createVkStagingClient({
      launch,
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.endsWith("vk-session"))
          return new Promise((resolve) => {
            finish = () =>
              resolve(
                Response.json(
                  { code: "staging_budget_blocked" },
                  { status: 503 },
                ),
              );
          });
        return Response.json({});
      },
    });
    const pending = assert.rejects(client.login());
    try {
      await client[end]();
      finish();
      await pending;
      if (end === "close") {
        const count = calls.length;
        await assert.rejects(client.login(), /client_closed/);
        assert.equal(calls.length, count);
      } else {
        await client.login();
        assert.equal(calls.at(-1), "/api/staging/session");
      }
      assert.equal(calls.filter((url) => url.endsWith("vk-session")).length, 1);
    } finally {
      finish();
      client.close();
    }
  }
});
