import test from "node:test";
import assert from "node:assert/strict";
import { createVkStagingClient } from "./vkStagingClient.js";
test("VK client sends launch only in same-origin body and verifies saved metadata by read-back", async () => {
  const calls = [];
  const items = [{ id: "1", category: "shirt", color: "blue" }];
  const client = createVkStagingClient({
    launch: "vk_user_id=synthetic&sign=synthetic",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () =>
          url.endsWith("wardrobe") && options.method === "GET" ? { items } : {},
      };
    },
  });
  await client.login();
  await client.save(items);
  await client.login();
  assert.equal(calls[0].url, "/api/staging/vk-session");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.body, "vk_user_id=synthetic&sign=synthetic");
  assert.equal(calls.at(-1).url, "/api/staging/session");
  assert.equal(
    calls.some((x) => x.url.includes("sign")),
    false,
  );
});
test("failed read-back never becomes successful save", async () => {
  const client = createVkStagingClient({
    fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }),
  });
  await assert.rejects(client.save([{ id: "1" }]), /readback_mismatch/);
});

test("photo gate denies before any image is transmitted", async () => {
  const calls = [];
  const client = createVkStagingClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ photos: false });
    },
  });
  await assert.rejects(
    client.analyze(new Blob(["synthetic"], { type: "image/png" })),
    /photo_release_unapproved/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body, undefined);
  client.close();
});
test("timeout, unavailable and errors remain distinct and closed client cannot send", async () => {
  const { vkJourneyError } = await import("./vkStagingClient.js");
  const client = createVkStagingClient({
    timeoutMs: 5,
    fetchImpl: async (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      ),
  });
  await assert.rejects(
    client.wardrobe(),
    (error) => vkJourneyError(error).state === "timeout",
  );
  assert.equal(vkJourneyError({ status: 503 }).state, "unavailable");
  assert.equal(vkJourneyError({ status: 400 }).state, "error");
  client.close();
  await assert.rejects(client.login(), /client_closed/);
});
test("photo read-back mismatch cannot report a successful confirmation", async () => {
  const client = createVkStagingClient({
    fetchImpl: async (url) =>
      url.endsWith("confirm")
        ? Response.json({
            id: "00000000-0000-0000-0000-000000000000",
            sha256: "0".repeat(64),
          })
        : new Response("synthetic changed bytes"),
  });
  await assert.rejects(client.confirm("candidate"), /photo_readback_mismatch/);
  client.close();
});
