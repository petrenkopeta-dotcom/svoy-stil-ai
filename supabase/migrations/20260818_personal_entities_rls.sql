-- AUTH-08 target-state additions; execute only after owner review.
create table if not exists public.wardrobe_items (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, payload jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.saved_outfits (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, payload jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.feedback_events (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['wardrobe_items','saved_outfits','feedback_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists %I on public.%I',t||'_select_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_insert_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_update_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_delete_own',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t||'_select_own',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t||'_insert_own',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t||'_update_own',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t||'_delete_own',t);
end loop; end $$;
-- Executable private bucket definition.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe-photos', 'wardrobe-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wardrobe_photos_select_own" on storage.objects;
drop policy if exists "wardrobe_photos_insert_own" on storage.objects;
drop policy if exists "wardrobe_photos_update_own" on storage.objects;
drop policy if exists "wardrobe_photos_delete_own" on storage.objects;
create policy "wardrobe_photos_select_own" on storage.objects for select to authenticated using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_photos_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_photos_update_own" on storage.objects for update to authenticated using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_photos_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Signed URL TTL is enforced by the application request (300 seconds), not by RLS.
-- The account-deletion server function must delete this owner prefix before deleting auth.users and return a verified receipt.
