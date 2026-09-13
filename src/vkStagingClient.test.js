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

test("lost confirm response or lost read-back is recoverable without another saved row", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { createGarmentPhotoFlow } =
    await import("../server/garmentPhotoFlow.mjs");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
    "base64",
  );
  const safety = {
    sha256: createHash("sha256").update(png).digest("hex"),
    checked: true,
    garmentOnly: true,
    personPresent: false,
    facePresent: false,
  };
  for (const failure of ["confirm", "read-back"]) {
    const db = new DatabaseSync(":memory:");
    const flow = createGarmentPhotoFlow({
      db,
      releaseApproved: () => true,
      worker: {
        close() {},
        async analyze(bytes) {
          assert.deepEqual(bytes, png);
          return {
            candidates: [
              { label: "shirt", png: png.toString("base64"), safety },
            ],
          };
        },
      },
    });
    let drop = true;
    const client = createVkStagingClient({
      fetchImpl: async (url, options) => {
        if (url.endsWith("confirm")) {
          let value;
          try {
            value = await flow.confirm("a", JSON.parse(options.body).id);
          } catch {
            return Response.json(
              { code: "candidate_not_found" },
              { status: 404 },
            );
          }
          if (drop && failure === "confirm") {
            drop = false;
            throw new TypeError("synthetic lost response");
          }
          return Response.json(value);
        }
        if (url.endsWith("photos"))
          return Response.json({ items: flow.list("a") });
        if (drop && failure === "read-back") {
          drop = false;
          throw new TypeError("synthetic lost read-back");
        }
        return new Response(flow.read("a", url.split("/").at(-1)).bytes);
      },
    });
    try {
      const [candidate] = await flow.analyze("a", png);
      await assert.rejects(client.confirm(candidate.id), /synthetic lost/);
      await assert.rejects(
        client.confirm(candidate.id),
        (error) => error.status === 404,
      );
      const { items } = await client.photos();
      assert.equal(items.length, 1);
      assert.deepEqual(
        Buffer.from(
          await (await client.readPhoto(items[0])).blob.arrayBuffer(),
        ),
        png,
      );
      assert.equal(flow.list("a").length, 1);
    } finally {
      client.close();
      flow.close();
      db.close();
    }
  }
});

test("budget-denied launch retries unchanged, expires server-side, and clears on logout", async () => {
  const { vkJourneyError } = await import("./vkStagingClient.js");
  const launch = "vk_ts=1800000000&sign=synthetic";
  const calls = [];
  let status = 503;
  const client = createVkStagingClient({
    launch,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: options.body });
      return Response.json(
        status === 503
          ? { code: "staging_budget_blocked" }
          : status === 400
            ? { code: "request_rejected" }
            : {},
        { status },
      );
    },
  });
  await assert.rejects(client.login(), (error) => error.status === 503);
  status = 400; // Server rejects the original expired timestamp; no client renewal.
  await assert.rejects(client.login(), (error) =>
    vkJourneyError(error).message.includes("заново из VK"),
  );
  assert.deepEqual(
    calls.slice(0, 2).map((call) => call.body),
    [launch, launch],
  );
  status = 200;
  await client.login();
  assert.equal(calls.at(-1).url, "/api/staging/session");
  client.close();

  let finishLogin;
  const pendingCalls = [];
  const pendingClient = createVkStagingClient({
    launch,
    fetchImpl: async (url) => {
      pendingCalls.push(url);
      if (url.endsWith("vk-session"))
        return new Promise((resolve) => {
          finishLogin = () =>
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
  const pending = assert.rejects(pendingClient.login());
  await pendingClient.logout();
  finishLogin();
  await pending;
  await pendingClient.login();
  assert.equal(pendingCalls.at(-1), "/api/staging/session");
  pendingClient.close();
});

test("cancel aborts pending work but leaves authenticated client available for read-back", async () => {
  let requestSignal;
  const client = createVkStagingClient({
    fetchImpl: async (url, options) => {
      if (url.endsWith("capabilities")) return Response.json({ photos: true });
      if (url.endsWith("analyze"))
        return new Promise((resolve, reject) => {
          requestSignal = options.signal;
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
        });
      return Response.json({ items: [] });
    },
  });
  const pending = assert.rejects(
    client.analyze(new Blob(["synthetic"], { type: "image/png" })),
    /cancelled/,
  );
  while (!requestSignal) await new Promise((resolve) => setImmediate(resolve));
  client.cancel();
  await pending;
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(await client.wardrobe(), { items: [] });
  client.close();
});
