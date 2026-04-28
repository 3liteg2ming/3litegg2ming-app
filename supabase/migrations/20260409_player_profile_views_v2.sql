BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update player profile views to include fantasy_points (added to base table
-- in 20260324 migration but never propagated to the profile views).
-- Also adds a game-log view so the profile page can show match-by-match stats.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing views first (CREATE OR REPLACE cannot add columns to views)
DROP VIEW IF EXISTS public.eg_player_latest_fixture_statline CASCADE;
DROP VIEW IF EXISTS public.eg_player_season_averages CASCADE;
DROP VIEW IF EXISTS public.eg_player_career_averages CASCADE;
DROP VIEW IF EXISTS public.eg_player_game_log CASCADE;

-- 1) Latest fixture stat-line — now includes fantasy_points
DROP VIEW IF EXISTS public.eg_player_latest_fixture_statline CASCADE;
CREATE OR REPLACE VIEW public.eg_player_latest_fixture_statline AS
WITH ranked AS (
  SELECT
    s.player_id,
    s.fixture_id,
    f.season_id,
    f.start_time,
    s.team_id,
    s.disposals,
    s.kicks,
    s.handballs,
    s.marks,
    s.tackles,
    s.clearances,
    s.fantasy_points,
    row_number() OVER (
      PARTITION BY s.player_id
      ORDER BY f.start_time DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
    ) AS rn
  FROM public.eg_fixture_player_stats s
  JOIN public.eg_fixtures f ON f.id = s.fixture_id
)
SELECT
  player_id,
  fixture_id,
  season_id,
  start_time,
  team_id,
  disposals,
  kicks,
  handballs,
  marks,
  tackles,
  clearances,
  fantasy_points
FROM ranked
WHERE rn = 1;

-- 2) Season averages — now includes avg_fantasy_points
DROP VIEW IF EXISTS public.eg_player_season_averages CASCADE;
CREATE OR REPLACE VIEW public.eg_player_season_averages AS
SELECT
  s.player_id,
  f.season_id,
  s.team_id,
  COUNT(DISTINCT s.fixture_id)::int AS matches,
  AVG(s.disposals)::numeric        AS avg_disposals,
  AVG(s.kicks)::numeric            AS avg_kicks,
  AVG(s.handballs)::numeric        AS avg_handballs,
  AVG(s.marks)::numeric            AS avg_marks,
  AVG(s.tackles)::numeric          AS avg_tackles,
  AVG(s.clearances)::numeric       AS avg_clearances,
  AVG(s.fantasy_points)::numeric   AS avg_fantasy_points
FROM public.eg_fixture_player_stats s
JOIN public.eg_fixtures f ON f.id = s.fixture_id
GROUP BY s.player_id, f.season_id, s.team_id;

-- 3) Career averages — now includes avg_fantasy_points
DROP VIEW IF EXISTS public.eg_player_career_averages CASCADE;
CREATE OR REPLACE VIEW public.eg_player_career_averages AS
SELECT
  s.player_id,
  COALESCE(p.team_id, s.team_id) AS team_id,
  COUNT(DISTINCT s.fixture_id)::int AS matches,
  AVG(s.disposals)::numeric        AS avg_disposals,
  AVG(s.kicks)::numeric            AS avg_kicks,
  AVG(s.handballs)::numeric        AS avg_handballs,
  AVG(s.marks)::numeric            AS avg_marks,
  AVG(s.tackles)::numeric          AS avg_tackles,
  AVG(s.clearances)::numeric       AS avg_clearances,
  AVG(s.fantasy_points)::numeric   AS avg_fantasy_points
FROM public.eg_fixture_player_stats s
LEFT JOIN public.eg_players p ON p.id = s.player_id
GROUP BY s.player_id, COALESCE(p.team_id, s.team_id);

-- 4) NEW: Game log — match-by-match stats for the player profile
DROP VIEW IF EXISTS public.eg_player_game_log CASCADE;
CREATE OR REPLACE VIEW public.eg_player_game_log AS
SELECT
  s.player_id,
  s.fixture_id,
  f.season_id,
  f.start_time,
  f.round,
  s.team_id,
  -- opponent: the other team in the fixture
  CASE
    WHEN s.team_id = f.home_team_id THEN f.away_team_id
    ELSE f.home_team_id
  END AS opponent_team_id,
  s.disposals,
  s.kicks,
  s.handballs,
  s.marks,
  s.tackles,
  s.clearances,
  s.fantasy_points
FROM public.eg_fixture_player_stats s
JOIN public.eg_fixtures f ON f.id = s.fixture_id
ORDER BY f.start_time DESC NULLS LAST;

COMMIT;

NOTIFY pgrst, 'reload schema';
