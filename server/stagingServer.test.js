import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startStagingServer } from "./stagingServer.mjs";

test("real HTTP listener stays closed without provider budget enforcement", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-http-"));
  let server;
  try {
    server = startStagingServer({ env: { STAGING_DATA_DIR: dir, STAGING_ORIGIN: "https://example.test", VK_APP_ID: "123", VK_APP_SECRET: "synthetic-test-secret", PORT: "0" } });
    await once(server, "listening");
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/staging/vk-session`, { method: "POST", body: "synthetic-input" });
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { code: "staging_budget_blocked" });
    assert.equal(result.headers.get("cache-control"), "no-store");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});
