-- Elite Gaming Admin Submit Pipeline Migration
-- This migration sets up:
-- 1. Ensure profiles table has is_admin and team_id columns
-- 2. Trigger to auto-create profiles row on auth user creation
-- 3. RPC eg_submit_result_home_only (home-team-only submission with full pipeline)
-- 4. Helper RPCs for recomputing ladder and stats
-- 5. RLS policies for profiles, fixtures, and submissions

-- ============================================================================
-- 1. ALTER profiles TABLE (add missing columns if needed)
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id uuid;

-- ============================================================================
-- 2. TRIGGER: Auto-create profile on auth.users insert
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, psn, is_admin, team_id)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'psn',
    false,
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (to avoid duplicates)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 3. RPC: eg_submit_result_home_only
-- This is the core submission RPC that finalizes matches on home-team submission
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eg_submit_result_home_only(
  p_fixture_id uuid,
  p_home_goals integer,
  p_home_behinds integer,
  p_away_goals integer,
  p_away_behinds integer,
  p_venue text DEFAULT NULL,
  p_goal_kickers_home jsonb DEFAULT NULL,
  p_goal_kickers_away jsonb DEFAULT NULL,
  p_ocr jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_team_id uuid;
  v_fixture_row record;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_submission_id uuid;
  v_home_total integer;
  v_away_total integer;
  v_other_submission record;
  v_scores_match boolean;
  v_result json;
BEGIN
  -- 1. SECURITY: Validate user is signed in
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. SECURITY: User must have a profiles row
  SELECT user_id, team_id INTO v_profile_id, v_team_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for user';
  END IF;

  -- 3. SECURITY: User must be linked to a team
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'User not linked to a team';
  END IF;

  -- 4. Get the fixture and validate it exists
  SELECT id, home_team_id, away_team_id, status
  INTO v_fixture_row
  FROM public.eg_fixtures
  WHERE id = p_fixture_id;

  IF v_fixture_row IS NULL THEN
    RAISE EXCEPTION 'Fixture not found';
  END IF;

  v_home_team_id := v_fixture_row.home_team_id;
  v_away_team_id := v_fixture_row.away_team_id;

  -- 5. SECURITY: HOME-TEAM-ONLY validation
  -- User's team must be the HOME team
  IF v_team_id::text != v_home_team_id::text THEN
    RAISE EXCEPTION 'Only the home team can submit results (home-team-only policy)';
  END IF;

  -- 6. SECURITY: Fixture cannot already be FINAL
  IF v_fixture_row.status = 'FINAL' THEN
    RAISE EXCEPTION 'Fixture is already FINAL, cannot resubmit';
  END IF;

  -- 7. Calculate totals
  v_home_total := (p_home_goals * 6) + p_home_behinds;
  v_away_total := (p_away_goals * 6) + p_away_behinds;

  -- 8. Create submission record with full audit trail
  v_submission_id := gen_random_uuid();
  INSERT INTO public.submissions (
    id,
    fixture_id,
    team_id,
    submitted_by,
    home_goals,
    home_behinds,
    away_goals,
    away_behinds,
    goal_kickers_home,
    goal_kickers_away,
    ocr_raw_text,
    notes,
    submitted_at
  )
  VALUES (
    v_submission_id,
    p_fixture_id,
    v_team_id,
    v_user_id,
    p_home_goals,
    p_home_behinds,
    p_away_goals,
    p_away_behinds,
    p_goal_kickers_home,
    p_goal_kickers_away,
    p_ocr ->> 'rawText',
    p_notes,
    NOW()
  );

  -- 9. Update fixture with scores
  UPDATE public.eg_fixtures
  SET
    home_goals = p_home_goals,
    home_behinds = p_home_behinds,
    away_goals = p_away_goals,
    away_behinds = p_away_behinds,
    home_total = v_home_total,
    away_total = v_away_total,
    status = 'FINAL',
    submitted_by = v_user_id,
    submitted_at = NOW(),
    venue = COALESCE(p_venue, venue)
  WHERE id = p_fixture_id;

  -- 10. Update player goal kickers (home team)
  IF p_goal_kickers_home IS NOT NULL THEN
    -- Update eg_players goals based on goal kickers
    -- Expecting format: [{"id": "uuid", "name": "...", "goals": 3}, ...]
    INSERT INTO public.eg_players (id, name, goals, team_id)
    SELECT
      kicker->>'id',
      kicker->>'name',
      (kicker->>'goals')::integer,
      v_home_team_id
    FROM jsonb_array_elements(p_goal_kickers_home) AS kicker
    WHERE (kicker->>'id')::uuid IS NOT NULL
    ON CONFLICT (id) DO UPDATE
    SET goals = EXCLUDED.goals;
  END IF;

  -- 11. Recompute ladder (if function exists)
  BEGIN
    PERFORM public.eg_recompute_ladder();
  EXCEPTION WHEN undefined_function THEN
    -- Function may not exist yet; continue without error
    NULL;
  END;

  -- 12. Recompute stats (if function exists)
  BEGIN
    PERFORM public.eg_recompute_stats();
  EXCEPTION WHEN undefined_function THEN
    -- Function may not exist yet; continue without error
    NULL;
  END;

  -- 13. Return submission result
  v_result := json_build_object(
    'submission_id', v_submission_id,
    'fixture_id', p_fixture_id,
    'home_goals', p_home_goals,
    'home_behinds', p_home_behinds,
    'away_goals', p_away_goals,
    'away_behinds', p_away_behinds,
    'home_total', v_home_total,
    'away_total', v_away_total,
    'status', 'FINAL',
    'submitted_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. HELPER RPC: eg_recompute_ladder
-- Recomputes the ladder based on current fixtures
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eg_recompute_ladder()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This is a placeholder function. In production, it would:
  -- 1. Clear or reset ladder/standings tables
  -- 2. Iterate through all FINAL fixtures
  -- 3. Award points based on game outcomes
  -- 4. Update eg_ladder / standings table
  
  -- For now, just acknowledge the call succeeded
  NULL;
END;
$$;

-- ============================================================================
-- 5. HELPER RPC: eg_recompute_stats
-- Recomputes player stats from submissions and goal kickers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eg_recompute_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This is a placeholder function. In production, it would:
  -- 1. Aggregate goals from submissions.goal_kickers_home/away
  -- 2. Update eg_players.goals field
  -- 3. Compute other stats (disposals, marks, etc.) from OCR if available
  
  -- For now, just acknowledge the call succeeded
  NULL;
END;
$$;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

-- Enable RLS on key tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eg_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- PROFILES RLS
-- Users can read their own profile, admins can read all
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));

-- Users can update their own profile (limited fields)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (display_name = OLD.display_name OR display_name IS NOT NULL)
    AND (psn = OLD.psn OR psn IS NOT NULL)
    AND (team_id = OLD.team_id OR team_id IS NOT NULL)
    AND is_admin = OLD.is_admin
  );

-- Admins can update any profile
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE
  USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));

-- EG_FIXTURES RLS
-- Signed in users can read all fixtures
DROP POLICY IF EXISTS "fixtures_select_all" ON public.eg_fixtures;
CREATE POLICY "fixtures_select_all" ON public.eg_fixtures
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Fixture updates only via RPC (coaches and admin)
DROP POLICY IF EXISTS "fixtures_update_via_rpc" ON public.eg_fixtures;
CREATE POLICY "fixtures_update_via_rpc" ON public.eg_fixtures
  FOR UPDATE
  USING (false); -- All updates must go through RPC

-- SUBMISSIONS RLS
-- Inserts only via RPC
DROP POLICY IF EXISTS "submissions_insert_via_rpc" ON public.submissions;
CREATE POLICY "submissions_insert_via_rpc" ON public.submissions
  FOR INSERT
  WITH CHECK (false); -- All inserts must go through RPC

-- Users can read own submissions, admins can read all
DROP POLICY IF EXISTS "submissions_select_own" ON public.submissions;
CREATE POLICY "submissions_select_own" ON public.submissions
  FOR SELECT
  USING (
    auth.uid() = submitted_by
    OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
  );

COMMIT;
