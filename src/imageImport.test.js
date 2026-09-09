import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createImageImportController, detectImportMime, IMAGE_IMPORT_CODES, imageFromClipboardApi, imageFromClipboardEvent, imageFromDropEvent, isAnimatedImport, validateImportImage } from "./imageImport.js";

const signatures = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: new Uint8Array([82, 73, 70, 70, 10, 0, 0, 0, 87, 69, 66, 80]),
};
function fakeFile(bytes, type) { return { type, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer, slice: () => ({ arrayBuffer: async () => bytes.buffer }) }; }
async function code(promise) { try { await promise; return null; } catch (error) { return error.code; } }

test("recognizes only supported image signatures", () => {
  assert.equal(detectImportMime(signatures.jpeg), "image/jpeg");
  assert.equal(detectImportMime(signatures.png), "image/png");
  assert.equal(detectImportMime(signatures.webp), "image/webp");
  assert.equal(detectImportMime(new Uint8Array([1, 2, 3])), null);
});

test("rejects animated PNG/WebP policy markers", () => {
  const apng = new Uint8Array([...signatures.png, ...new TextEncoder().encode("acTL")]);
  const webp = new Uint8Array([...signatures.webp, ...new TextEncoder().encode("ANIM")]);
  assert.equal(isAnimatedImport(apng, "image/png"), true);
  assert.equal(isAnimatedImport(webp, "image/webp"), true);
});

test("rejects MIME spoofing, oversized bytes and image bombs before normalization", async () => {
  assert.equal(await code(validateImportImage(fakeFile(signatures.png, "image/jpeg"), { decode: async () => ({ width: 100, height: 100 }) })), IMAGE_IMPORT_CODES.MIME_MISMATCH);
  const large = { ...fakeFile(signatures.jpeg, "image/jpeg"), size: 16 * 1024 * 1024 };
  assert.equal(await code(validateImportImage(large)), IMAGE_IMPORT_CODES.TOO_LARGE);
  assert.equal(await code(validateImportImage(fakeFile(signatures.jpeg, "image/jpeg"), { decode: async () => ({ width: 10000, height: 10000 }) })), IMAGE_IMPORT_CODES.TOO_MANY_PIXELS);
});

test("rejects JPEG image-bomb dimensions from the header without decoding", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x4e, 0x20, 0x4e, 0x20, 0x03, 1, 1, 0, 2, 1, 0, 3, 1, 0]);
  let decoded = false;
  assert.equal(await code(validateImportImage(fakeFile(jpeg, "image/jpeg"), { decode: async () => { decoded = true; return { width: 1, height: 1 }; } })), IMAGE_IMPORT_CODES.TOO_MANY_PIXELS);
  assert.equal(decoded, false);
});

test("bounds decode time", async () => {
  const limits = { maxBytes: 100, maxWidth: 1000, maxHeight: 1000, maxPixels: 1_000_000, decodeTimeoutMs: 5 };
  assert.equal(await code(validateImportImage(fakeFile(signatures.jpeg, "image/jpeg"), { limits, decode: () => new Promise(() => {}) })), IMAGE_IMPORT_CODES.DECODE_TIMEOUT);
});

test("clipboard and drop adapters accept supported images and fail safely", () => {
  const png = fakeFile(signatures.png, "image/png"); let prevented = 0;
  assert.equal(imageFromClipboardEvent({ clipboardData: { items: [{ kind: "string", type: "text/plain" }, { kind: "file", type: "image/png", getAsFile: () => png }] }, preventDefault: () => prevented++ }), png);
  assert.equal(imageFromDropEvent({ dataTransfer: { files: [png] }, preventDefault: () => prevented++ }), png);
  assert.equal(prevented, 2);
  assert.throws(() => imageFromClipboardEvent({ clipboardData: { items: [] } }), { code: IMAGE_IMPORT_CODES.NO_IMAGE });
  assert.throws(() => imageFromDropEvent({ dataTransfer: { files: [{ type: "image/gif" }] } }), { code: IMAGE_IMPORT_CODES.UNSUPPORTED_FORMAT });
});

test("clipboard supports the files fallback and click-driven Clipboard API", async () => {
  const png = fakeFile(signatures.png, "image/png");
  assert.equal(imageFromClipboardEvent({ clipboardData: { items: [], files: [png] }, preventDefault() {} }), png);
  const fromApi = await imageFromClipboardApi({ read: async () => [{ types: ["text/plain", "image/png"], getType: async () => new Blob([signatures.png], { type: "image/png" }) }] });
  assert.equal(fromApi.type, "image/png");
  await assert.rejects(imageFromClipboardApi({ read: async () => { throw new Error("denied"); } }), { code: IMAGE_IMPORT_CODES.PERMISSION_DENIED });
});

test("returns partitioned, network-disabled DTO and revokes object URLs", async () => {
  const revoked = [];
  const controller = createImageImportController({
    normalize: async () => ({ blob: new Blob([signatures.png], { type: "image/png" }), mime: "image/png", width: 800, height: 600, alphaPreserved: true }),
    createObjectURL: () => "blob:preview-1", revokeObjectURL: (url) => revoked.push(url),
  });
  const dto = await controller.import(fakeFile(signatures.png, "image/png"), { provenance: "paste", purpose: "reference", decode: async () => ({ width: 800, height: 600 }) });
  assert.deepEqual({ provenance: dto.provenance, purpose: dto.purpose, partition: dto.storagePartition, network: dto.networkAllowed, stripped: dto.exifGpsStripped, alpha: dto.alphaPreserved }, { provenance: "paste", purpose: "reference", partition: "reference_images", network: false, stripped: true, alpha: true });
  controller.dispose();
  assert.deepEqual(revoked, ["blob:preview-1"]);
});

test("a newer request cancels a stale request", async () => {
  let release, entered; const slow = new Promise((resolve) => { release = resolve; }); const firstEntered = new Promise((resolve) => { entered = resolve; }); let calls = 0;
  const normalize = async () => { calls += 1; if (calls === 1) { entered(); await slow; } return { blob: new Blob([1], { type: "image/jpeg" }), mime: "image/jpeg", width: 10, height: 10 }; };
  const controller = createImageImportController({ normalize, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
  const first = controller.import(fakeFile(signatures.jpeg, "image/jpeg"), { decode: async () => ({ width: 500, height: 500 }) });
  const firstCode = code(first);
  await firstEntered;
  const second = controller.import(fakeFile(signatures.jpeg, "image/jpeg"), { decode: async () => ({ width: 500, height: 500 }) });
  await second; release();
  assert.equal(await firstCode, IMAGE_IMPORT_CODES.CANCELLED);
});

test("standalone UI exposes file, capture, paste, drop and honest clipboard guidance", async () => {
  const source = await readFile(new URL("./ReferenceImageImport.jsx", import.meta.url), "utf8");
  assert.match(source, /accept="image\/\*"/); assert.match(source, /capture="environment"/);
  assert.match(source, /onPaste=/); assert.match(source, /onDrop=/); assert.match(source, />Вставить фото</);
  assert.match(source, /системную команду «Вставить»/);
  assert.match(source, /На iPhone и iPad, если вставка недоступна/);
  assert.match(source, /imageFromClipboardApi/);
});
