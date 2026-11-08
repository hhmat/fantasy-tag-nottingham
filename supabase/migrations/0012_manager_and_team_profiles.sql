-- ============================================================================
-- Fantasy Tag Nottingham — 0012_manager_and_team_profiles.sql
-- Phase 3.1: manager avatars (existing profiles.avatar_url), fantasy-team
-- badges/colours/description, and owner-scoped Supabase Storage uploads.
--
-- Run AFTER migrations 0001–0011. This migration does not alter scoring,
-- squads, fixtures, existing team names, or leaderboard data.
-- ============================================================================

alter table public.fantasy_teams
  add column if not exists badge_url text,
  add column if not exists primary_color text not null default '#FFD54F',
  add column if not exists secondary_color text not null default '#0B3D2E',
  add column if not exists description text not null default '';

-- Named checks are idempotent when this file is accidentally re-run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fantasy_teams_primary_color_hex') then
    alter table public.fantasy_teams add constraint fantasy_teams_primary_color_hex
      check (primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fantasy_teams_secondary_color_hex') then
    alter table public.fantasy_teams add constraint fantasy_teams_secondary_color_hex
      check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fantasy_teams_description_length') then
    alter table public.fantasy_teams add constraint fantasy_teams_description_length
      check (char_length(description) <= 160);
  end if;
end $$;

-- Public reads are intentional: avatars and badges are shown to other managers.
-- Writes are restricted by storage RLS below. Clients crop/compress to JPEG
-- before upload; the bucket rejects anything larger than 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars and badges publicly readable" on storage.objects;
create policy "avatars and badges publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar folder" on storage.objects;
create policy "users upload own avatar folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own avatar folder" on storage.objects;
create policy "users update own avatar folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own avatar folder" on storage.objects;
create policy "users delete own avatar folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

select pg_notify('pgrst', 'reload schema');
