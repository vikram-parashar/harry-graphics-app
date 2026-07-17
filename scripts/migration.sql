create table if not exists public.id_project_data (
  id          uuid primary key default gen_random_uuid(),
  project_id  text        not null,                 
  name        text        not null,                
  created_on  timestamptz not null default now(),
  updated_on  timestamptz not null default now(),
  data_sheet  jsonb       not null,               
  user_id     uuid        not null references auth.users (id) on delete cascade,
  message     text,
  image_zip   text        not null               
);
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.id_project_data
TO authenticated;

create index if not exists id_project_data_user_updated_idx
  on public.id_project_data (user_id, updated_on desc);

insert into storage.buckets (id, name, public)
values ('id-project-data', 'id-project-data', true)
on conflict (id) do nothing;

alter table public.id_project_data enable row level security;

drop policy if exists "id_project_data_select_own" on public.id_project_data;
create policy "id_project_data_select_own"
  on public.id_project_data for select
  using (auth.uid() = user_id);

drop policy if exists "id_project_data_insert_own" on public.id_project_data;
create policy "id_project_data_insert_own"
  on public.id_project_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "id_project_data_update_own" on public.id_project_data;
create policy "id_project_data_update_own"
  on public.id_project_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "id_project_data_delete_own" on public.id_project_data;
create policy "id_project_data_delete_own"
  on public.id_project_data for delete
  using (auth.uid() = user_id);

drop policy if exists "id-project-data insert own" on storage.objects;
create policy "id-project-data insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'id-project-data'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "id-project-data public read" on storage.objects;
create policy "id-project-data public read"
  on storage.objects for select
  using (bucket_id = 'id-project-data');

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
