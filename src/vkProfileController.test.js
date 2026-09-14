import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createVkProfileController } from "./vkProfileController.js";
import { emptyProfileDraft, profileEtag } from "./vkProfileContract.js";
const reply = (profile = null) =>
  Response.json(
    { profile },
    { headers: { ETag: profileEtag(profile?.revision || 0) } },
  );
const stored = (revision = 1) => ({
  ...emptyProfileDraft(),
  revision,
  updatedAt: 1,
  lastMutationId: randomUUID(),
});

test("AUT08 save requires exactly one revision increment and consistent saved mutation/content", async () => {
  for (const fault of [
    "same_revision",
    "skipped_revision",
    "saved_mutation",
    "saved_content",
  ]) {
    const initial = stored(1),
      mutationId = randomUUID();
    let writes = 0,
      readback = initial;
    const client = createVkProfileController({
      newMutationId: () => mutationId,
      fetchImpl: async (_, options) => {
        if (options.method !== "PUT") return reply(readback);
        writes++;
        const { mutationId: id, ...content } = JSON.parse(options.body);
        readback = {
          ...content,
          revision:
            fault === "same_revision"
              ? 1
              : fault === "skipped_revision"
                ? 3
                : 2,
          updatedAt: 2,
          lastMutationId: id,
        };
        const saved = { ...readback };
        if (fault === "saved_mutation") saved.lastMutationId = randomUUID();
        if (fault === "saved_content")
          saved.city = { name: "Москва", region: "Москва", source: "manual" };
        return reply(saved);
      },
    });
    try {
      await client.load();
      await assert.rejects(
        client.save(),
        { code: "profile_readback_mismatch" },
        fault,
      );
      assert.equal(client.snapshot().state, "unknown", fault);
      assert.equal(client.snapshot().needsReadback, true, fault);
      assert.deepEqual(client.snapshot().confirmed, initial, fault);
      await assert.rejects(client.save(), {
        code: "profile_readback_required",
      });
      assert.equal(writes, 1, fault);
    } finally {
      client.close();
    }
  }
});

test("profile draft/cancel and singleflight GET PUT GET confirm without browser storage", async () => {
  let profile = null;
  const calls = [];
  const client = createVkProfileController({
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/staging/profile");
      calls.push(options.method);
      if (options.method === "PUT") {
        assert.equal(options.headers["If-Match"], '"profile-0"');
        const { mutationId, ...content } = JSON.parse(options.body);
        profile = {
          ...content,
          revision: 1,
          updatedAt: 1,
          lastMutationId: mutationId,
        };
      }
      return reply(profile);
    },
  });
  await client.load();
  const changed = {
    ...emptyProfileDraft(),
    city: { name: "Москва", region: "Москва", source: "manual" },
  };
  client.edit(changed);
  client.cancelDraft();
  assert.equal(client.snapshot().draft.city, null);
  client.edit(changed);
  const one = client.save(),
    two = client.save();
  assert.equal(one, two);
  assert.equal((await one).city.name, "Москва");
  assert.deepEqual(calls, ["GET", "GET", "PUT", "GET"]);
  const snapshot = client.snapshot();
  snapshot.draft.city.name = "changed";
  assert.equal(client.snapshot().draft.city.name, "Москва");
  client.close();
});

test("unknown save outcome blocks blind retry and explicit load recovers; load failures preserve confirmed", async () => {
  let profile = null,
    failRead = false,
    writes = 0;
  const client = createVkProfileController({
    fetchImpl: async (_, options) => {
      if (options.method === "PUT") {
        writes++;
        const { mutationId, ...content } = JSON.parse(options.body);
        profile = {
          ...content,
          revision: 1,
          updatedAt: 1,
          lastMutationId: mutationId,
        };
        throw new TypeError("lost");
      }
      if (failRead) return Response.json({}, { status: 503 });
      return reply(profile);
    },
  });
  await client.load();
  await assert.rejects(client.save());
  assert.equal(client.snapshot().state, "unknown");
  await assert.rejects(client.save(), { code: "profile_readback_required" });
  assert.equal(writes, 1);
  await client.load();
  assert.equal(client.snapshot().confirmed.revision, 1);
  failRead = true;
  await assert.rejects(client.load());
  assert.equal(client.snapshot().confirmed.revision, 1);
  client.close();
});

test("fresh-read conflict prevents PUT; readback mismatch never confirms", async () => {
  let profile = null,
    writes = 0,
    mismatch = false;
  const client = createVkProfileController({
    fetchImpl: async (_, options) => {
      if (options.method === "PUT") {
        writes++;
        return reply(stored(2));
      }
      return reply(mismatch ? stored(2) : profile);
    },
  });
  await client.load();
  profile = stored();
  await assert.rejects(client.save(), { status: 412 });
  assert.equal(writes, 0);
  assert.equal(client.snapshot().needsReadback, true);
  await client.load();
  // Correct pre-read followed by a successful-looking unrelated mutation.
  await assert.rejects(client.save(), { code: "profile_readback_mismatch" });
  assert.equal(client.snapshot().confirmed.revision, 1);
  client.close();
});

test("deadline and identity reset ignore non-cooperative late transports; 401 clears private context", async () => {
  let finish;
  const client = createVkProfileController({
    timeoutMs: 5,
    fetchImpl: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await assert.rejects(client.load(), { code: "profile_timeout" });
  finish(reply(stored()));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.snapshot().confirmed, null);
  client.close();
  let next;
  const reset = createVkProfileController({
    fetchImpl: () =>
      new Promise((resolve) => {
        next = resolve;
      }),
  });
  const pending = reset.load();
  await assert.rejects(reset.save(), { code: "profile_busy" });
  reset.resetIdentity();
  await assert.rejects(pending, { code: "profile_cancelled" });
  next(reply(stored()));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reset.snapshot().state, "idle");
  assert.equal(reset.snapshot().confirmed, null);
  reset.close();
  let unauthorized = false;
  const session = createVkProfileController({
    fetchImpl: async () =>
      unauthorized ? Response.json({}, { status: 401 }) : reply(stored()),
  });
  await session.load();
  unauthorized = true;
  await assert.rejects(session.load(), { status: 401 });
  assert.equal(session.snapshot().confirmed, null);
  assert.equal(session.snapshot().state, "unauthenticated");
  session.close();
});
