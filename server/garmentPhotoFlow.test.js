import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createGarmentPhotoFlow } from "./garmentPhotoFlow.mjs";

// Protocol test adapter, intentionally not evidence of pixel/model accuracy.
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
  "base64",
);
const safety = {
  sha256: createHash("sha256").update(bytes).digest("hex"),
  checked: true,
  garmentOnly: true,
  personPresent: false,
  facePresent: false,
};
test("server confirmation rechecks exact bytes, isolates owners and persists only output", async () => {
  const db = new DatabaseSync(":memory:");
  const calls = [];
  const worker = {
    analyze: async (data, options) => {
      calls.push(options);
      return {
        candidates: [{ label: "shirt", png: bytes.toString("base64"), safety }],
      };
    },
    close() {},
  };
  const flow = createGarmentPhotoFlow({
    worker,
    db,
    releaseApproved: () => true,
  });
  try {
    const [candidate] = await flow.analyze(
      "owner-a",
      Buffer.from("synthetic original"),
    );
    await assert.rejects(flow.confirm("owner-b", candidate.id), /not_found/);
    const saved = await flow.confirm("owner-a", candidate.id);
    assert.equal(calls[1].operation, "verify");
    assert.deepEqual(flow.read("owner-a", saved.id).bytes, bytes);
    assert.throws(() => flow.read("owner-b", saved.id), /not_found/);
    await assert.rejects(flow.confirm("owner-a", candidate.id), /not_found/);
  } finally {
    flow.close();
    db.close();
  }
});
test("release gate defaults to deny, missing proof never invokes worker", async () => {
  const db = new DatabaseSync(":memory:");
  const flow = createGarmentPhotoFlow({
    db,
    worker: {
      analyze() {
        assert.fail("model must not run");
      },
      close() {},
    },
  });
  try {
    await assert.rejects(flow.analyze("owner", bytes), /release_unapproved/);
  } finally {
    flow.close();
    db.close();
  }
});

test("photo inventory is bounded and owner scoped", () => {
  const db = new DatabaseSync(":memory:");
  const flow = createGarmentPhotoFlow({
    db,
    releaseApproved: () => true,
    worker: { close() {} },
  });
  try {
    const insert = db.prepare("INSERT INTO garment_photos VALUES(?,?,?,?)");
    for (let i = 0; i < 105; i++)
      insert.run(`synthetic-${i}`, "a", bytes, safety.sha256);
    insert.run("other", "b", bytes, safety.sha256);
    const items = flow.list("a");
    assert.equal(items.length, 100);
    assert.equal(items[0].id, "synthetic-104");
    assert.deepEqual(Object.keys(items[0]).sort(), ["id", "sha256"]);
    assert.deepEqual(flow.list("missing"), []);
  } finally {
    flow.close();
    db.close();
  }
});

test("concurrent confirmation consumes a candidate only once", async () => {
  const db = new DatabaseSync(":memory:");
  let releaseVerify;
  const result = () => ({
    candidates: [{ label: "shirt", png: bytes.toString("base64"), safety }],
  });
  const flow = createGarmentPhotoFlow({
    db,
    releaseApproved: () => true,
    worker: {
      close() {},
      analyze: async (input, options) =>
        options.operation === "verify"
          ? new Promise((resolve) => {
              releaseVerify = () => resolve(result());
            })
          : result(),
    },
  });
  try {
    const [candidate] = await flow.analyze("a", bytes);
    const first = flow.confirm("a", candidate.id);
    await assert.rejects(
      flow.confirm("a", candidate.id),
      /candidate_not_found/,
    );
    releaseVerify();
    await first;
    assert.equal(flow.list("a").length, 1);
  } finally {
    flow.close();
    db.close();
  }
});

test("logout cancellation discards late analysis and late verification results", async () => {
  for (const operation of ["analyze", "verify"]) {
    const db = new DatabaseSync(":memory:");
    let release;
    const result = () => ({
      candidates: [{ label: "shirt", png: bytes.toString("base64"), safety }],
    });
    const flow = createGarmentPhotoFlow({
      db,
      releaseApproved: () => true,
      worker: {
        close() {},
        analyze: async (input, options) =>
          (options.operation || "analyze") === operation
            ? new Promise((resolve) => {
                release = () => resolve(result());
              })
            : result(),
      },
    });
    try {
      const candidate =
        operation === "verify"
          ? (await flow.analyze("a", bytes))[0]
          : undefined;
      const pending =
        operation === "verify"
          ? flow.confirm("a", candidate.id)
          : flow.analyze("a", bytes);
      const rejected = assert.rejects(
        pending,
        /photo_cancelled|candidate_expired/,
      );
      flow.cancel("a");
      release();
      await rejected;
      assert.deepEqual(flow.list("a"), []);
      if (candidate)
        await assert.rejects(
          flow.confirm("a", candidate.id),
          /candidate_not_found/,
        );
    } finally {
      flow.close();
      db.close();
    }
  }
});
