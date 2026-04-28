-- =============================================================================
-- Repair: missing / unlinked eg_profiles rows
--
-- Run this ONLY if, after fix_profiles_coaches_rls_recursion.sql, the Admin
-- Coaches & Roles page still shows 0 users.
--
-- What this does:
--   1. INSERT missing eg_profiles rows for any auth.users that have no row yet.
--      Uses ON CONFLICT DO NOTHING — existing rows are never overwritten.
--   2. INSERT missing profiles rows (legacy mirror) the same way.
--   3. Reports how many rows exist in each table and how many have team_id set.
--
-- What this does NOT do:
--   - Does not assign teams (we don't know which coach belongs to which team).
--   - Does not overwrite roles.
--   - Does not delete anything.
--   - Does not touch auth.users.
--
-- After running this:
--   - All auth users will have a profile row.
--   - Profiles with team_id = NULL will appear in Admin → Coaches & Roles
--     but will still show Coach TBC on fixture cards.
--   - You must manually re-assign teams to coaches via Admin → Coaches & Roles.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Backfill eg_profiles from auth.users
--    Only inserts rows where user_id is not already present.
-- ---------------------------------------------------------------------------
insert into public.eg_profiles (user_id, email, display_name)
select
  au.id                                            as user_id,
  au.email                                         as email,
  coalesce(
    au.raw_user_meta_data->>'display_name',
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  )                                                as display_name
from auth.users au
where not exists (
  select 1 from public.eg_profiles ep where ep.user_id = au.id
)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Backfill legacy profiles table from auth.users (same logic)
-- ---------------------------------------------------------------------------
insert into public.profiles (user_id, email, display_name)
select
  au.id,
  au.email,
  coalesce(
    au.raw_user_meta_data->>'display_name',
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  )
from auth.users au
where not exists (
  select 1 from public.profiles p where p.user_id = au.id
)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Sync PSN from auth metadata where PSN is currently blank
-- ---------------------------------------------------------------------------
update public.eg_profiles ep
set psn = au.raw_user_meta_data->>'psn'
from auth.users au
where ep.user_id = au.id
  and (ep.psn is null or ep.psn = '')
  and (au.raw_user_meta_data->>'psn') is not null
  and (au.raw_user_meta_data->>'psn') <> '';

-- ---------------------------------------------------------------------------
-- 4) Report current state (informational — no changes)
-- ---------------------------------------------------------------------------
do $$
declare
  v_total_auth     int;
  v_total_eg       int;
  v_total_profiles int;
  v_with_team_eg   int;
  v_with_team_p    int;
begin
  select count(*) into v_total_auth     from auth.users;
  select count(*) into v_total_eg       from public.eg_profiles;
  select count(*) into v_total_profiles from public.profiles;
  select count(*) into v_with_team_eg   from public.eg_profiles where team_id is not null;
  select count(*) into v_with_team_p    from public.profiles     where team_id is not null;

  raise notice '=== Profile Repair Report ===';
  raise notice 'auth.users:                   %', v_total_auth;
  raise notice 'eg_profiles total:            %', v_total_eg;
  raise notice 'profiles total:               %', v_total_profiles;
  raise notice 'eg_profiles with team_id:     %', v_with_team_eg;
  raise notice 'profiles with team_id:        %', v_with_team_p;

  if v_with_team_eg = 0 then
    raise notice '⚠️  No eg_profiles rows have team_id set.';
    raise notice '   This means the season-close operation cleared team assignments.';
    raise notice '   Go to Admin → Coaches & Roles and re-assign each coach to their team.';
  end if;
end $$;

commit;

-- =============================================================================
-- HOW TO RUN:
--   1. FIRST run fix_profiles_coaches_rls_recursion.sql (fixes RLS).
--   2. Then run this file in Supabase SQL Editor.
--   3. Check the Messages tab for the Profile Repair Report.
--   4. If "eg_profiles with team_id: 0" appears, team assignments were cleared.
--      You must go to Admin → Coaches & Roles and manually re-assign each coach
--      to their team using the Team dropdown on each user row.
--
-- TEAM RE-ASSIGNMENT:
--   The app does not know which coach was assigned to which team.
--   Use the Admin → Coaches & Roles page to set:
--     - Role = "coach" for each coach user
--     - Team = the correct team for each coach
--   This writes to eg_profiles.role and eg_profiles.team_id via the
--   eg_admin_set_user_role_and_team RPC which is safe and audited.
-- =============================================================================
