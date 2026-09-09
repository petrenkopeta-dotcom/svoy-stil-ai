-- AUTH-05/06 target-state specification. Apply only in an owner-verified Supabase project.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_index smallint not null default 1 check (avatar_index between 1 and 9),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.stylist_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb, revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.user_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null, policy_version text not null, granted_at timestamptz not null,
  revoked_at timestamptz, primary key (user_id, purpose, policy_version)
);

alter table public.profiles enable row level security;
alter table public.stylist_preferences enable row level security;
alter table public.user_consents enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "preferences_select_own" on public.stylist_preferences;
drop policy if exists "preferences_insert_own" on public.stylist_preferences;
drop policy if exists "preferences_update_own" on public.stylist_preferences;
drop policy if exists "preferences_delete_own" on public.stylist_preferences;
drop policy if exists "consents_select_own" on public.user_consents;
drop policy if exists "consents_insert_own" on public.user_consents;
drop policy if exists "consents_update_own" on public.user_consents;
drop policy if exists "consents_delete_own" on public.user_consents;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_select_own" on public.stylist_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_insert_own" on public.stylist_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences_update_own" on public.stylist_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences_delete_own" on public.stylist_preferences for delete to authenticated using ((select auth.uid()) = user_id);
create policy "consents_select_own" on public.user_consents for select to authenticated using ((select auth.uid()) = user_id);
create policy "consents_insert_own" on public.user_consents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "consents_update_own" on public.user_consents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "consents_delete_own" on public.user_consents for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.stylist_preferences, public.user_consents from anon;
grant select, insert, update, delete on public.profiles, public.stylist_preferences, public.user_consents to authenticated;
