-- =============================================================================
-- Fix: recursive RLS policies on eg_profiles / profiles
-- Symptom: "stack depth limit exceeded" when reading eg_profiles
--          → Admin Coaches & Roles shows 0 users
--          → Fixture cards show Coach TBC / PSN TBC
--
-- Root cause: A SELECT policy on eg_profiles queries eg_profiles again
--             to check is_admin/role, causing infinite recursion.
--
-- Fix:
--   1. Create a SECURITY DEFINER helper that checks admin role without RLS.
--   2. Drop any existing SELECT policies with common recursive names.
--   3. Add safe non-recursive SELECT policies.
--   4. Ensure public (anon) reads are allowed for fixture card coach display.
--   5. Ensure admin reads are allowed for Admin Coaches & Roles page.
--
-- SAFE TO RE-RUN. Does not delete rows. Does not touch auth.users.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Non-recursive admin-check helper
--    Queries eg_profiles with SECURITY DEFINER (bypasses RLS)
--    so the policy body never recurses back into itself.
-- ---------------------------------------------------------------------------
create or replace function public.eg_current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select role in ('admin', 'super_admin')
      from public.eg_profiles
      where user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

grant execute on function public.eg_current_user_is_admin() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2) Drop ALL known recursive / broken SELECT policies on eg_profiles
--    Use the most common names that recursive policies are created with.
--    (DROP IF EXISTS is safe — it won't error if a policy doesn't exist.)
-- ---------------------------------------------------------------------------
drop policy if exists "Allow users to read own profile"            on public.eg_profiles;
drop policy if exists "Allow admins to read all profiles"          on public.eg_profiles;
drop policy if exists "profiles_select_own"                        on public.eg_profiles;
drop policy if exists "eg_profiles_select_own"                     on public.eg_profiles;
drop policy if exists "eg_profiles_select_admin"                   on public.eg_profiles;
drop policy if exists "eg_profiles_select"                         on public.eg_profiles;
drop policy if exists "select_profiles"                            on public.eg_profiles;
drop policy if exists "read_profiles"                              on public.eg_profiles;
drop policy if exists "profiles_read"                              on public.eg_profiles;
drop policy if exists "users can view their own profile"           on public.eg_profiles;
drop policy if exists "admins can view all profiles"               on public.eg_profiles;
drop policy if exists "Admins can view all profiles"               on public.eg_profiles;
drop policy if exists "Users can view their own profile"           on public.eg_profiles;
drop policy if exists "Public profiles are viewable by everyone"   on public.eg_profiles;
drop policy if exists "Profiles are viewable by everyone"          on public.eg_profiles;

-- ---------------------------------------------------------------------------
-- 3) Add safe non-recursive SELECT policies on eg_profiles
--
--    Policy A — own row: any authenticated user can read their own row.
--    Policy B — admin:   admins can read all rows (uses helper, not recursive).
--    Policy C — public:  anon users can read display_name/psn/team_id only.
--                        Needed so fixture cards can show coaches without auth.
--                        (Supabase row-level security can't restrict columns,
--                         so we allow full row read for anon but rely on the
--                         app only selecting safe columns in public queries.)
-- ---------------------------------------------------------------------------
create policy eg_profiles_select_own
  on public.eg_profiles
  for select
  using (auth.uid() = user_id);

create policy eg_profiles_select_admin
  on public.eg_profiles
  for select
  using (public.eg_current_user_is_admin());

-- Allow anonymous reads (needed for fixture card coach display via anon key)
-- The app only selects: user_id, display_name, psn, team_id for public queries.
create policy eg_profiles_select_public
  on public.eg_profiles
  for select
  using (true);

-- ---------------------------------------------------------------------------
-- 4) Same treatment for the legacy `profiles` table
-- ---------------------------------------------------------------------------
drop policy if exists "Allow users to read own profile"            on public.profiles;
drop policy if exists "Allow admins to read all profiles"          on public.profiles;
drop policy if exists "profiles_select_own"                        on public.profiles;
drop policy if exists "profiles_select_admin"                      on public.profiles;
drop policy if exists "profiles_select"                            on public.profiles;
drop policy if exists "select_profiles"                            on public.profiles;
drop policy if exists "read_profiles"                              on public.profiles;
drop policy if exists "profiles_read"                              on public.profiles;
drop policy if exists "users can view their own profile"           on public.profiles;
drop policy if exists "admins can view all profiles"               on public.profiles;
drop policy if exists "Admins can view all profiles"               on public.profiles;
drop policy if exists "Users can view their own profile"           on public.profiles;
drop policy if exists "Public profiles are viewable by everyone"   on public.profiles;
drop policy if exists "Profiles are viewable by everyone"          on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy profiles_select_admin
  on public.profiles
  for select
  using (public.eg_current_user_is_admin());

create policy profiles_select_public
  on public.profiles
  for select
  using (true);

-- ---------------------------------------------------------------------------
-- 5) Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste this entire file and click Run
--   3. Confirm: "Success. No rows returned."
--   4. Reload the app — Admin Coaches & Roles should show profiles again.
--      Fixture cards should show coach names again.
--
-- If you still see 0 profiles in the admin panel after this fix, the problem
-- is that eg_profiles rows have team_id = NULL (cleared by a season-close
-- operation). In that case, run repair_missing_profiles_from_auth_users.sql
-- and then manually re-assign teams to coaches in Admin → Coaches & Roles.
-- =============================================================================
