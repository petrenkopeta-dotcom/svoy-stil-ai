import test from "node:test";
import assert from "node:assert/strict";
import {
  validateVkWardrobe,
  WARDROBE_MAX_ITEMS,
  WARDROBE_MAX_BYTES,
} from "./vkWardrobeMetadataContract.js";

const item = (id = "1") => ({ id, category: "рубашка", color: "синий" });
const bytes = (items) => new TextEncoder().encode(JSON.stringify(items)).length;

test("empty and 99/100 items pass, 101 fail without mutation or deduplication", () => {
  assert.equal(WARDROBE_MAX_ITEMS, 100);
  assert.equal(WARDROBE_MAX_BYTES, 16384);
  assert.equal(validateVkWardrobe([]), true);
  for (const count of [99, 100, 101]) {
    const items = Array.from({ length: count }, (_, i) =>
      Object.freeze(item(String(i))),
    );
    const before = JSON.stringify(items);
    Object.freeze(items);
    assert.equal(validateVkWardrobe(items), count <= 100);
    assert.equal(JSON.stringify(items), before);
  }
  assert.equal(validateVkWardrobe([item("1"), item("2")]), true);
  assert.equal(validateVkWardrobe([item(), item()]), false);
});

test("strict schema rejects unsafe values, fields and non-JSON structures", () => {
  const circular = item();
  circular.color = circular;
  for (const invalid of [
    null,
    {},
    "[]",
    [null],
    [[]],
    Array(1),
    [circular],
    [{ ...item(), photo: "AAAA" }],
    [{ ...item(), owner: "2" }],
    [{ ...item(), color: "data:image/png;base64,AAAA" }],
    [{ ...item(), category: "https://example.test" }],
    [{ id: "1", category: "shirt" }],
    [{ ...item(), color: 1 }],
    [{ ...item(), id: "" }],
    [{ ...item(), color: "a".repeat(65) }],
    [{ ...item(), color: "blue\n" }],
    [{ ...item(), color: "<script>" }],
    [Object.assign(Object.create({ extra: true }), item())],
    [{ ...item(), [Symbol("hidden")]: true }],
    [
      {
        ...item(),
        get color() {
          throw new Error("must not read getter");
        },
      },
    ],
  ]) {
    assert.equal(validateVkWardrobe(invalid), false);
  }
  assert.equal(
    validateVkWardrobe([{ id: "1", category: "a".repeat(64), color: "blue" }]),
    true,
  );
});

function atBytes(target) {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    category: "a",
    color: "a",
  }));
  let remaining = target - bytes(items);
  for (const entry of items) {
    for (const field of ["category", "color", "id"]) {
      const count = Math.min(64 - entry[field].length, remaining);
      entry[field] += "a".repeat(count);
      remaining -= count;
    }
  }
  assert.equal(remaining, 0);
  assert.equal(bytes(items), target);
  return items;
}

test("serialized UTF8 byte boundary is inclusive and counts Cyrillic bytes", () => {
  for (const size of [16383, 16384, 16385])
    assert.equal(validateVkWardrobe(atBytes(size)), size <= 16384);
  const items = atBytes(16384);
  items[0].category = "я" + items[0].category.slice(1);
  assert.equal(bytes(items), 16385);
  assert.equal(validateVkWardrobe(items), false);
  assert.equal(validateVkWardrobe([item()]), true);
});
