# AUTH-07 — local-to-cloud migration

Status: contract/tests PASS; live cloud run pending provider. After verified email, show counts for wardrobe, outfits, learning and photos. Photos are off by default and require a separate explicit consent. Upserts use stable per-domain idempotency keys; replay skips completed keys. Conflict policy is explicit `newer_updated_at_wins` with a reported resolution, never silent duplication. Local source is preserved on success and every error; deletion is a separate later user action. Tests cover preview, photo consent, replay/double-submit, conflict, quota/offline failure and source preservation.

What did we lose? Nothing is deleted. Automatic photo migration is intentionally unavailable without consent.
