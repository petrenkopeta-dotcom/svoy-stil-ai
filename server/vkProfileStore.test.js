import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createVkProfileStore } from "./vkProfileStore.mjs";
import { emptyProfileDraft } from "../src/vkProfileContract.js";

test("profile store remains closed without capability and rejects malformed content", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.throws(() => createVkProfileStore({ db }), {
      code: "profile_release_unapproved",
    });
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE name LIKE 'staging_profile%'",
        )
        .get().n,
      0,
    );
    const store = createVkProfileStore({ db, enabled: true });
    assert.throws(
      () =>
        store.write(
          "a",
          { ...emptyProfileDraft(), mutationId: randomUUID(), owner: "b" },
          '"profile-0"',
        ),
      { status: 422 },
    );
    assert.throws(
      () =>
        store.write(
          "a",
          { ...emptyProfileDraft(), mutationId: randomUUID() },
          null,
        ),
      { status: 428 },
    );
    assert.equal(store.read("a").profile, null);
  } finally {
    db.close();
  }
});

test("profile CAS and mutation receipt are atomic and owner-scoped", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createVkProfileStore({ db, enabled: true }),
      draft = { ...emptyProfileDraft(), mutationId: randomUUID() };
    const first = store.write("a", draft, '"profile-0"');
    assert.equal(first.profile.revision, 1);
    assert.deepEqual(store.write("a", draft, '"profile-0"'), first);
    assert.throws(
      () =>
        store.write(
          "a",
          {
            ...draft,
            city: { name: "Москва", region: "Москва", source: "manual" },
          },
          '"profile-0"',
        ),
      { status: 409 },
    );
    assert.throws(
      () =>
        store.write("a", { ...draft, mutationId: randomUUID() }, '"profile-0"'),
      { status: 412 },
    );
    assert.equal(store.write("b", draft, '"profile-0"').profile.revision, 1);
    db.exec(
      "CREATE TRIGGER synthetic_fail_receipt BEFORE INSERT ON staging_profile_receipts BEGIN SELECT RAISE(FAIL, 'synthetic'); END",
    );
    assert.throws(
      () =>
        store.write("a", { ...draft, mutationId: randomUUID() }, '"profile-1"'),
      { code: "storage_unavailable" },
    );
    assert.deepEqual(store.read("a"), first);
    assert.equal(
      db.prepare("SELECT count(*) n FROM staging_profile_receipts").get().n,
      2,
    );
  } finally {
    db.close();
  }
});

test("bounded receipts reject excess, expire only on explicit writes, preserve CAS after expiry", () => {
  const db = new DatabaseSync(":memory:");
  let time = 1;
  try {
    const store = createVkProfileStore({
      db,
      enabled: true,
      now: () => time,
      receiptTtlMs: 10,
      maxReceiptsPerOwner: 1,
      maxReceiptsTotal: 2,
    });
    const original = { ...emptyProfileDraft(), mutationId: randomUUID() };
    store.write("a", original, '"profile-0"');
    assert.throws(
      () =>
        store.write(
          "a",
          { ...original, mutationId: randomUUID() },
          '"profile-1"',
        ),
      { status: 429 },
    );
    store.write("b", original, '"profile-0"');
    assert.throws(() => store.write("c", original, '"profile-0"'), {
      status: 429,
    });
    time = 12;
    assert.equal(
      db.prepare("SELECT count(*) n FROM staging_profile_receipts").get().n,
      2,
    );
    assert.throws(() => store.write("a", original, '"profile-0"'), {
      status: 412,
    });
    store.write("a", { ...original, mutationId: randomUUID() }, '"profile-1"');
    assert.equal(
      db.prepare("SELECT count(*) n FROM staging_profile_receipts").get().n,
      1,
    );
    assert.equal(store.read("a").profile.revision, 2);
  } finally {
    db.close();
  }
});

test("corrupt profile and receipt data never become empty or a successful write", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createVkProfileStore({ db, enabled: true }),
      mutation = { ...emptyProfileDraft(), mutationId: randomUUID() };
    store.write("a", mutation, '"profile-0"');
    db.exec("UPDATE staging_profiles SET value='{}'");
    assert.throws(() => store.read("a"), { code: "storage_unavailable" });
    assert.throws(
      () =>
        store.write(
          "a",
          { ...mutation, mutationId: randomUUID() },
          '"profile-1"',
        ),
      { code: "storage_unavailable" },
    );
    db.exec("UPDATE staging_profile_receipts SET result='invalid-json'");
    assert.throws(() => store.write("a", mutation, '"profile-0"'), {
      code: "storage_unavailable",
    });
  } finally {
    db.close();
  }
});
