-- Update eg_fixtures_with_teams to include knockout/preseason fields.
-- Safe to run multiple times.

create or replace view public.eg_fixtures_with_teams as
select
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

  -- Knockout/preseason support (added in later migrations)
  f.stage_name,
  f.stage_index,
  f.bracket_slot,
  f.week_index,
  f.is_preseason,
  f.next_fixture_id,

  -- Home team data
  ht.slug as home_team_slug,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.logo_url as home_team_logo_url,
  ht.primary_color as home_team_colour,

  -- Away team data
  at.slug as away_team_slug,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.logo_url as away_team_logo_url,
  at.primary_color as away_team_colour
from public.eg_fixtures f
left join public.eg_teams ht on f.home_team_id = ht.id
left join public.eg_teams at on f.away_team_id = at.id;

comment on view public.eg_fixtures_with_teams is
  'Optimized fixtures view used by the app. Includes team metadata + knockout fields for preseason.';
