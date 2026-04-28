-- Add fantasy_points column to eg_fixture_player_stats.
-- This allows admin import to persist the real fantasy value
-- instead of relying on downstream formula approximation.

ALTER TABLE public.eg_fixture_player_stats
ADD COLUMN IF NOT EXISTS fantasy_points int NULL CHECK (fantasy_points IS NULL OR fantasy_points >= 0);

-- Update the auth-based upsert RPC to include fantasy_points
CREATE OR REPLACE FUNCTION public.eg_upsert_fixture_player_stats(
  p_fixture_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_can_write boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'fixture_id is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = v_uid
        AND COALESCE(p.is_admin, false) = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.eg_fixture_submissions s
      WHERE s.fixture_id = p_fixture_id
        AND s.submitted_by_user_id = v_uid
    )
  ) INTO v_can_write;

  IF COALESCE(v_can_write, false) = false THEN
    RAISE EXCEPTION 'No editable submission found for this fixture';
  END IF;

  INSERT INTO public.eg_fixture_player_stats (
    fixture_id,
    player_id,
    team_id,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    clearances,
    fantasy_points
  )
  SELECT
    p_fixture_id,
    NULLIF(trim(x->>'player_id'), '')::uuid,
    NULLIF(trim(x->>'team_id'), '')::uuid,
    CASE WHEN COALESCE(x->>'disposals', '') ~ '^\d+$' THEN (x->>'disposals')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'kicks', '') ~ '^\d+$' THEN (x->>'kicks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'handballs', '') ~ '^\d+$' THEN (x->>'handballs')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'marks', '') ~ '^\d+$' THEN (x->>'marks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'tackles', '') ~ '^\d+$' THEN (x->>'tackles')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'clearances', '') ~ '^\d+$' THEN (x->>'clearances')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'fantasy_points', '') ~ '^\d+$' THEN (x->>'fantasy_points')::int ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x
  WHERE COALESCE(trim(x->>'player_id'), '') <> ''
    AND COALESCE(trim(x->>'team_id'), '') <> ''
  ON CONFLICT (fixture_id, player_id)
  DO UPDATE SET
    team_id = EXCLUDED.team_id,
    disposals = EXCLUDED.disposals,
    kicks = EXCLUDED.kicks,
    handballs = EXCLUDED.handballs,
    marks = EXCLUDED.marks,
    tackles = EXCLUDED.tackles,
    clearances = EXCLUDED.clearances,
    fantasy_points = EXCLUDED.fantasy_points,
    updated_at = now();
END;
$$;

-- Patch eg_recompute_stats to read real fantasy_points instead of hardcoded 0.
-- We only need to replace the stat_rows CTE line. Safest approach: recreate the function.
-- (Full function body copied from 202603101900 with the single line fix.)
CREATE OR REPLACE FUNCTION public.eg_recompute_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.eg_player_season_totals_store;

  INSERT INTO public.eg_player_season_totals_store (
    season_id, player_id, team_id, player_name, team_name, headshot_url,
    games, goals, behinds, disposals, kicks, handballs, marks,
    tackles, clearances, hitouts, fantasy_points, updated_at
  )
  WITH final_fixtures AS (
    SELECT f.id, f.season_id, f.home_team_id, f.away_team_id
    FROM public.eg_fixtures f
    WHERE upper(coalesce(f.status::text, '')) IN ('FINAL', 'COMPLETED', 'COMPLETE')
  ),
  goal_rows AS (
    SELECT ff.season_id, ff.id AS fixture_id,
      CASE WHEN coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (trim(kicker->>'id'))::uuid ELSE NULL END AS player_id,
      nullif(trim(kicker->>'name'), '') AS player_name,
      ff.home_team_id AS team_id,
      CASE WHEN coalesce(kicker->>'goals', '') ~ '^\d+$' THEN greatest((kicker->>'goals')::integer, 0) ELSE 0 END AS goals
    FROM public.submissions s
    JOIN final_fixtures ff ON ff.id = s.fixture_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.goal_kickers_home, '[]'::jsonb)) AS kicker

    UNION ALL

    SELECT ff.season_id, ff.id AS fixture_id,
      CASE WHEN coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (trim(kicker->>'id'))::uuid ELSE NULL END AS player_id,
      nullif(trim(kicker->>'name'), '') AS player_name,
      ff.away_team_id AS team_id,
      CASE WHEN coalesce(kicker->>'goals', '') ~ '^\d+$' THEN greatest((kicker->>'goals')::integer, 0) ELSE 0 END AS goals
    FROM public.submissions s
    JOIN final_fixtures ff ON ff.id = s.fixture_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.goal_kickers_away, '[]'::jsonb)) AS kicker
  ),
  stat_rows AS (
    SELECT
      ff.season_id, fps.fixture_id, fps.player_id,
      coalesce(fps.team_id, p.team_id) AS team_id,
      coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, '')) AS player_name,
      coalesce(fps.disposals, 0) AS disposals,
      coalesce(fps.kicks, 0) AS kicks,
      coalesce(fps.handballs, 0) AS handballs,
      coalesce(fps.marks, 0) AS marks,
      coalesce(fps.tackles, 0) AS tackles,
      coalesce(fps.clearances, 0) AS clearances,
      0::integer AS hitouts,
      coalesce(fps.fantasy_points, 0) AS fantasy_points
    FROM public.eg_fixture_player_stats fps
    JOIN final_fixtures ff ON ff.id = fps.fixture_id
    LEFT JOIN public.eg_players p ON p.id = fps.player_id
  ),
  appearance_rows AS (
    SELECT season_id, fixture_id, player_id FROM goal_rows WHERE player_id IS NOT NULL
    UNION
    SELECT season_id, fixture_id, player_id FROM stat_rows WHERE player_id IS NOT NULL
  ),
  appearance_totals AS (
    SELECT season_id, player_id, count(DISTINCT fixture_id)::integer AS games
    FROM appearance_rows GROUP BY season_id, player_id
  ),
  goal_totals AS (
    SELECT season_id, player_id, max(team_id::text) AS team_id_text, max(player_name) AS player_name, sum(goals)::integer AS goals
    FROM goal_rows WHERE player_id IS NOT NULL GROUP BY season_id, player_id
  ),
  stat_totals AS (
    SELECT season_id, player_id, max(team_id::text) AS team_id_text, max(player_name) AS player_name,
      sum(disposals)::integer AS disposals, sum(kicks)::integer AS kicks,
      sum(handballs)::integer AS handballs, sum(marks)::integer AS marks,
      sum(tackles)::integer AS tackles, sum(clearances)::integer AS clearances,
      sum(hitouts)::integer AS hitouts, sum(fantasy_points)::integer AS fantasy_points
    FROM stat_rows WHERE player_id IS NOT NULL GROUP BY season_id, player_id
  ),
  combined AS (
    SELECT
      a.season_id, a.player_id,
      coalesce(st.team_id_text, gt.team_id_text, p.team_id::text) AS team_id_text,
      coalesce(st.player_name, gt.player_name, nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player') AS player_name,
      p.headshot_url, a.games,
      coalesce(gt.goals, 0) AS goals, 0::integer AS behinds,
      coalesce(st.disposals, 0) AS disposals, coalesce(st.kicks, 0) AS kicks,
      coalesce(st.handballs, 0) AS handballs, coalesce(st.marks, 0) AS marks,
      coalesce(st.tackles, 0) AS tackles, coalesce(st.clearances, 0) AS clearances,
      coalesce(st.hitouts, 0) AS hitouts, coalesce(st.fantasy_points, 0) AS fantasy_points
    FROM appearance_totals a
    LEFT JOIN goal_totals gt ON gt.season_id = a.season_id AND gt.player_id = a.player_id
    LEFT JOIN stat_totals st ON st.season_id = a.season_id AND st.player_id = a.player_id
    LEFT JOIN public.eg_players p ON p.id = a.player_id
  )
  SELECT
    c.season_id, c.player_id, nullif(c.team_id_text, '')::uuid AS team_id,
    c.player_name, t.name AS team_name, c.headshot_url,
    c.games, c.goals, c.behinds, c.disposals, c.kicks, c.handballs, c.marks,
    c.tackles, c.clearances, c.hitouts, c.fantasy_points, now()
  FROM combined c
  LEFT JOIN public.eg_teams t ON t.id = nullif(c.team_id_text, '')::uuid;
END;
$$;
