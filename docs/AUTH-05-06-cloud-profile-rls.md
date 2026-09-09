# AUTH-05/06 — cloud profile, ownership and RLS specification

Status 2026-08-18: schema/adapters/tests PASS; deployment and live RLS evidence HOLD until an owner-verified Supabase project exists.

Auth identity remains in `auth.users`; verified email is read from the authenticated session and is never user-editable profile metadata. `profiles` owns avatar 01–09 only. `stylist_preferences` owns stylist choices and revision. `user_consents` stores purpose/version/time separately. Every personal table must use a UUID FK to `auth.users(id) on delete cascade`; wardrobe items, outfits, photos, history and feedback use the same `user_id` rule in their own migrations.

The migration enables RLS and defines SELECT/INSERT/UPDATE/DELETE policies using `auth.uid() = user_id`. `anon` gets no table privileges. Client-supplied email, avatar, JSON metadata or JWT `user_metadata` never authorizes access. Storage must use private buckets and owner paths validated by storage RLS; signed URLs are short-lived presentation capabilities, not ownership evidence.

Negative release tests: anonymous access; user A selecting/updating/deleting user B profile, item, photo, history and feedback; forged `user_id`; forged editable metadata; expired/revoked JWT; service-role key absent from browser bundle. Any success is cross-user leakage and AUTH-06 HOLD.

What did we lose? No runtime capability: this is target-state SQL. The design intentionally removes public/anonymous access to all personal records.
