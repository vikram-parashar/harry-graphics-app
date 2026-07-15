-- ─────────────────────────────────────────────────────────────────────
-- Harry Graphics — Expo app migration
-- Run on the SAME Supabase project as the harry-graphics-site web app.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Table for uploaded project data (zip + sheet + metadata) ─────────
--    Mirrors the row inserted by `lib/zip.ts:uploadProjectToHarryGraphics`.
create table if not exists public.id_project_data (
  id          uuid primary key default gen_random_uuid(),
  project_id  text        not null,                 -- local SQLite project_id (string)
  name        text        not null,                 -- project name
  created_on  timestamptz not null default now(),
  updated_on  timestamptz not null default now(),
  data_sheet  jsonb       not null,                 -- { sheetName, columns, rows }
  user_id     uuid        not null references auth.users (id) on delete cascade,
  message     text,
  image_zip   text        not null                  -- public URL of the uploaded .zip
);

-- Convenient newest-first ordering for the dashboard.
create index if not exists id_project_data_user_updated_idx
  on public.id_project_data (user_id, updated_on desc);

-- 2. Storage bucket for uploads ───────────────────────────────────────
--    Bucket name must match STORAGE_BUCKET in lib/supabase.ts.
insert into storage.buckets (id, name, public)
values ('id-project-data', 'id-project-data', true)
on conflict (id) do nothing;

-- 3. RLS policies ─────────────────────────────────────────────────────
--    The web app's `profiles`, `products`, etc. tables already have RLS.
--    We add the same pattern for id_project_data: users can read & write
--    only their own rows.

alter table public.id_project_data enable row level security;

-- Read: only own rows.
drop policy if exists "id_project_data_select_own" on public.id_project_data;
create policy "id_project_data_select_own"
  on public.id_project_data for select
  using (auth.uid() = user_id);

-- Insert: only own rows. (user_id is set by the app to auth.uid().)
drop policy if exists "id_project_data_insert_own" on public.id_project_data;
create policy "id_project_data_insert_own"
  on public.id_project_data for insert
  with check (auth.uid() = user_id);

-- Update: only own rows.
drop policy if exists "id_project_data_update_own" on public.id_project_data;
create policy "id_project_data_update_own"
  on public.id_project_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete: only own rows.
drop policy if exists "id_project_data_delete_own" on public.id_project_data;
create policy "id_project_data_delete_own"
  on public.id_project_data for delete
  using (auth.uid() = user_id);

-- 4. Storage object policies ──────────────────────────────────────────
--    Allow authenticated users to upload + read objects under their own
--    user_id/ prefix.

-- Allow authenticated users to upload to the bucket under their own user_id.
drop policy if exists "id-project-data insert own" on storage.objects;
create policy "id-project-data insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'id-project-data'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read (bucket is public; this matches the public=true flag).
drop policy if exists "id-project-data public read" on storage.objects;
create policy "id-project-data public read"
  on storage.objects for select
  using (bucket_id = 'id-project-data');

-- Allow users to update / delete only their own objects.
drop policy if exists "id-project-data update own" on storage.objects;
create policy "id-project-data update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'id-project-data'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "id-project-data delete own" on storage.objects;
create policy "id-project-data delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'id-project-data'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
