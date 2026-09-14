import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { verifyVkLaunch } from "./vkAuth.mjs";
import { createVkStagingClient } from "../src/vkStagingClient.js";

// Synthetic-only loopback tests. No VK account, secret file, TLS or cookie jar.
const secret = "vk-live-03-synthetic-only-secret";
const origin = "https://synthetic.example.test";
const wardrobe = [{ id: "synthetic-item", category: "shirt", color: "blue" }];
function launch(user = "11", overrides = {}) {
  const fields = {
    vk_app_id: "123",
    vk_ts: String(Math.floor(Date.now() / 1000)),
    vk_user_id: user,
    ...overrides,
  };
  const canonical = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(fields[k])}`)
    .join("&");
  return `${new URLSearchParams(fields)}&sign=${createHmac("sha256", secret).update(canonical).digest("base64url")}`;
}

async function fixture(t, mode = "synthetic-admission") {
  const prefix = path.join(tmpdir(), "vk-live-03-synthetic-");
  const dir = await mkdtemp(prefix);
  let child,
    base,
    logs = "";
  const stop = async () => {
    if (!child) return;
    const owned = child;
    child = null;
    const exited = once(owned, "exit");
    owned.send("stop");
    const timer = setTimeout(() => owned.kill(), 5000);
    try {
      assert.deepEqual(await exited, [0, null]);
    } finally {
      clearTimeout(timer);
    }
  };
  t.after(async () => {
    await stop();
    assert.ok(path.resolve(dir).startsWith(prefix));
    await rm(dir, { recursive: true });
  });
  const start = async () => {
    const env = {
      STAGING_DATA_DIR: dir,
      STAGING_ORIGIN: origin,
      VK_APP_ID: "123",
      VK_APP_SECRET: secret,
      PORT: "0",
    };
    const source = `
      import {startStagingServer} from ${JSON.stringify(new URL("./stagingServer.mjs", import.meta.url).href)};
      const options = {env: ${JSON.stringify(env)}};
      if (${JSON.stringify(mode)} === 'synthetic-admission') options.budgetAllowed = () => true;
      if (${JSON.stringify(mode)} === 'error') options.budgetAllowed = () => { throw new Error('synthetic-private-budget'); };
      const s = startStagingServer(options);
      s.once('listening', () => process.send(s.address().port));
      process.once('message', () => s.close(() => process.disconnect()));
    `;
    child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    child.stdout.on("data", (v) => {
      logs += v;
    });
    child.stderr.on("data", (v) => {
      logs += v;
    });
    const ready = once(child, "message");
    const died = once(child, "exit").then(() => {
      throw new Error("synthetic_start_failed");
    });
    const timer = setTimeout(() => child?.kill(), 5000);
    try {
      const [port] = await Promise.race([ready, died]);
      base = `http://127.0.0.1:${port}`;
    } finally {
      clearTimeout(timer);
    }
  };
  await start();
  const request = (
    route,
    { cookie = "", method = "GET", body, headers = {} } = {},
  ) =>
    fetch(`${base}/api/staging/${route}`, {
      method,
      body,
      headers: {
        Origin: origin,
        "X-CSRF-Intent": "ai-stylist",
        Cookie: cookie,
        ...headers,
      },
    });
  const login = async (raw = launch()) => {
    const r = await request("vk-session", { method: "POST", body: raw });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie");
    assert.match(
      cookie,
      /Path=\/api\/staging; HttpOnly; Secure; SameSite=None; Max-Age=3600/,
    );
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    return cookie.split(";")[0];
  };
  return {
    request,
    login,
    start,
    stop,
    dir,
    get base() {
      return base;
    },
    get logs() {
      return logs;
    },
  };
}

test("VK-LIVE baseline: denied or failing budget answers before an unsent credential body", async (t) => {
  for (const mode of ["default", "error"]) {
    const f = await fixture(t, mode);
    const status = await new Promise((resolve, reject) => {
      const r = httpRequest(
        `${f.base}/api/staging/vk-session`,
        {
          method: "POST",
          headers: { "Content-Length": "5000" },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      r.on("error", reject);
      r.setTimeout(3000, () =>
        r.destroy(new Error("admission_waited_for_body")),
      );
      r.flushHeaders(); // Deliberately never send credentials or end the body.
    });
    assert.equal(status, 503);
    const db = new DatabaseSync(path.join(f.dir, "sessions.sqlite"));
    try {
      assert.equal(db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
    } finally {
      db.close();
    }
    await f.stop();
    assert.doesNotMatch(
      f.logs,
      /synthetic-private-budget|vk-live-03-synthetic-only-secret/,
    );
  }
});

test("VK-LIVE baseline: signed HTTP launch rejects tampering, encoded duplicates and URL confusion", async (t) => {
  const f = await fixture(t),
    raw = launch();
  for (const bad of [
    raw.replace("vk_user_id=11", "vk_user_id=22"),
    raw.replace("vk_app_id=123", "vk_app_id=124"),
    launch("11", { vk_app_id: "124" }),
    `${raw}&%76k_user_id=11`,
    `${raw}&sign=invalid`,
    raw.replace(/sign=./, "sign=!"),
    `https://synthetic.example.test/?${raw}`,
    launch("11", { vk_ts: String(Math.floor(Date.now() / 1000) - 600) }),
  ]) {
    const r = await f.request("vk-session", { method: "POST", body: bad });
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("set-cookie"), null);
  }
  const cookie = await f.login(
    `?${launch("11", { vk_ref: "synthetic space + Кириллица" })}`,
  );
  assert.equal((await f.request("session", { cookie })).status, 200);
  assert.equal(
    (await f.request(`vk-session?${raw}`, { method: "POST", body: raw }))
      .status,
    404,
  );
  await f.stop();
  assert.doesNotMatch(f.logs, /vk_user_id=|sign=|Кириллица/);
});

test("VK-LIVE baseline: freshness is bounded, signature is replayable inside its window", () => {
  const now = 1800000000000,
    raw = launch("11", { vk_ts: "1800000000" });
  const verify = (delta) =>
    verifyVkLaunch(raw, { secret, appId: "123", now: now + delta * 1000 });
  assert.equal(verify(300).userId, "vk:123:11");
  assert.equal(verify(-30).userId, "vk:123:11");
  assert.throws(() => verify(301), /invalid_vk_launch/);
  assert.throws(() => verify(-31), /invalid_vk_launch/);
  assert.deepEqual(verify(0), verify(0)); // No one-time nonce claim.
});

test("VK-LIVE baseline: two users and two sessions survive restart; logout revokes only its cookie", async (t) => {
  const f = await fixture(t),
    raw = launch("11");
  const a = await f.login(raw),
    a2 = await f.login(raw),
    b = await f.login(launch("22"));
  assert.notEqual(a, a2);
  const put = (cookie, headers = {}) =>
    f.request("wardrobe", {
      cookie,
      method: "PUT",
      body: JSON.stringify(wardrobe),
      headers,
    });
  assert.equal((await put(a, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await put(a, { "X-CSRF-Intent": "" })).status, 403);
  assert.equal((await put(a)).status, 200);
  await f.stop();
  await f.start();
  assert.deepEqual(await (await f.request("wardrobe", { cookie: a2 })).json(), {
    items: wardrobe,
  });
  assert.deepEqual(
    await (
      await f.request("wardrobe", {
        cookie: b,
        headers: { "X-User-Id": "vk:123:11" },
      })
    ).json(),
    { items: [] },
  );
  assert.equal(
    (await f.request("wardrobe?owner=vk:123:11", { cookie: b })).status,
    404,
  );
  assert.equal(
    (await f.request("logout", { cookie: a, method: "POST" })).status,
    200,
  );
  assert.equal((await f.request("wardrobe", { cookie: a })).status, 401);
  assert.equal((await f.request("session", { cookie: a2 })).status, 200);
  const replay = await f.login(raw); // Logout is not global revocation of still-fresh launch.
  assert.notEqual(replay, a);
  assert.deepEqual(
    await (await f.request("capabilities", { cookie: replay })).json(),
    { photos: false },
  );
  assert.equal((await f.request("profile", { cookie: replay })).status, 503);
  assert.equal((await f.request("photos", { cookie: replay })).status, 503);
});

test("VK-LIVE baseline: lost real PUT response stays unknown; explicit readback recovers after restart", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  let writes = 0;
  const client = createVkStagingClient({
    fetchImpl: async (url, options) => {
      const response = await fetch(f.base + url, {
        ...options,
        headers: { ...options.headers, Origin: origin, Cookie: cookie },
      });
      if (options.method === "PUT") {
        writes++;
        await response.arrayBuffer();
        throw new TypeError("synthetic_lost_ack");
      }
      return response;
    },
  });
  t.after(() => client.close());
  await assert.rejects(client.save(wardrobe), /synthetic_lost_ack/);
  assert.equal(writes, 1);
  await f.stop();
  await f.start();
  assert.deepEqual(await client.wardrobe(), { items: wardrobe });
  assert.equal(writes, 1);
});
