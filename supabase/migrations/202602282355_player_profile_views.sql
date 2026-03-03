BEGIN;

CREATE INDEX IF NOT EXISTS idx_eg_fixture_player_stats_player_id
  ON public.eg_fixture_player_stats (player_id);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_player_stats_fixture_id
  ON public.eg_fixture_player_stats (fixture_id);

CREATE INDEX IF NOT EXISTS idx_eg_fixtures_id_season_start
  ON public.eg_fixtures (id, season_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_eg_fixtures_start_time
  ON public.eg_fixtures (start_time DESC);

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
  clearances
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW public.eg_player_season_averages AS
SELECT
  s.player_id,
  f.season_id,
  s.team_id,
  COUNT(DISTINCT s.fixture_id)::int AS matches,
  AVG(s.disposals)::numeric AS avg_disposals,
  AVG(s.kicks)::numeric AS avg_kicks,
  AVG(s.handballs)::numeric AS avg_handballs,
  AVG(s.marks)::numeric AS avg_marks,
  AVG(s.tackles)::numeric AS avg_tackles,
  AVG(s.clearances)::numeric AS avg_clearances
FROM public.eg_fixture_player_stats s
JOIN public.eg_fixtures f ON f.id = s.fixture_id
GROUP BY s.player_id, f.season_id, s.team_id;

CREATE OR REPLACE VIEW public.eg_player_career_averages AS
SELECT
  s.player_id,
  COALESCE(p.team_id, s.team_id) AS team_id,
  COUNT(DISTINCT s.fixture_id)::int AS matches,
  AVG(s.disposals)::numeric AS avg_disposals,
  AVG(s.kicks)::numeric AS avg_kicks,
  AVG(s.handballs)::numeric AS avg_handballs,
  AVG(s.marks)::numeric AS avg_marks,
  AVG(s.tackles)::numeric AS avg_tackles,
  AVG(s.clearances)::numeric AS avg_clearances
FROM public.eg_fixture_player_stats s
LEFT JOIN public.eg_players p ON p.id = s.player_id
GROUP BY s.player_id, COALESCE(p.team_id, s.team_id);

COMMIT;
