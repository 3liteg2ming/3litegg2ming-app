begin;

create table if not exists public.eg_player_season_totals_store (
  season_id uuid not null,
  player_id uuid not null,
  team_id uuid null,
  player_name text null,
  team_name text null,
  headshot_url text null,
  games integer not null default 0,
  goals integer not null default 0,
  behinds integer not null default 0,
  disposals integer not null default 0,
  kicks integer not null default 0,
  handballs integer not null default 0,
  marks integer not null default 0,
  tackles integer not null default 0,
  clearances integer not null default 0,
  hitouts integer not null default 0,
  fantasy_points integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

create index if not exists idx_eg_player_season_totals_store_team
  on public.eg_player_season_totals_store (team_id, season_id);

create index if not exists idx_eg_player_season_totals_store_goals
  on public.eg_player_season_totals_store (season_id, goals desc, player_name);

create or replace function public.eg_recompute_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.eg_player_season_totals_store;

  insert into public.eg_player_season_totals_store (
    season_id,
    player_id,
    team_id,
    player_name,
    team_name,
    headshot_url,
    games,
    goals,
    behinds,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    clearances,
    hitouts,
    fantasy_points,
    updated_at
  )
  with final_fixtures as (
    select
      f.id,
      f.season_id,
      f.home_team_id,
      f.away_team_id
    from public.eg_fixtures f
    where upper(coalesce(f.status::text, '')) in ('FINAL', 'COMPLETED', 'COMPLETE')
  ),
  goal_rows as (
    select
      ff.season_id,
      ff.id as fixture_id,
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      ff.home_team_id as team_id,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals
    from public.submissions s
    join final_fixtures ff on ff.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_home, '[]'::jsonb)) as kicker

    union all

    select
      ff.season_id,
      ff.id as fixture_id,
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      ff.away_team_id as team_id,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals
    from public.submissions s
    join final_fixtures ff on ff.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_away, '[]'::jsonb)) as kicker
  ),
  stat_rows as (
    select
      ff.season_id,
      fps.fixture_id,
      fps.player_id,
      coalesce(fps.team_id, p.team_id) as team_id,
      coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, '')) as player_name,
      coalesce(fps.disposals, 0) as disposals,
      coalesce(fps.kicks, 0) as kicks,
      coalesce(fps.handballs, 0) as handballs,
      coalesce(fps.marks, 0) as marks,
      coalesce(fps.tackles, 0) as tackles,
      coalesce(fps.clearances, 0) as clearances,
      0::integer as hitouts,
      0::integer as fantasy_points
    from public.eg_fixture_player_stats fps
    join final_fixtures ff on ff.id = fps.fixture_id
    left join public.eg_players p on p.id = fps.player_id
  ),
  appearance_rows as (
    select season_id, fixture_id, player_id
    from goal_rows
    where player_id is not null

    union

    select season_id, fixture_id, player_id
    from stat_rows
    where player_id is not null
  ),
  appearance_totals as (
    select
      season_id,
      player_id,
      count(distinct fixture_id)::integer as games
    from appearance_rows
    group by season_id, player_id
  ),
  goal_totals as (
    select
      season_id,
      player_id,
      max(team_id::text) as team_id_text,
      max(player_name) as player_name,
      sum(goals)::integer as goals
    from goal_rows
    where player_id is not null
    group by season_id, player_id
  ),
  stat_totals as (
    select
      season_id,
      player_id,
      max(team_id::text) as team_id_text,
      max(player_name) as player_name,
      sum(disposals)::integer as disposals,
      sum(kicks)::integer as kicks,
      sum(handballs)::integer as handballs,
      sum(marks)::integer as marks,
      sum(tackles)::integer as tackles,
      sum(clearances)::integer as clearances,
      sum(hitouts)::integer as hitouts,
      sum(fantasy_points)::integer as fantasy_points
    from stat_rows
    where player_id is not null
    group by season_id, player_id
  ),
  combined as (
    select
      a.season_id,
      a.player_id,
      coalesce(st.team_id_text, gt.team_id_text, p.team_id::text) as team_id_text,
      coalesce(st.player_name, gt.player_name, nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player') as player_name,
      p.headshot_url,
      a.games,
      coalesce(gt.goals, 0) as goals,
      0::integer as behinds,
      coalesce(st.disposals, 0) as disposals,
      coalesce(st.kicks, 0) as kicks,
      coalesce(st.handballs, 0) as handballs,
      coalesce(st.marks, 0) as marks,
      coalesce(st.tackles, 0) as tackles,
      coalesce(st.clearances, 0) as clearances,
      coalesce(st.hitouts, 0) as hitouts,
      coalesce(st.fantasy_points, 0) as fantasy_points
    from appearance_totals a
    left join goal_totals gt
      on gt.season_id = a.season_id
     and gt.player_id = a.player_id
    left join stat_totals st
      on st.season_id = a.season_id
     and st.player_id = a.player_id
    left join public.eg_players p on p.id = a.player_id
  )
  select
    c.season_id,
    c.player_id,
    nullif(c.team_id_text, '')::uuid as team_id,
    c.player_name,
    t.name as team_name,
    c.headshot_url,
    c.games,
    c.goals,
    c.behinds,
    c.disposals,
    c.kicks,
    c.handballs,
    c.marks,
    c.tackles,
    c.clearances,
    c.hitouts,
    c.fantasy_points,
    now()
  from combined c
  left join public.eg_teams t
    on t.id = nullif(c.team_id_text, '')::uuid;
end;
$$;

create or replace view public.eg_player_season_totals_table as
select
  season_id,
  team_id,
  team_name,
  player_id,
  player_name,
  games::bigint as games,
  goals::bigint as goals,
  behinds::bigint as behinds,
  disposals::bigint as disposals,
  kicks::bigint as kicks,
  handballs::bigint as handballs,
  marks::bigint as marks,
  tackles::bigint as tackles,
  clearances::bigint as clearances,
  hitouts::bigint as hitouts,
  fantasy_points::numeric as fantasy_points
from public.eg_player_season_totals_store;

create or replace view public.eg_player_season_totals as
select
  season_id,
  team_id,
  team_name,
  player_id,
  player_name,
  games::bigint as games,
  goals::integer as goals,
  behinds::integer as behinds,
  disposals::integer as disposals,
  kicks::integer as kicks,
  handballs::integer as handballs,
  marks::integer as marks,
  tackles::integer as tackles,
  clearances::integer as clearances,
  hitouts::integer as hitouts,
  fantasy_points::numeric as fantasy_points,
  headshot_url
from public.eg_player_season_totals_store;

create or replace view public.eg_player_season_averages_table as
select
  season_id,
  team_id,
  team_name,
  player_id,
  player_name,
  games::bigint as games,
  round(goals::numeric / nullif(games, 0), 2) as goals,
  round(behinds::numeric / nullif(games, 0), 2) as behinds,
  round(disposals::numeric / nullif(games, 0), 2) as disposals,
  round(kicks::numeric / nullif(games, 0), 2) as kicks,
  round(handballs::numeric / nullif(games, 0), 2) as handballs,
  round(marks::numeric / nullif(games, 0), 2) as marks,
  round(tackles::numeric / nullif(games, 0), 2) as tackles,
  round(clearances::numeric / nullif(games, 0), 2) as clearances,
  round(hitouts::numeric / nullif(games, 0), 2) as hitouts,
  round(fantasy_points::numeric / nullif(games, 0), 2) as fantasy_points
from public.eg_player_season_totals_store;

create or replace view public.eg_player_season_averages as
select
  season_id,
  team_id,
  team_name,
  player_id,
  player_name,
  games::bigint as games,
  round(goals::numeric / nullif(games, 0), 2) as goals,
  round(behinds::numeric / nullif(games, 0), 2) as behinds,
  round(disposals::numeric / nullif(games, 0), 2) as disposals,
  round(kicks::numeric / nullif(games, 0), 2) as kicks,
  round(handballs::numeric / nullif(games, 0), 2) as handballs,
  round(marks::numeric / nullif(games, 0), 2) as marks,
  round(tackles::numeric / nullif(games, 0), 2) as tackles,
  round(clearances::numeric / nullif(games, 0), 2) as clearances,
  round(hitouts::numeric / nullif(games, 0), 2) as hitouts,
  round(fantasy_points::numeric / nullif(games, 0), 2) as fantasy_points,
  headshot_url
from public.eg_player_season_totals_store;

select public.eg_recompute_stats();

commit;

notify pgrst, 'reload schema';
