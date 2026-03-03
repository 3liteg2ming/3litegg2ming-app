-- 2026-03-02
-- Ladder rows v2 with real last-5 form, season scoped.
-- last5_results is newest -> oldest, values in {'W','L','D'}.

BEGIN;

DROP VIEW IF EXISTS public.eg_ladder_rows_v2;

CREATE OR REPLACE VIEW public.eg_ladder_rows_v2 AS
WITH final_fixtures AS (
  SELECT
    f.id,
    f.season_id,
    f.start_time,
    f.home_team_id,
    f.away_team_id,
    COALESCE(f.home_total, 0) AS home_total,
    COALESCE(f.away_total, 0) AS away_total
  FROM public.eg_fixtures f
  WHERE COALESCE(f.status::text, '') IN ('FINAL', 'final')
    AND f.season_id IS NOT NULL
    AND f.home_team_id IS NOT NULL
    AND f.away_team_id IS NOT NULL
),
team_games AS (
  SELECT
    ff.id AS fixture_id,
    ff.season_id,
    ff.start_time,
    ff.home_team_id AS team_id,
    ff.home_total AS pf,
    ff.away_total AS pa,
    CASE
      WHEN ff.home_total > ff.away_total THEN 'W'
      WHEN ff.home_total < ff.away_total THEN 'L'
      ELSE 'D'
    END AS result,
    CASE WHEN ff.home_total > ff.away_total THEN 1 ELSE 0 END AS win,
    CASE WHEN ff.home_total < ff.away_total THEN 1 ELSE 0 END AS loss,
    CASE WHEN ff.home_total = ff.away_total THEN 1 ELSE 0 END AS draw
  FROM final_fixtures ff

  UNION ALL

  SELECT
    ff.id AS fixture_id,
    ff.season_id,
    ff.start_time,
    ff.away_team_id AS team_id,
    ff.away_total AS pf,
    ff.home_total AS pa,
    CASE
      WHEN ff.away_total > ff.home_total THEN 'W'
      WHEN ff.away_total < ff.home_total THEN 'L'
      ELSE 'D'
    END AS result,
    CASE WHEN ff.away_total > ff.home_total THEN 1 ELSE 0 END AS win,
    CASE WHEN ff.away_total < ff.home_total THEN 1 ELSE 0 END AS loss,
    CASE WHEN ff.away_total = ff.home_total THEN 1 ELSE 0 END AS draw
  FROM final_fixtures ff
),
agg AS (
  SELECT
    tg.season_id,
    tg.team_id,
    COUNT(*) AS played,
    SUM(tg.win) AS wins,
    SUM(tg.loss) AS losses,
    SUM(tg.draw) AS draws,
    SUM(tg.pf) AS pf,
    SUM(tg.pa) AS pa,
    (SUM(tg.win) * 4 + SUM(tg.draw) * 2) AS points
  FROM team_games tg
  GROUP BY tg.season_id, tg.team_id
),
ranked_form AS (
  SELECT
    tg.season_id,
    tg.team_id,
    tg.result,
    ROW_NUMBER() OVER (
      PARTITION BY tg.season_id, tg.team_id
      ORDER BY tg.start_time DESC NULLS LAST, tg.fixture_id DESC
    ) AS rn
  FROM team_games tg
),
last5 AS (
  SELECT
    rf.season_id,
    rf.team_id,
    ARRAY_AGG(rf.result ORDER BY rf.rn) FILTER (WHERE rf.rn <= 5) AS last5_results
  FROM ranked_form rf
  GROUP BY rf.season_id, rf.team_id
)
SELECT
  s.id AS season_id,
  t.id AS team_id,
  COALESCE(NULLIF(t.name, ''), 'Team') AS team_name,
  COALESCE(NULLIF(t.slug, ''), NULLIF(t.team_key, ''), t.id::text) AS team_slug,
  t.logo_url AS team_logo_url,
  COALESCE(a.played, 0) AS played,
  COALESCE(a.wins, 0) AS wins,
  COALESCE(a.losses, 0) AS losses,
  COALESCE(a.draws, 0) AS draws,
  COALESCE(a.pf, 0) AS pf,
  COALESCE(a.pa, 0) AS pa,
  COALESCE(a.points, 0) AS points,
  CASE
    WHEN COALESCE(a.pa, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(a.pf, 0)::numeric / NULLIF(a.pa, 0)::numeric) * 100, 1)
  END AS percentage,
  COALESCE(l5.last5_results, ARRAY[]::text[]) AS last5_results
FROM public.eg_seasons s
JOIN public.eg_teams t ON true
LEFT JOIN agg a ON a.season_id = s.id AND a.team_id = t.id
LEFT JOIN last5 l5 ON l5.season_id = s.id AND l5.team_id = t.id;

COMMIT;
