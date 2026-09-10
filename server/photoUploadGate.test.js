import test from "node:test";
import assert from "node:assert/strict";
import { createAuthBff } from "./authBff.mjs";

test("BFF never forwards unvalidated pixels to an external provider", async () => {
  for (const validatePhoto of [undefined, async () => false, async () => { throw new Error("detector_failure"); }]) {
    let uploads = 0;
    const handle = createAuthBff({
      provider: { uploadPhoto: async () => { uploads++; return { etag: "should-not-exist" }; } },
      validatePhoto, allowedOrigins: ["https://example.test"], now: () => 1000000,
      sessions: new Map([["synthetic-session", { userId: "u1", email: "synthetic@example.test", accessToken: "synthetic-token", expiresAt: 2000 }]]),
    });
    const response = await handle(new Request("https://example.test/api/provider/storage/v1/object/wardrobe-photos/u1/item/idem", {
      method: "POST", headers: { Origin: "https://example.test", "X-CSRF-Intent": "ai-stylist", "Content-Type": "image/jpeg", "x-upsert": "true", Cookie: "ai_stylist_session=synthetic-session" }, body: new Uint8Array([255, 216, 255]),
    }));
    assert.ok(response.status >= 400);
    assert.equal(uploads, 0);
    assert.doesNotMatch(await response.text(), /synthetic-token|detector_failure/);
  }
});
