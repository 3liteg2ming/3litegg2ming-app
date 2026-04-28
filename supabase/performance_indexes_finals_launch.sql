-- Elite Gaming finals launch — performance indexes
--
-- Safe to run multiple times: every statement uses CREATE INDEX IF NOT EXISTS,
-- and nothing in this file alters tables, columns, constraints, or data.
--
-- Apply against the production project:
--   psql "$SUPABASE_DB_URL" -f supabase/performance_indexes_finals_launch.sql
-- or paste into the Supabase SQL editor.
--
-- These indexes target the hot read paths that show up on the public site
-- on finals night: fixtures lists for the home/finals/fixtures pages,
-- the ladder rebuild from finalised fixtures, the per-fixture match-centre
-- payload (player stats + submissions), and team lookups by slug.
--
-- Each statement is conditional, so columns that do not exist will simply
-- short-circuit (CREATE INDEX IF NOT EXISTS will still raise on a missing
-- column, so individual blocks are wrapped in DO blocks where the column
-- is optional).

------------------------------------------------------------------------
-- eg_fixtures
------------------------------------------------------------------------
-- Public pages filter fixtures by season_id + order by round/start_time.
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_season_round
  ON public.eg_fixtures (season_id, round, start_time);

-- Match centre / fixtures page filters by status frequently.
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_season_status
  ON public.eg_fixtures (season_id, status);

-- Direct lookups by team (head-to-head, team profile, ladder build).
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_home_team
  ON public.eg_fixtures (home_team_id);
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_away_team
  ON public.eg_fixtures (away_team_id);

------------------------------------------------------------------------
-- eg_player_stats (used only on match-centre / stats; helps the per-fixture
-- and per-player drilldowns).
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eg_player_stats' AND column_name = 'fixture_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_eg_player_stats_fixture
             ON public.eg_player_stats (fixture_id)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eg_player_stats' AND column_name = 'player_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_eg_player_stats_player
             ON public.eg_player_stats (player_id)';
  END IF;
END $$;

------------------------------------------------------------------------
-- eg_teams — slug lookups (team profile pages, fixture hydration).
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eg_teams' AND column_name = 'slug'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_eg_teams_slug ON public.eg_teams (slug)';
  END IF;
END $$;

------------------------------------------------------------------------
-- submissions — fixture detail page joins by fixture_id, sorts by submitted_at.
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'submissions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'fixture_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_submissions_fixture
             ON public.submissions (fixture_id)';
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'submitted_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_submissions_fixture_submitted_at
               ON public.submissions (fixture_id, submitted_at DESC)';
    END IF;
  END IF;
END $$;

------------------------------------------------------------------------
-- eg_seasons — slug lookup is the first query of every public page.
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eg_seasons' AND column_name = 'slug'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_eg_seasons_slug ON public.eg_seasons (slug)';
  END IF;
END $$;

------------------------------------------------------------------------
-- eg_homepage_news — homepage news widget filters published rows
-- ordered by display_order, published_at.
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'eg_homepage_news'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_eg_homepage_news_published
             ON public.eg_homepage_news (is_published, display_order, published_at DESC)';
  END IF;
END $$;
