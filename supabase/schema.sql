-- ==============================================================================
-- DROPPY - SUPABASE DATABASE & STORAGE SCHEMA
-- Safe to run in any existing Supabase project (e.g., Fillo) without affecting
-- any existing tables (like profiles) or existing Auth configurations.
-- ==============================================================================

-- 1. Create a dedicated storage bucket for Droppy screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'droppy-screenshots',
  'droppy-screenshots',
  true,
  52428800, -- 50MB per file max
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

-- 2. Create the droppy_screenshots table
create table if not exists public.droppy_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  storage_path text not null,
  public_url text not null,
  width integer default 0,
  height integer default 0,
  size_bytes bigint default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast queries by user and creation order
create index if not exists idx_droppy_screenshots_user_created 
  on public.droppy_screenshots (user_id, created_at desc);

-- 3. Enable Row Level Security (RLS)
alter table public.droppy_screenshots enable row level security;

-- 4. RLS Policies for droppy_screenshots table
-- Users can only read their own screenshots
drop policy if exists "Users can view their own screenshots" on public.droppy_screenshots;
create policy "Users can view their own screenshots"
  on public.droppy_screenshots for select
  using (auth.uid() = user_id);

-- Users can only insert screenshots with their own user_id
drop policy if exists "Users can insert their own screenshots" on public.droppy_screenshots;
create policy "Users can insert their own screenshots"
  on public.droppy_screenshots for insert
  with check (auth.uid() = user_id);

-- Users can only delete their own screenshots
drop policy if exists "Users can delete their own screenshots" on public.droppy_screenshots;
create policy "Users can delete their own screenshots"
  on public.droppy_screenshots for delete
  using (auth.uid() = user_id);

-- 5. Storage RLS Policies for droppy-screenshots bucket
-- Allow public read access to screenshots
drop policy if exists "Public Access for Droppy Screenshots" on storage.objects;
create policy "Public Access for Droppy Screenshots"
  on storage.objects for select
  using (bucket_id = 'droppy-screenshots');

-- Allow authenticated users to upload screenshots to their own user folder
drop policy if exists "Users can upload droppy screenshots" on storage.objects;
create policy "Users can upload droppy screenshots"
  on storage.objects for insert
  with check (
    bucket_id = 'droppy-screenshots' 
    and auth.uid() is not null 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own uploaded screenshots
drop policy if exists "Users can delete own droppy screenshots" on storage.objects;
create policy "Users can delete own droppy screenshots"
  on storage.objects for delete
  using (
    bucket_id = 'droppy-screenshots'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Enable Supabase Realtime for instant screenshot updates
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'droppy_screenshots'
  ) then
    alter publication supabase_realtime add table public.droppy_screenshots;
  end if;
exception
  when others then
    null; -- safe ignore if publication is already active
end $$;
