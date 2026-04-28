BEGIN;

-- Token-gated RPC for admin fixture score corrections.
-- Uses eg_assert_admin_session (passcode session token) consistent with
-- the existing admin session infrastructure in 20260303000200_admin_passcode_sessions_and_rpcs.sql.

CREATE OR REPLACE FUNCTION public.eg_admin_update_fixture_scores(
  p_token text,
  p_fixture_id uuid,
  p_home_goals int DEFAULT NULL,
  p_home_behinds int DEFAULT NULL,
  p_home_total int DEFAULT NULL,
  p_away_goals int DEFAULT NULL,
  p_away_behinds int DEFAULT NULL,
  p_away_total int DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS public.eg_fixtures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.eg_fixtures;
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  UPDATE public.eg_fixtures
  SET
    home_goals    = COALESCE(p_home_goals, home_goals),
    home_behinds  = COALESCE(p_home_behinds, home_behinds),
    home_total    = COALESCE(p_home_total, home_total),
    away_goals    = COALESCE(p_away_goals, away_goals),
    away_behinds  = COALESCE(p_away_behinds, away_behinds),
    away_total    = COALESCE(p_away_total, away_total),
    status        = COALESCE(NULLIF(p_status, ''), status),
    corrected_at  = now()
  WHERE id = p_fixture_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Fixture not found: %', p_fixture_id;
  END IF;

  IF to_regclass('public.eg_audit_log') IS NOT NULL THEN
    INSERT INTO public.eg_audit_log (actor_user_id, action, entity_table, entity_id, summary)
    VALUES (
      auth.uid(),
      'UPDATE',
      'eg_fixtures',
      p_fixture_id::text,
      format('Admin corrected scores: %s.%s.%s vs %s.%s.%s',
        COALESCE(v_row.home_goals::text, '?'),
        COALESCE(v_row.home_behinds::text, '?'),
        COALESCE(v_row.home_total::text, '?'),
        COALESCE(v_row.away_goals::text, '?'),
        COALESCE(v_row.away_behinds::text, '?'),
        COALESCE(v_row.away_total::text, '?')
      )
    );
  END IF;

  RETURN v_row;
END;
$$;

-- Token-gated RPC for admin player stat upserts.
-- Falls back from the admin-specific version; the auth-based
-- eg_upsert_fixture_player_stats remains available as a secondary path.

CREATE OR REPLACE FUNCTION public.eg_admin_upsert_player_stats(
  p_token text,
  p_fixture_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.eg_fixture_player_stats (
      fixture_id, player_id, team_id,
      disposals, kicks, handballs, marks, tackles, clearances,
      updated_at
    ) VALUES (
      p_fixture_id,
      (v_row->>'player_id')::uuid,
      (v_row->>'team_id')::uuid,
      (v_row->>'disposals')::int,
      (v_row->>'kicks')::int,
      (v_row->>'handballs')::int,
      (v_row->>'marks')::int,
      (v_row->>'tackles')::int,
      (v_row->>'clearances')::int,
      now()
    )
    ON CONFLICT (fixture_id, player_id)
    DO UPDATE SET
      team_id    = EXCLUDED.team_id,
      disposals  = EXCLUDED.disposals,
      kicks      = EXCLUDED.kicks,
      handballs  = EXCLUDED.handballs,
      marks      = EXCLUDED.marks,
      tackles    = EXCLUDED.tackles,
      clearances = EXCLUDED.clearances,
      updated_at = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_admin_update_fixture_scores(text, uuid, int, int, int, int, int, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_upsert_player_stats(text, uuid, jsonb) TO anon, authenticated;

COMMIT;
