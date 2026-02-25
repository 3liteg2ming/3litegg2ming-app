-- Elite Gaming Fixtures Performance Optimization Migration
-- Adds:
-- 1. eg_fixtures_with_teams VIEW for efficient fixture loading with team data
-- 2. Indexes for fixtures queries
-- 3. Indexes for submissions queries

-- ============================================================================
-- 1. CREATE VIEW: eg_fixtures_with_teams
-- Joins fixtures with team data for efficient single-query loading
-- ============================================================================
CREATE OR REPLACE VIEW public.eg_fixtures_with_teams AS
SELECT
  f.id,
  f.round,
  f.status,
  f.start_time,
  f.venue,
  f.home_team_id,
  f.away_team_id,
  f.home_goals,
  f.home_behinds,
  f.home_total,
  f.away_goals,
  f.away_behinds,
  f.away_total,
  f.submitted_by,
  f.submitted_at,
  f.season_id,
  -- Home team data
  ht.slug AS home_team_slug,
  ht.name AS home_team_name,
  ht.short_name AS home_team_short_name,
  ht.logo_url AS home_team_logo_url,
  ht.primary_color AS home_team_colour,
  -- Away team data
  at.slug AS away_team_slug,
  at.name AS away_team_name,
  at.short_name AS away_team_short_name,
  at.logo_url AS away_team_logo_url,
  at.primary_color AS away_team_colour
FROM public.eg_fixtures f
LEFT JOIN public.eg_teams ht ON f.home_team_id = ht.id
LEFT JOIN public.eg_teams at ON f.away_team_id = at.id;

COMMENT ON VIEW public.eg_fixtures_with_teams IS
  'Optimized view for fixtures list loading. Includes team data to avoid N+1 queries.';

-- ============================================================================
-- 2. INDEXES FOR FIXTURES QUERIES
-- ============================================================================

-- Index for fetching fixtures by season + round (common filter)
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_season_round
  ON public.eg_fixtures (season_id, round DESC)
  INCLUDE (status, start_time);

-- Index for status queries (LIVE, FINAL, UPCOMING)
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_status
  ON public.eg_fixtures (status, start_time DESC)
  INCLUDE (round);

-- Index for team-specific fixture queries
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_home_team
  ON public.eg_fixtures (home_team_id)
  INCLUDE (round, status, start_time);

CREATE INDEX IF NOT EXISTS idx_eg_fixtures_away_team
  ON public.eg_fixtures (away_team_id)
  INCLUDE (round, status, start_time);

-- Index for fixture by ID (most common lookup)
CREATE INDEX IF NOT EXISTS idx_eg_fixtures_id
  ON public.eg_fixtures (id)
  INCLUDE (status, round, start_time);

-- ============================================================================
-- 3. INDEXES FOR SUBMISSIONS QUERIES
-- ============================================================================

-- Index for fetching submissions by fixture (match centre page)
CREATE INDEX IF NOT EXISTS idx_submissions_fixture
  ON public.submissions (fixture_id, submitted_at DESC)
  INCLUDE (team_id, submitted_by);

-- Index for team-specific submissions (coach view)
CREATE INDEX IF NOT EXISTS idx_submissions_team
  ON public.submissions (team_id, fixture_id)
  INCLUDE (submitted_at);

-- Index for user submissions history (audit trail)
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by
  ON public.submissions (submitted_by, submitted_at DESC)
  INCLUDE (fixture_id, team_id);

-- ============================================================================
-- 4. INDEXES FOR PLAYER QUERIES
-- ============================================================================

-- Index for team players (stats page, goal kickers)
CREATE INDEX IF NOT EXISTS idx_eg_players_team
  ON public.eg_players (team_id, goals DESC)
  INCLUDE (name);

-- ============================================================================
-- 5. INDEXES FOR TEAMS QUERIES (if not already present)
-- ============================================================================

-- Index for slug lookups (common in fixture queries)
CREATE INDEX IF NOT EXISTS idx_eg_teams_slug
  ON public.eg_teams (slug)
  INCLUDE (name, logo_url, primary_color);

-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================
-- These indexes optimize:
-- 1. Initial fixtures load (season + round)
-- 2. Status-based filtering (LIVE, FINAL, UPCOMING)
-- 3. Team-specific fixture queries
-- 4. Match centre submissions loading
-- 5. Player stats and goal kicker lookups
--
-- The VIEW (eg_fixtures_with_teams) allows React Query to fetch all needed
-- data in a single query, eliminating N+1 problems.
--
-- Indexes are created with INCLUDE clauses for covering indexes where possible,
-- reducing the need for additional table lookups (index-only scans).
-- ============================================================================
