import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSqliteSessionStore } from "./sqliteSessionStore.mjs";

test("sessions survive reopening and enforce expiry and deletion", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stylist-synthetic-session-"));
  let store;
  try {
    const filename = path.join(dir, "session.sqlite");
    store = createSqliteSessionStore({ filename, now: () => 100 });
    store.put("synthetic", { userId: "test-user", expiresAt: 1 });
    store.close();
    store = createSqliteSessionStore({ filename, now: () => 200 });
    assert.equal(store.get("synthetic").userId, "test-user");
    store.delete("synthetic");
    assert.equal(store.get("synthetic"), null);
    store.put("expired", { expiresAt: 1 });
    store.close();
    store = createSqliteSessionStore({ filename, now: () => 1001 });
    assert.equal(store.get("expired"), null);
  } finally { store?.close(); await rm(dir, { recursive: true }); }
});
