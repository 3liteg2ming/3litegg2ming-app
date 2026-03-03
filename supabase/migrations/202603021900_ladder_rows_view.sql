-- 2026-03-02
-- Ladder rows view (season-scoped) built from eg_fixtures FINAL scores.
-- This gives the frontend a single, fast read model: public.eg_ladder_rows

BEGIN;

-- Safety: if a previous version exists, replace it.
DROP VIEW IF EXISTS public.eg_ladder_rows;

CREATE OR REPLACE VIEW public.eg_ladder_rows AS
WITH final_fixtures AS (
  SELECT
    id,
    season_id,
    home_team_id,
    away_team_id,
    COALESCE(home_total, 0) AS home_total,
    COALESCE(away_total, 0) AS away_total
  FROM public.eg_fixtures
  WHERE COALESCE(status::text, '') IN ('FINAL', 'final')
    AND season_id IS NOT NULL
    AND home_team_id IS NOT NULL
    AND away_team_id IS NOT NULL
),
team_games AS (
  -- Home team perspective
  SELECT
    f.season_id,
    f.home_team_id AS team_id,
    f.home_total AS pf,
    f.away_total AS pa,
    CASE WHEN f.home_total > f.away_total THEN 1 ELSE 0 END AS win,
    CASE WHEN f.home_total < f.away_total THEN 1 ELSE 0 END AS loss,
    CASE WHEN f.home_total = f.away_total THEN 1 ELSE 0 END AS draw
  FROM final_fixtures f

  UNION ALL

  -- Away team perspective
  SELECT
    f.season_id,
    f.away_team_id AS team_id,
    f.away_total AS pf,
    f.home_total AS pa,
    CASE WHEN f.away_total > f.home_total THEN 1 ELSE 0 END AS win,
    CASE WHEN f.away_total < f.home_total THEN 1 ELSE 0 END AS loss,
    CASE WHEN f.away_total = f.home_total THEN 1 ELSE 0 END AS draw
  FROM final_fixtures f
),
agg AS (
  SELECT
    season_id,
    team_id,
    COUNT(*) AS played,
    SUM(win) AS wins,
    SUM(loss) AS losses,
    SUM(draw) AS draws,
    SUM(pf) AS pf,
    SUM(pa) AS pa,
    (SUM(win) * 4 + SUM(draw) * 2) AS points
  FROM team_games
  GROUP BY season_id, team_id
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
  END AS percentage
FROM public.eg_seasons s
JOIN public.eg_teams t ON true
LEFT JOIN agg a ON a.season_id = s.id AND a.team_id = t.id;

-- RLS doesn't apply to views, but the underlying tables do.
-- Ensure authenticated users can SELECT the season + teams + fixtures.

COMMIT;
