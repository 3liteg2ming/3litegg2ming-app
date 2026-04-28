BEGIN;

-- Ensure the admin token RPC persists fantasy_points exactly as entered.
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
      fixture_id,
      player_id,
      team_id,
      disposals,
      kicks,
      handballs,
      marks,
      tackles,
      clearances,
      fantasy_points,
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
      (v_row->>'fantasy_points')::int,
      now()
    )
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
  END LOOP;
END;
$$;

-- Keep the existing ext-view shape for admin stats and append fantasy_points.
-- Player goals continue to come from the separate manual submission aggregation
-- already used in the app leaders cache.
DROP VIEW IF EXISTS public.eg_player_season_totals_ext CASCADE;
CREATE OR REPLACE VIEW public.eg_player_season_totals_ext AS
SELECT
  f.season_id,
  s.player_id,
  COALESCE(p.team_id, s.team_id) AS team_id,
  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), NULLIF(p.name, ''), 'Unknown Player') AS player_name,
  COUNT(DISTINCT s.fixture_id) AS matches,
  SUM(COALESCE(s.disposals, 0)) AS disposals,
  SUM(COALESCE(s.kicks, 0)) AS kicks,
  SUM(COALESCE(s.handballs, 0)) AS handballs,
  SUM(COALESCE(s.marks, 0)) AS marks,
  SUM(COALESCE(s.tackles, 0)) AS tackles,
  SUM(COALESCE(s.clearances, 0)) AS clearances,
  SUM(COALESCE(s.fantasy_points, 0)) AS fantasy_points
FROM public.eg_fixture_player_stats s
JOIN public.eg_fixtures f ON f.id = s.fixture_id
LEFT JOIN public.eg_players p ON p.id = s.player_id
GROUP BY
  f.season_id,
  s.player_id,
  COALESCE(p.team_id, s.team_id),
  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), NULLIF(p.name, ''), 'Unknown Player');

COMMIT;

NOTIFY pgrst, 'reload schema';
