import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createStagingApi } from "./stagingApi.mjs";
import { createGarmentPhotoFlow } from "./garmentPhotoFlow.mjs";
import { assessBudget } from "./budgetGuard.mjs";

// Synthetic protocol fixtures, not a model/pixel-safety assertion.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
  "base64",
);
const candidate = (bytes = png) => ({
  label: "shirt",
  png: bytes.toString("base64"),
  safety: {
    checked: true,
    garmentOnly: true,
    personPresent: false,
    facePresent: false,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  },
});
const result = (item = candidate()) => ({
  productionApproved: false,
  candidates: [item],
});
function fixture(
  t,
  worker = { analyze: async () => result(), close() {} },
  options = {},
) {
  const db = new DatabaseSync(":memory:");
  const flow = createGarmentPhotoFlow({
    db,
    worker,
    releaseApproved: () => true,
    ...options,
  });
  t.after(() => {
    flow.close();
    db.close();
  });
  return {
    flow,
    count: () => db.prepare("SELECT COUNT(*) AS n FROM garment_photos").get().n,
  };
}

for (const [name, mutate] of [
  [
    "missing proof",
    (c) => {
      delete c.safety;
    },
  ],
  [
    "digest substitution",
    (c) => {
      c.safety.sha256 = "0".repeat(64);
    },
  ],
  [
    "person detected",
    (c) => {
      c.safety.personPresent = true;
    },
  ],
  [
    "face detected",
    (c) => {
      c.safety.facePresent = true;
    },
  ],
  [
    "unchecked crop",
    (c) => {
      c.safety.checked = false;
    },
  ],
  [
    "background allowed",
    (c) => {
      c.safety.garmentOnly = false;
    },
  ],
  [
    "non PNG",
    (c) => {
      c.png = Buffer.from("synthetic original").toString("base64");
    },
  ],
]) {
  test(`security: ${name} cannot create or persist a candidate`, async (t) => {
    const c = candidate();
    mutate(c);
    const { flow, count } = fixture(t, {
      analyze: async () => result(c),
      close() {},
    });
    await assert.rejects(
      flow.analyze("a", Buffer.from("synthetic source")),
      /cutout_/,
    );
    assert.equal(count(), 0);
  });
}

test("security: re-verification substitution consumes candidate without writing", async (t) => {
  let calls = 0;
  const { flow, count } = fixture(t, {
    analyze: async () =>
      ++calls === 1
        ? result()
        : result(candidate(Buffer.concat([png, Buffer.from("changed")]))),
    close() {},
  });
  const [c] = await flow.analyze("a", Buffer.from("source"));
  await assert.rejects(flow.confirm("b", c.id), /candidate_not_found/);
  assert.equal(calls, 1);
  await assert.rejects(flow.confirm("a", c.id), /confirmation_bytes_changed/);
  await assert.rejects(flow.confirm("a", c.id), /candidate_not_found/);
  assert.equal(count(), 0);
});

for (const reason of ["abort", "logout", "expiry", "release"]) {
  test(`security: ${reason} during confirmation prevents late persistence`, async (t) => {
    let resolve,
      entered,
      now = 1000,
      approved = true;
    const started = new Promise((r) => {
      entered = r;
    });
    const { flow, count } = fixture(
      t,
      {
        analyze: async (_bytes, opts) => {
          if (opts.operation !== "verify") return result();
          entered();
          return new Promise((r) => {
            resolve = r;
          });
        },
        close() {},
      },
      { now: () => now, ttlMs: 100, releaseApproved: () => approved },
    );
    const [c] = await flow.analyze("a", Buffer.from("source"));
    const controller = new AbortController();
    const job = flow.confirm("a", c.id, { signal: controller.signal });
    await started;
    if (reason === "abort") controller.abort();
    if (reason === "logout") flow.cancel("a");
    if (reason === "expiry") now += 100;
    if (reason === "release") approved = false;
    resolve(result());
    await assert.rejects(job, /candidate_expired|photo_release_unapproved/);
    assert.equal(count(), 0);
  });
}

test("security: candidate memory limit rejects output and TTL frees capacity", async (t) => {
  let now = 0;
  const { flow, count } = fixture(t, undefined, {
    maxBytes: png.length,
    ttlMs: 100,
    now: () => now,
  });
  const [old] = await flow.analyze("a", png);
  await assert.rejects(flow.analyze("b", png), /candidate_memory_limit/);
  now = 100;
  await assert.rejects(flow.confirm("a", old.id), /candidate_not_found/);
  assert.equal((await flow.analyze("b", png)).length, 1);
  assert.equal(count(), 0);
});

function apiFixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const records = new Map([
    ["a", { userId: "owner-a", expiresAt: 2000 }],
    ["b", { userId: "owner-b", expiresAt: 2000 }],
  ]);
  let allowed = true,
    calls = 0;
  const handler = createStagingApi({
    db,
    sessions: {
      durable: true,
      get: async (id) => records.get(id),
      delete: async (id) => records.delete(id),
    },
    origin: "https://example.test",
    now: () => 1000000,
    budgetAllowed: () => allowed,
    photoFlow: {
      enabled: () => true,
      analyze: async () => {
        calls++;
        return [];
      },
      confirm: async () => {
        calls++;
        return {};
      },
      cancel() {},
    },
  });
  const request = (route, method = "GET", body, headers = {}) =>
    handler(
      new Request(`https://example.test/api/staging/${route}`, {
        method,
        headers: {
          origin: "https://example.test",
          "x-csrf-intent": "ai-stylist",
          cookie: "stylist_vk=a",
          ...headers,
        },
        ...(body !== undefined ? { body } : {}),
      }),
    );
  return {
    handler,
    request,
    records,
    block: () => {
      allowed = false;
    },
    allow: () => {
      allowed = true;
    },
    calls: () => calls,
  };
}

test("security: auth, CSRF, owner injection and arbitrary crop fail before worker", async (t) => {
  const f = apiFixture(t);
  for (const headers of [{ cookie: "" }, { cookie: "stylist_vk=forged" }])
    assert.equal(
      (await f.request("photos/analyze", "POST", "source", headers)).status,
      401,
    );
  for (const headers of [
    { origin: "https://attacker.test" },
    { "x-csrf-intent": "" },
  ])
    assert.equal(
      (await f.request("photos/analyze", "POST", "source", headers)).status,
      403,
    );
  assert.equal(
    (
      await f.request(
        "photos/confirm",
        "POST",
        JSON.stringify({
          id: "arbitrary",
          png: candidate().png,
          safety: candidate().safety,
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await f.request("photos/analyze?owner=b", "POST", "source")).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        "photos/analyze",
        "POST",
        Buffer.alloc(10 * 1024 * 1024 + 1),
      )
    ).status,
    413,
  );
  assert.equal(f.calls(), 0);
});

test("security: metadata cannot persist image fields, over-limit lists or foreign owner", async (t) => {
  const { request } = apiFixture(t);
  const item = { id: "1", category: "shirt", color: "blue" };
  for (const bad of [
    [{ ...item, photo: candidate().png }],
    [{ ...item, owner: "owner-b" }],
    [{ ...item, color: "data:image/png;base64,AAAA" }],
    Array(101).fill(item),
  ])
    assert.equal(
      (await request("wardrobe", "PUT", JSON.stringify(bad))).status,
      422,
    );
  assert.equal(
    (await request("wardrobe", "PUT", JSON.stringify([item]))).status,
    200,
  );
  assert.deepEqual(
    (
      await (
        await request("wardrobe", "GET", undefined, { cookie: "stylist_vk=b" })
      ).json()
    ).items,
    [],
  );
  assert.equal((await request("wardrobe?owner=owner-a")).status, 400);
});

test("security: budget denies photo work before body consumption", async (t) => {
  const f = apiFixture(t);
  f.block();
  const request = new Request(
    "https://example.test/api/staging/photos/analyze",
    { method: "POST", body: "synthetic source" },
  );
  assert.equal((await f.handler(request)).status, 503);
  assert.equal(request.bodyUsed, false);
  assert.equal(f.calls(), 0);
});

// Requires SEC-01 production fix; intentionally fails on baseline 3b12026.
test("SEC-01: budget block must not prevent session revocation", async (t) => {
  const f = apiFixture(t);
  f.block();
  assert.equal((await f.request("logout", "POST", "")).status, 200);
  assert.equal(f.records.has("a"), false);
  f.allow();
  assert.equal((await f.request("session")).status, 401);
});

test("security: invalid, stale and exact-ceiling billing samples deny", () => {
  const now = Date.UTC(2026, 8, 13);
  const sample = {
    spent: 0,
    mandatoryReserve: 0,
    diskReserve: 0,
    accrualReserve: 0,
    nextOperation: 1,
    observedAt: now,
    month: "2026-09",
  };
  for (const change of [
    { spent: NaN },
    { nextOperation: -1 },
    { spent: Number.MAX_SAFE_INTEGER + 1 },
    { observedAt: now - 60001 },
    { observedAt: now + 1 },
    { month: "2026-08" },
    { spent: 499999 },
  ])
    assert.equal(
      assessBudget({ blocked: false }, { ...sample, ...change }, now).blocked,
      true,
    );
  assert.equal(assessBudget(undefined, sample, now).blocked, true);
});
