BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.eg_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_by text NULL
);

CREATE INDEX IF NOT EXISTS idx_eg_admin_sessions_expires_at
  ON public.eg_admin_sessions (expires_at);

ALTER TABLE public.eg_admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.eg_is_admin_session_valid(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eg_admin_sessions s
    WHERE s.token = p_token
      AND s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.eg_assert_admin_session(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(trim(p_token), '') = '' THEN
    RAISE EXCEPTION 'Admin token missing';
  END IF;

  IF NOT public.eg_is_admin_session_valid(p_token) THEN
    RAISE EXCEPTION 'Admin session invalid or expired';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_set_profile_admin(
  p_token text,
  p_user_id uuid,
  p_is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role boolean := false;
  v_has_is_admin boolean := false;
  v_role text := CASE WHEN p_is_admin THEN 'admin' ELSE 'user' END;
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_profiles'
      AND column_name = 'role'
  ) INTO v_has_role;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_profiles'
      AND column_name = 'is_admin'
  ) INTO v_has_is_admin;

  IF to_regclass('public.eg_profiles') IS NOT NULL THEN
    IF v_has_role AND v_has_is_admin THEN
      EXECUTE 'UPDATE public.eg_profiles SET role = $1, is_admin = $2 WHERE user_id = $3'
      USING v_role, p_is_admin, p_user_id;
    ELSIF v_has_role THEN
      EXECUTE 'UPDATE public.eg_profiles SET role = $1 WHERE user_id = $2'
      USING v_role, p_user_id;
    ELSIF v_has_is_admin THEN
      EXECUTE 'UPDATE public.eg_profiles SET is_admin = $1 WHERE user_id = $2'
      USING p_is_admin, p_user_id;
    END IF;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'UPDATE public.profiles SET is_admin = $1 WHERE user_id = $2' USING p_is_admin, p_user_id;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_update_profile(
  p_token text,
  p_user_id uuid,
  p_display_name text,
  p_psn text,
  p_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  IF to_regclass('public.eg_profiles') IS NOT NULL THEN
    INSERT INTO public.eg_profiles (user_id, display_name, psn, team_id)
    VALUES (p_user_id, NULLIF(trim(p_display_name), ''), NULLIF(trim(p_psn), ''), p_team_id)
    ON CONFLICT (user_id)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      psn = EXCLUDED.psn,
      team_id = EXCLUDED.team_id,
      updated_at = now();
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'UPDATE public.profiles SET display_name = $1, psn = $2, team_id = $3 WHERE user_id = $4'
      USING NULLIF(trim(p_display_name), ''), NULLIF(trim(p_psn), ''), p_team_id, p_user_id;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_upsert_fixture(
  p_token text,
  payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_season_id uuid;
  v_season_slug text := NULLIF(trim(COALESCE(payload->>'season_slug', '')), '');
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  IF NULLIF(trim(COALESCE(payload->>'id', '')), '') IS NOT NULL THEN
    v_id := (payload->>'id')::uuid;
  END IF;

  IF NULLIF(trim(COALESCE(payload->>'season_id', '')), '') IS NOT NULL THEN
    v_season_id := (payload->>'season_id')::uuid;
  ELSIF v_season_slug IS NOT NULL THEN
    SELECT id INTO v_season_id FROM public.eg_seasons WHERE slug = v_season_slug LIMIT 1;
  END IF;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'season_id or season_slug is required';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.eg_fixtures (
      season_id, round, week_index, stage_name, stage_index, bracket_slot, next_fixture_id,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id,
      home_goals, home_behinds, home_total,
      away_goals, away_behinds, away_total
    ) VALUES (
      v_season_id,
      COALESCE(NULLIF(payload->>'round', '')::int, 1),
      NULLIF(payload->>'week_index', '')::int,
      NULLIF(payload->>'stage_name', ''),
      NULLIF(payload->>'stage_index', '')::int,
      NULLIF(payload->>'bracket_slot', ''),
      NULLIF(payload->>'next_fixture_id', '')::uuid,
      COALESCE(NULLIF(payload->>'is_preseason', '')::boolean, false),
      COALESCE(NULLIF(payload->>'status', ''), 'SCHEDULED'),
      NULLIF(payload->>'start_time', '')::timestamptz,
      NULLIF(payload->>'venue', ''),
      NULLIF(payload->>'home_team_id', '')::uuid,
      NULLIF(payload->>'away_team_id', '')::uuid,
      NULLIF(payload->>'home_goals', '')::int,
      NULLIF(payload->>'home_behinds', '')::int,
      NULLIF(payload->>'home_total', '')::int,
      NULLIF(payload->>'away_goals', '')::int,
      NULLIF(payload->>'away_behinds', '')::int,
      NULLIF(payload->>'away_total', '')::int
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  UPDATE public.eg_fixtures
  SET
    season_id = v_season_id,
    round = COALESCE(NULLIF(payload->>'round', '')::int, 1),
    week_index = NULLIF(payload->>'week_index', '')::int,
    stage_name = NULLIF(payload->>'stage_name', ''),
    stage_index = NULLIF(payload->>'stage_index', '')::int,
    bracket_slot = NULLIF(payload->>'bracket_slot', ''),
    next_fixture_id = NULLIF(payload->>'next_fixture_id', '')::uuid,
    is_preseason = COALESCE(NULLIF(payload->>'is_preseason', '')::boolean, false),
    status = COALESCE(NULLIF(payload->>'status', ''), 'SCHEDULED'),
    start_time = NULLIF(payload->>'start_time', '')::timestamptz,
    venue = NULLIF(payload->>'venue', ''),
    home_team_id = NULLIF(payload->>'home_team_id', '')::uuid,
    away_team_id = NULLIF(payload->>'away_team_id', '')::uuid,
    home_goals = NULLIF(payload->>'home_goals', '')::int,
    home_behinds = NULLIF(payload->>'home_behinds', '')::int,
    home_total = NULLIF(payload->>'home_total', '')::int,
    away_goals = NULLIF(payload->>'away_goals', '')::int,
    away_behinds = NULLIF(payload->>'away_behinds', '')::int,
    away_total = NULLIF(payload->>'away_total', '')::int
  WHERE id = v_id;

  IF NOT FOUND THEN
    INSERT INTO public.eg_fixtures (
      id,
      season_id, round, week_index, stage_name, stage_index, bracket_slot, next_fixture_id,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id,
      home_goals, home_behinds, home_total,
      away_goals, away_behinds, away_total
    ) VALUES (
      v_id,
      v_season_id,
      COALESCE(NULLIF(payload->>'round', '')::int, 1),
      NULLIF(payload->>'week_index', '')::int,
      NULLIF(payload->>'stage_name', ''),
      NULLIF(payload->>'stage_index', '')::int,
      NULLIF(payload->>'bracket_slot', ''),
      NULLIF(payload->>'next_fixture_id', '')::uuid,
      COALESCE(NULLIF(payload->>'is_preseason', '')::boolean, false),
      COALESCE(NULLIF(payload->>'status', ''), 'SCHEDULED'),
      NULLIF(payload->>'start_time', '')::timestamptz,
      NULLIF(payload->>'venue', ''),
      NULLIF(payload->>'home_team_id', '')::uuid,
      NULLIF(payload->>'away_team_id', '')::uuid,
      NULLIF(payload->>'home_goals', '')::int,
      NULLIF(payload->>'home_behinds', '')::int,
      NULLIF(payload->>'home_total', '')::int,
      NULLIF(payload->>'away_goals', '')::int,
      NULLIF(payload->>'away_behinds', '')::int,
      NULLIF(payload->>'away_total', '')::int
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_delete_fixture(
  p_token text,
  p_fixture_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);
  DELETE FROM public.eg_fixtures WHERE id = p_fixture_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_regenerate_preseason(
  p_token text,
  p_team_count int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);
  PERFORM public.eg_preseason_reset_and_generate_rounds('preseason', p_team_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_update_registration(
  p_token text,
  p_user_id uuid,
  p_action text,
  p_team_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_table_name text;
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_has_status boolean := false;
  v_has_team_id boolean := false;
  v_has_team_name boolean := false;
  v_has_psn_name boolean := false;
  v_has_psn boolean := false;
  v_team_name text := NULL;
  v_exists boolean := false;
  v_set_parts text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  IF to_regclass('public.eg_preseason_registrations') IS NOT NULL THEN
    v_table := 'public.eg_preseason_registrations';
    v_table_name := 'eg_preseason_registrations';
  ELSIF to_regclass('public."EG_preseason_registrations"') IS NOT NULL THEN
    v_table := 'public."EG_preseason_registrations"';
    v_table_name := 'EG_preseason_registrations';
  ELSE
    RAISE EXCEPTION 'Preseason registrations table not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table_name AND column_name='status'
  ) INTO v_has_status;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table_name AND column_name='team_id'
  ) INTO v_has_team_id;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table_name AND column_name='team_name'
  ) INTO v_has_team_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table_name AND column_name='psn_name'
  ) INTO v_has_psn_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table_name AND column_name='psn'
  ) INTO v_has_psn;

  IF p_team_id IS NOT NULL THEN
    SELECT name INTO v_team_name FROM public.eg_teams WHERE id = p_team_id;
  END IF;

  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE user_id = $1)', v_table)
  INTO v_exists
  USING p_user_id;

  IF NOT v_exists AND v_action = 'approve' THEN
    EXECUTE format('INSERT INTO %s (user_id) VALUES ($1)', v_table) USING p_user_id;
  END IF;

  IF v_action = 'approve' THEN
    IF v_has_status THEN v_set_parts := array_append(v_set_parts, 'status = ''APPROVED'''); END IF;
    IF v_has_team_id THEN v_set_parts := array_append(v_set_parts, format('team_id = %L', p_team_id)); END IF;
    IF v_has_team_name THEN v_set_parts := array_append(v_set_parts, format('team_name = %L', v_team_name)); END IF;
  ELSIF v_action = 'deny' THEN
    IF v_has_status THEN v_set_parts := array_append(v_set_parts, 'status = ''DENIED'''); END IF;
    IF v_has_team_id THEN v_set_parts := array_append(v_set_parts, 'team_id = NULL'); END IF;
    IF v_has_team_name THEN v_set_parts := array_append(v_set_parts, 'team_name = NULL'); END IF;
  ELSIF v_action = 'unassign' THEN
    IF v_has_status THEN v_set_parts := array_append(v_set_parts, 'status = ''PENDING'''); END IF;
    IF v_has_team_id THEN v_set_parts := array_append(v_set_parts, 'team_id = NULL'); END IF;
    IF v_has_team_name THEN v_set_parts := array_append(v_set_parts, 'team_name = NULL'); END IF;
  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE %s SET %s WHERE user_id = %L',
    v_table,
    array_to_string(v_set_parts, ', '),
    p_user_id::text
  );

  -- Keep psn columns consistent when missing; do not overwrite with null if already present.
  IF v_has_psn_name AND v_has_psn THEN
    EXECUTE format(
      'UPDATE %s SET psn_name = COALESCE(psn_name, psn), psn = COALESCE(psn, psn_name) WHERE user_id = %L',
      v_table,
      p_user_id::text
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_is_admin_session_valid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_set_profile_admin(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_update_profile(text, uuid, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_upsert_fixture(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_delete_fixture(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_regenerate_preseason(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_update_registration(text, uuid, text, uuid) TO anon, authenticated;

COMMIT;
