-- MVP-DATA-15. Replay-safe owner-scoped persistence contract.
create table if not exists public.shopping_drafts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb, version bigint not null default 1 check (version > 0),
  idempotency_key text not null, expires_at timestamptz not null default (now() + interval '30 days'), updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.profiles add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists version bigint not null default 1;
alter table public.profiles add column if not exists idempotency_key text;
alter table public.stylist_preferences add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.stylist_preferences add column if not exists idempotency_key text;
alter table public.user_consents add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.user_consents add column if not exists version bigint not null default 1;
alter table public.user_consents add column if not exists idempotency_key text;

do $$ declare t text; begin foreach t in array array['wardrobe_items','saved_outfits','feedback_events'] loop
  execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
  execute format('alter table public.%I add column if not exists version bigint not null default 1 check (version > 0)', t);
  execute format('alter table public.%I add column if not exists idempotency_key text', t);
  execute format('create unique index if not exists %I on public.%I (user_id, idempotency_key) where idempotency_key is not null', t||'_owner_idempotency_idx', t);
  execute format('create index if not exists %I on public.%I (user_id, updated_at desc)', t||'_owner_updated_idx', t);
end loop; end $$;

create unique index if not exists profiles_owner_idempotency_idx on public.profiles(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists preferences_owner_idempotency_idx on public.stylist_preferences(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists consents_owner_idempotency_idx on public.user_consents(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists shopping_drafts_owner_updated_idx on public.shopping_drafts(user_id, updated_at desc);
create index if not exists shopping_drafts_expiry_idx on public.shopping_drafts(expires_at);

alter table public.shopping_drafts enable row level security;
drop policy if exists "shopping_drafts_select_own" on public.shopping_drafts;
drop policy if exists "shopping_drafts_insert_own" on public.shopping_drafts;
drop policy if exists "shopping_drafts_update_own" on public.shopping_drafts;
drop policy if exists "shopping_drafts_delete_own" on public.shopping_drafts;
create policy "shopping_drafts_select_own" on public.shopping_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy "shopping_drafts_insert_own" on public.shopping_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "shopping_drafts_update_own" on public.shopping_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_drafts_delete_own" on public.shopping_drafts for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.wardrobe_items, public.saved_outfits, public.feedback_events, public.shopping_drafts from anon;
grant select, insert, update, delete on public.wardrobe_items, public.saved_outfits, public.feedback_events, public.shopping_drafts to authenticated;
-- Storage remains private; object names must start with auth.uid(). Photo upload is forbidden by the client until explicit consent.
