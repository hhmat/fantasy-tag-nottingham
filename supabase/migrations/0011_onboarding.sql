-- ============================================================================
-- Fantasy Tag Nottingham — 0011_onboarding.sql
-- Resumable 4-step onboarding (UX redesign 2.5).
--   onboarding_step  0-3 = step to resume at, NULL = done (or skipped).
-- Existing users are grandfathered as done; new signups start at step 0.
-- NOTE: migration 0007 replaced the profiles table grant with per-column
-- grants, so the new column must be granted explicitly.
-- ============================================================================

alter table public.profiles add column if not exists onboarding_step integer;

grant select (onboarding_step) on public.profiles to anon, authenticated;

-- New users start onboarding at step 0
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, onboarding_step)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(new.email, '@', 1), 'Player'),
    0
  );
  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
