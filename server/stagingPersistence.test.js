// Reproduce on Node 24.17.0 (Windows or Linux):
// node --test server/stagingPersistence.test.js
// Loopback only, synthetic identities, fresh temporary files; no production gate bypass.
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { startStagingServer } from "./stagingServer.mjs";
import { randomUUID } from "node:crypto";
import { emptyProfileDraft } from "../src/vkProfileContract.js";
import { createVkProfileController } from "../src/vkProfileController.js";
import {
  createVkStagingClient,
  vkJourneyError,
} from "../src/vkStagingClient.js";

const secret = "synthetic-persistence-test-only";
const origin = "https://example.test";
const items = [{ id: "synthetic-1", category: "shirt", color: "blue" }];
const signed = (user = "456", timestamp = Math.floor(Date.now() / 1000)) => {
  const raw = `vk_app_id=123&vk_ts=${timestamp}&vk_user_id=${user}`;
  return `${raw}&sign=${createHmac("sha256", secret).update(raw).digest("base64url")}`;
};

async function fixture(t, { profiles = false } = {}) {
  const dir = await mkdtemp(
    path.join(tmpdir(), "stylist-synthetic-persistence-"),
  );
  const env = {
    STAGING_DATA_DIR: dir,
    STAGING_ORIGIN: origin,
    VK_APP_ID: "123",
    VK_APP_SECRET: secret,
    PORT: "0",
  };
  let server, base;
  const stop = async () => {
    if (server) {
      const old = server;
      server = undefined;
      const exited = once(old, "exit");
      old.send("stop");
      const timer = setTimeout(() => old.kill(), 5000);
      try {
        assert.deepEqual(await exited, [0, null]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true });
  });
  const start = async () => {
    // Actual child process restart, no shared database handles or JS session state.
    const source = `
      import { startStagingServer } from ${JSON.stringify(new URL("./stagingServer.mjs", import.meta.url).href)};
      const server = startStagingServer({ env: ${JSON.stringify(env)}, budgetAllowed: () => true, profileAllowed: () => ${profiles === true} });
      server.once("listening", () => process.send(server.address().port));
      process.once("message", () => server.close(() => process.disconnect()));
    `;
    server = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source],
      { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
    );
    const ready = once(server, "message");
    const stopped = once(server, "exit").then(() => {
      throw new Error("synthetic_bff_start_failed");
    });
    const [port] = await Promise.race([ready, stopped]);
    base = `http://127.0.0.1:${port}`;
  };
  const request = (
    route,
    { cookie = "", method = "GET", body, ...rest } = {},
  ) =>
    fetch(`${base}/api/staging/${route}`, {
      method,
      body,
      headers: {
        Origin: origin,
        "X-CSRF-Intent": "ai-stylist",
        Cookie: cookie,
        ...rest.headers,
      },
    });
  const login = async (launch = signed()) => {
    const response = await request("vk-session", {
      method: "POST",
      body: launch,
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=None/,
    );
    return response.headers.get("set-cookie").split(";")[0];
  };
  const edit = (file, action) => {
    const db = new DatabaseSync(path.join(dir, file));
    try {
      return action(db);
    } finally {
      db.close();
    }
  };
  await start();
  return {
    dir,
    env,
    start,
    stop,
    request,
    login,
    edit,
    get base() {
      return base;
    },
  };
}

test("file-backed HTTP wardrobe survives Node process restart, refresh and logout/relogin with two isolated owners", async (t) => {
  const f = await fixture(t);
  const a = await f.login(),
    b = await f.login(signed("789"));
  assert.deepEqual(await (await f.request("wardrobe", { cookie: a })).json(), {
    items: [],
  });
  assert.equal(
    (
      await f.request("wardrobe", {
        cookie: a,
        method: "PUT",
        body: JSON.stringify(items),
      })
    ).status,
    200,
  );
  await f.stop();
  await f.start();
  assert.equal((await f.request("session", { cookie: a })).status, 200);
  assert.deepEqual(await (await f.request("wardrobe", { cookie: a })).json(), {
    items,
  });
  assert.deepEqual(await (await f.request("wardrobe", { cookie: b })).json(), {
    items: [],
  });
  assert.equal(
    (await f.request("wardrobe?owner=vk:123:456", { cookie: b })).status,
    404,
  );
  assert.equal(
    (
      await f.request("wardrobe", {
        cookie: b,
        method: "PUT",
        body: JSON.stringify([{ ...items[0], owner: "vk:123:456" }]),
      })
    ).status,
    422,
  );
  const bItems = [{ ...items[0], color: "black" }];
  assert.equal(
    (
      await f.request("wardrobe", {
        cookie: b,
        method: "PUT",
        body: JSON.stringify(bItems),
        headers: { "X-User-Id": "vk:123:456" },
      })
    ).status,
    200,
  );
  assert.deepEqual(await (await f.request("wardrobe", { cookie: a })).json(), {
    items,
  });
  assert.deepEqual(await (await f.request("wardrobe", { cookie: b })).json(), {
    items: bItems,
  });
  assert.equal(
    (await f.request("logout", { cookie: a, method: "POST" })).status,
    200,
  );
  assert.equal((await f.request("wardrobe", { cookie: a })).status, 401);
  assert.equal(
    (await f.request("wardrobe", { cookie: a, method: "PUT", body: "[]" }))
      .status,
    401,
  );
  await f.stop();
  await f.start();
  assert.equal((await f.request("session", { cookie: a })).status, 401);
  const relogin = await f.login();
  assert.deepEqual(
    await (await f.request("wardrobe", { cookie: relogin })).json(),
    { items },
  );
});

test("HTTP rejects forged/expired launch and expired sessions without modifying stored wardrobe", async (t) => {
  const f = await fixture(t);
  for (const launch of [
    signed().replace("vk_user_id=456", "vk_user_id=789"),
    signed("456", Math.floor(Date.now() / 1000) - 301),
  ]) {
    const response = await f.request("vk-session", {
      method: "POST",
      body: launch,
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const cookie = await f.login();
  f.edit("sessions.sqlite", (db) =>
    db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1),
  );
  assert.equal((await f.request("session", { cookie })).status, 401);
  assert.equal(
    (
      await f.request("wardrobe", {
        cookie,
        method: "PUT",
        body: JSON.stringify(items),
      })
    ).status,
    401,
  );
  assert.deepEqual(
    await (await f.request("wardrobe", { cookie: await f.login() })).json(),
    { items: [] },
  );
});

test("corrupt stored JSON/schema and missing table return safe unavailable, never empty or successful", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  for (const value of [
    "broken-json",
    "{}",
    '[{"id":"x","category":"shirt","color":"blue","extra":"no"}]',
  ]) {
    f.edit("metadata.sqlite", (db) =>
      db
        .prepare("INSERT OR REPLACE INTO staging_wardrobe VALUES (?,?)")
        .run("vk:123:456", value),
    );
    const response = await f.request("wardrobe", { cookie });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "storage_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  f.edit("metadata.sqlite", (db) => db.exec("DROP TABLE staging_wardrobe"));
  for (const method of ["GET", "PUT"]) {
    const response = await f.request("wardrobe", {
      cookie,
      method,
      ...(method === "PUT" ? { body: JSON.stringify(items) } : {}),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "storage_unavailable" });
  }
});

test("SQLite write lock fails explicitly, recovery retry saves once", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  const lock = new DatabaseSync(path.join(f.dir, "metadata.sqlite"));
  try {
    lock.exec("BEGIN IMMEDIATE");
    const failed = await f.request("wardrobe", {
      cookie,
      method: "PUT",
      body: JSON.stringify(items),
    });
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { code: "storage_unavailable" });
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
  }
  assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
    items: [],
  });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.request("wardrobe", {
          cookie,
          method: "PUT",
          body: JSON.stringify(items),
        })
      ).status,
      200,
    );
  assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
    items,
  });
  assert.equal(
    f.edit(
      "metadata.sqlite",
      (db) => db.prepare("SELECT count(*) n FROM staging_wardrobe").get().n,
    ),
    1,
  );
});

test("lost save acknowledgement/readback stays unconfirmed in real client; refresh recovers committed data", async (t) => {
  const f = await fixture(t);
  let cookie = "",
    lose = "",
    writes = 0;
  const client = createVkStagingClient({
    launch: signed(),
    fetchImpl: async (url, options) => {
      if (options.method === "PUT") writes++;
      const response = await fetch(f.base + url, {
        ...options,
        headers: { ...options.headers, Origin: origin, Cookie: cookie },
      });
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      if (
        (lose === "put" && options.method === "PUT") ||
        (lose === "get" && url.endsWith("wardrobe") && options.method === "GET")
      ) {
        lose = "";
        await response.arrayBuffer(); // Real committed HTTP response deliberately lost in transport seam.
        throw new TypeError("synthetic_connection_lost");
      }
      return response;
    },
  });
  t.after(() => client.close());
  await client.login();
  for (const failure of ["put", "get"]) {
    lose = failure;
    const before = writes;
    await assert.rejects(client.save(items), /synthetic_connection_lost/);
    assert.equal(writes, before + 1); // No automatic write retry.
    await f.stop();
    await f.start();
    assert.deepEqual(await client.wardrobe(), { items });
  }
  assert.deepEqual(await client.save(items), { items });
  assert.equal(
    f.edit(
      "metadata.sqlite",
      (db) => db.prepare("SELECT count(*) n FROM staging_wardrobe").get().n,
    ),
    1,
  );
});

test("corrupt sessions fail safely; corrupt or absent storage prevents listener startup", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  for (const value of [
    "invalid-json",
    "{}",
    JSON.stringify({
      userId: "vk:999:456",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]) {
    f.edit("sessions.sqlite", (db) =>
      db.prepare("UPDATE sessions SET value=?").run(value),
    );
    const response = await f.request("session", { cookie });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "storage_unavailable" });
  }
  await f.stop();
  await writeFile(path.join(f.dir, "sessions.sqlite"), "synthetic-corruption");
  assert.throws(
    () => startStagingServer({ env: f.env }),
    /staging_storage_unavailable/,
  );
  assert.throws(() =>
    startStagingServer({
      env: { ...f.env, STAGING_DATA_DIR: path.join(f.dir, "absent") },
    }),
  );
});

test("storage failure UI message describes wardrobe and requires readback", () => {
  const error = vkJourneyError({ code: "storage_unavailable", status: 503 });
  assert.equal(error.state, "unavailable");
  assert.match(error.message, /Хранилище гардероба/);
  assert.match(error.message, /не подтверждён/);
});

test("HTTP profile gate leaves schema absent; enabled profile survives real process restart and owner isolation", async (t) => {
  const denied = await fixture(t),
    cookie = await denied.login();
  assert.equal((await denied.request("profile", { cookie })).status, 503);
  assert.equal(
    denied.edit(
      "metadata.sqlite",
      (db) =>
        db
          .prepare(
            "SELECT count(*) n FROM sqlite_master WHERE name LIKE 'staging_profile%'",
          )
          .get().n,
    ),
    0,
  );
  const f = await fixture(t, { profiles: true });
  const a = await f.login(),
    b = await f.login(signed("789"));
  assert.equal((await f.request("profile")).status, 401);
  assert.deepEqual(await (await f.request("profile", { cookie: a })).json(), {
    profile: null,
  });
  const mutation = {
    ...emptyProfileDraft(),
    city: { name: "Москва", region: "Москва", source: "manual" },
    mutationId: randomUUID(),
  };
  const saved = await f.request("profile", {
    cookie: a,
    method: "PUT",
    headers: { "If-Match": '"profile-0"' },
    body: JSON.stringify(mutation),
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("etag"), '"profile-1"');
  const expected = await saved.json();
  await f.stop();
  await f.start();
  assert.deepEqual(
    await (await f.request("profile", { cookie: a })).json(),
    expected,
  );
  assert.deepEqual(await (await f.request("profile", { cookie: b })).json(), {
    profile: null,
  });
  assert.equal(
    (await f.request("profile?owner=vk:123:456", { cookie: b })).status,
    404,
  );
  assert.equal(
    (
      await f.request("profile", {
        cookie: b,
        method: "PUT",
        headers: { "If-Match": '"profile-0"' },
        body: JSON.stringify({ ...mutation, owner: "vk:123:456" }),
      })
    ).status,
    422,
  );
  assert.equal(
    (await f.request("logout", { cookie: a, method: "POST" })).status,
    200,
  );
  assert.equal((await f.request("profile", { cookie: a })).status, 401);
  assert.deepEqual(
    await (await f.request("profile", { cookie: await f.login() })).json(),
    expected,
  );
});

test("HTTP two sessions CAS, lost acknowledgement dedup and changed mutation conflict preserve one revision", async (t) => {
  const f = await fixture(t, { profiles: true }),
    a = await f.login(),
    second = await f.login();
  const one = { ...emptyProfileDraft(), mutationId: randomUUID() },
    two = { ...emptyProfileDraft(), mutationId: randomUUID() };
  const put = (cookie, value, etag = '"profile-0"') =>
    f.request("profile", {
      cookie,
      method: "PUT",
      headers: { "If-Match": etag },
      body: JSON.stringify(value),
    });
  const responses = await Promise.all([put(a, one), put(second, two)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 412]);
  const winner = responses[0].status === 200 ? one : two;
  await responses.find((r) => r.status === 200).arrayBuffer(); // Discard real successful acknowledgement.
  await f.stop();
  await f.start();
  const retry = await put(a, winner);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).profile.revision, 1);
  assert.equal(
    (
      await put(a, {
        ...winner,
        city: { name: "Мирный", region: "Якутия", source: "manual" },
      })
    ).status,
    409,
  );
  assert.equal(
    f.edit(
      "metadata.sqlite",
      (db) =>
        db.prepare("SELECT count(*) n FROM staging_profile_receipts").get().n,
    ),
    1,
  );
  const wardrobe = await f.request("wardrobe", { cookie: a });
  assert.deepEqual(await wardrobe.json(), { items: [] });
});

test("HTTP profile bounds, CSRF and corrupt storage fail safely without changing wardrobe", async (t) => {
  const f = await fixture(t, { profiles: true }),
    cookie = await f.login();
  const mutation = { ...emptyProfileDraft(), mutationId: randomUUID() };
  const options = { cookie, method: "PUT", body: JSON.stringify(mutation) };
  assert.equal((await f.request("profile", options)).status, 428);
  assert.equal(
    (
      await f.request("profile", {
        ...options,
        headers: { Origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("profile", {
        ...options,
        body: " ".repeat(16385),
        headers: { "If-Match": '"profile-0"' },
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await f.request("profile", {
        ...options,
        headers: { "If-Match": '"profile-0"' },
      })
    ).status,
    200,
  );
  f.edit("metadata.sqlite", (db) =>
    db.exec("UPDATE staging_profiles SET value='{}'"),
  );
  const bad = await f.request("profile", { cookie });
  assert.equal(bad.status, 503);
  assert.deepEqual(await bad.json(), { code: "storage_unavailable" });
  assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
    items: [],
  });
});

test("profile controller verifies real HTTP save and recovers lost PUT/readback after process restart", async (t) => {
  const f = await fixture(t, { profiles: true }),
    cookie = await f.login();
  let lose = "",
    writes = 0;
  const controller = createVkProfileController({
    fetchImpl: async (url, options) => {
      const response = await fetch(f.base + url, {
        ...options,
        headers: { ...options.headers, Origin: origin, Cookie: cookie },
      });
      if (options.method === "PUT") writes++;
      if (
        (lose === "put" && options.method === "PUT") ||
        (lose === "get" && options.method === "GET")
      ) {
        lose = "";
        await response.arrayBuffer();
        throw new TypeError("synthetic_lost_response");
      }
      if (lose === "readback" && options.method === "PUT") lose = "get";
      return response;
    },
  });
  t.after(() => controller.close());
  await controller.load();
  controller.edit({
    ...emptyProfileDraft(),
    city: { name: "Москва", region: "Москва", source: "manual" },
  });
  await controller.save();
  assert.equal(controller.snapshot().confirmed.revision, 1);
  for (const failure of ["put", "readback"]) {
    lose = failure;
    const before = writes;
    await assert.rejects(controller.save());
    assert.equal(controller.snapshot().state, "unknown");
    await assert.rejects(controller.save(), {
      code: "profile_readback_required",
    });
    assert.equal(writes, before + 1);
    await f.stop();
    await f.start();
    await controller.load();
    assert.equal(controller.snapshot().confirmed.revision, writes);
  }
});

test("HTTP wardrobe metadata boundaries reject duplicates/overflow without changing prior data", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  const put = (body) => f.request("wardrobe", { cookie, method: "PUT", body });
  let expected;
  for (const count of [99, 100]) {
    expected = Array.from({ length: count }, (_, index) => ({
      id: String(index + 1),
      category: "shirt",
      color: "blue",
    }));
    assert.equal((await put(JSON.stringify(expected))).status, 200);
    assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
      items: expected,
    });
  }
  for (const invalid of [
    [...expected, { id: "101", category: "shirt", color: "blue" }],
    [expected[0], expected[0]],
    [{ ...expected[0], owner: "other" }],
  ]) {
    assert.equal((await put(JSON.stringify(invalid))).status, 422);
    assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
      items: expected,
    });
  }
  const unicode = [{ id: "one", category: "Рубашка", color: "Синий" }];
  const raw = JSON.stringify(unicode),
    bytes = Buffer.byteLength(raw);
  assert.equal((await put(raw + " ".repeat(16384 - bytes))).status, 200);
  assert.equal((await put(raw + " ".repeat(16385 - bytes))).status, 413);
  const multibyte = JSON.stringify(
    Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      category: "я".repeat(64),
      color: "ю".repeat(64),
    })),
  );
  assert.ok(multibyte.length < 16384);
  assert.ok(Buffer.byteLength(multibyte) > 16384);
  assert.equal((await put(multibyte)).status, 413);
  assert.deepEqual(await (await f.request("wardrobe", { cookie })).json(), {
    items: unicode,
  });
  f.edit("metadata.sqlite", (db) =>
    db
      .prepare("UPDATE staging_wardrobe SET value=?")
      .run(JSON.stringify([unicode[0], unicode[0]])),
  );
  const corrupt = await f.request("wardrobe", { cookie });
  assert.equal(corrupt.status, 503);
  assert.deepEqual(await corrupt.json(), { code: "storage_unavailable" });
  assert.equal(
    f.edit(
      "metadata.sqlite",
      (db) =>
        JSON.parse(db.prepare("SELECT value FROM staging_wardrobe").get().value)
          .length,
    ),
    2,
  );
});
