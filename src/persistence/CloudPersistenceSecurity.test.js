import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../../supabase/migrations/20260820_mvp_data_15_cloud_persistence.sql", import.meta.url), "utf8");

test("migration is owner-scoped, replay-safe and closes anon access", () => {
  for (const operation of ["select", "insert", "update", "delete"]) assert.match(sql, new RegExp(`for ${operation} to authenticated`));
  assert.match(sql, /auth\.uid\(\).*user_id/);
  assert.match(sql, /revoke all .* from anon/);
  assert.match(sql, /create (unique )?index if not exists/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.doesNotMatch(sql, /service_role/i);
});

test("migration covers outbox domains, idempotency, versions and draft lifecycle", () => {
  for (const table of ["profiles", "stylist_preferences", "user_consents", "wardrobe_items", "saved_outfits", "feedback_events", "shopping_drafts"]) assert.match(sql, new RegExp(table));
  assert.match(sql, /idempotency_key/); assert.match(sql, /version bigint/);
  assert.match(sql, /expires_at/); assert.match(sql, /shopping_drafts_expiry_idx/);
});
