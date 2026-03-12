begin;

create extension if not exists pgcrypto;

create or replace function public.eg_submit_result_v2(
  p_fixture_id uuid,
  p_home_goals integer,
  p_home_behinds integer,
  p_away_goals integer,
  p_away_behinds integer,
  p_venue text default null,
  p_goal_kickers_home jsonb default null,
  p_goal_kickers_away jsonb default null,
  p_ocr jsonb default null,
  p_notes text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
  v_profile_source text := null;
  v_fixture_row record;
  v_submission_id uuid;
  v_home_total integer;
  v_away_total integer;
  v_submitted_at timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select team_id, 'eg_profiles'
    into v_team_id, v_profile_source
  from public.eg_profiles
  where user_id = v_user_id
  limit 1;

  if v_team_id is null then
    select team_id, 'profiles'
      into v_team_id, v_profile_source
    from public.profiles
    where user_id = v_user_id
    limit 1;
  end if;

  if v_team_id is null then
    begin
      select team_id, 'profiles.id'
        into v_team_id, v_profile_source
      from public.profiles
      where id = v_user_id
      limit 1;
    exception when undefined_column then
      null;
    end;
  end if;

  if v_team_id is null then
    raise exception 'User not linked to a team';
  end if;

  if p_home_goals is null
     or p_home_behinds is null
     or p_away_goals is null
     or p_away_behinds is null then
    raise exception 'Complete score required';
  end if;

  select id, season_id, home_team_id, away_team_id, status
    into v_fixture_row
  from public.eg_fixtures
  where id = p_fixture_id
  for update;

  if v_fixture_row is null then
    raise exception 'Fixture not found';
  end if;

  if v_team_id::text not in (
    coalesce(v_fixture_row.home_team_id::text, ''),
    coalesce(v_fixture_row.away_team_id::text, '')
  ) then
    raise exception 'Assigned team is not participating in this fixture';
  end if;

  if upper(coalesce(v_fixture_row.status::text, '')) in ('FINAL', 'COMPLETED', 'COMPLETE') then
    raise exception 'Fixture is already FINAL, cannot resubmit';
  end if;

  if exists(select 1 from public.submissions where fixture_id = p_fixture_id) then
    raise exception 'Fixture already has a submitted result';
  end if;

  v_home_total := (p_home_goals * 6) + p_home_behinds;
  v_away_total := (p_away_goals * 6) + p_away_behinds;
  v_submission_id := gen_random_uuid();

  insert into public.submissions (
    id,
    fixture_id,
    team_id,
    submitted_by,
    home_goals,
    home_behinds,
    away_goals,
    away_behinds,
    goal_kickers_home,
    goal_kickers_away,
    ocr_raw_text,
    notes,
    submitted_at
  )
  values (
    v_submission_id,
    p_fixture_id,
    v_team_id,
    v_user_id,
    p_home_goals,
    p_home_behinds,
    p_away_goals,
    p_away_behinds,
    p_goal_kickers_home,
    p_goal_kickers_away,
    p_ocr ->> 'rawText',
    p_notes,
    v_submitted_at
  );

  update public.eg_fixtures
  set
    home_goals = p_home_goals,
    home_behinds = p_home_behinds,
    away_goals = p_away_goals,
    away_behinds = p_away_behinds,
    home_total = v_home_total,
    away_total = v_away_total,
    status = 'FINAL',
    submitted_by = v_user_id,
    submitted_at = v_submitted_at,
    venue = coalesce(p_venue, venue)
  where id = p_fixture_id;

  with kicker_rows as (
    select
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals,
      v_fixture_row.home_team_id as team_id
    from jsonb_array_elements(coalesce(p_goal_kickers_home, '[]'::jsonb)) as kicker

    union all

    select
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals,
      v_fixture_row.away_team_id as team_id
    from jsonb_array_elements(coalesce(p_goal_kickers_away, '[]'::jsonb)) as kicker
  ),
  aggregated_kickers as (
    select
      player_id,
      max(player_name) as player_name,
      max(team_id) as team_id,
      sum(goals) as goals
    from kicker_rows
    where player_id is not null
      and goals > 0
    group by player_id
  )
  insert into public.eg_players (id, name, display_name, full_name, goals, team_id)
  select
    player_id,
    player_name,
    player_name,
    player_name,
    goals,
    team_id
  from aggregated_kickers
  on conflict (id) do update
  set
    name = coalesce(excluded.name, public.eg_players.name),
    display_name = coalesce(excluded.display_name, public.eg_players.display_name),
    full_name = coalesce(excluded.full_name, public.eg_players.full_name),
    team_id = coalesce(excluded.team_id, public.eg_players.team_id),
    goals = coalesce(public.eg_players.goals, 0) + coalesce(excluded.goals, 0);

  if to_regprocedure('public.eg_recompute_ladder()') is not null then
    perform public.eg_recompute_ladder();
  end if;

  if to_regprocedure('public.eg_recompute_stats()') is not null then
    perform public.eg_recompute_stats();
  end if;

  return json_build_object(
    'ok', true,
    'submission_id', v_submission_id,
    'fixture_id', p_fixture_id,
    'season_id', v_fixture_row.season_id,
    'submitted_team_id', v_team_id,
    'profile_source', v_profile_source,
    'home_total', v_home_total,
    'away_total', v_away_total,
    'status', 'FINAL',
    'submitted_at', v_submitted_at
  );
end;
$$;

grant execute on function public.eg_submit_result_v2(
  uuid,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  text
) to authenticated;

create or replace view public.eg_player_season_totals_ext as
with stat_rows as (
  select
    f.season_id,
    s.player_id,
    coalesce(p.team_id, s.team_id) as team_id,
    count(distinct s.fixture_id) as matches,
    sum(coalesce(s.disposals, 0)) as disposals,
    sum(coalesce(s.kicks, 0)) as kicks,
    sum(coalesce(s.handballs, 0)) as handballs,
    sum(coalesce(s.marks, 0)) as marks,
    sum(coalesce(s.tackles, 0)) as tackles,
    sum(coalesce(s.clearances, 0)) as clearances
  from public.eg_fixture_player_stats s
  join public.eg_fixtures f on f.id = s.fixture_id
  left join public.eg_players p on p.id = s.player_id
  group by f.season_id, s.player_id, coalesce(p.team_id, s.team_id)
),
goal_rows as (
  with parsed_goal_rows as (
    select
      f.season_id,
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      f.home_team_id as team_id,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals
    from public.submissions s
    join public.eg_fixtures f on f.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_home, '[]'::jsonb)) as kicker

    union all

    select
      f.season_id,
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      f.away_team_id as team_id,
      case
        when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0)
        else 0
      end as goals
    from public.submissions s
    join public.eg_fixtures f on f.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_away, '[]'::jsonb)) as kicker
  )
  select
    season_id,
    player_id,
    max(team_id) as team_id,
    sum(goals) as goals
  from parsed_goal_rows
  where player_id is not null
    and goals > 0
  group by season_id, player_id
)
select
  coalesce(sr.season_id, gr.season_id) as season_id,
  coalesce(sr.player_id, gr.player_id) as player_id,
  coalesce(sr.team_id, gr.team_id, p.team_id) as team_id,
  coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player') as player_name,
  coalesce(sr.matches, 0) as matches,
  coalesce(gr.goals, 0) as goals,
  coalesce(sr.disposals, 0) as disposals,
  coalesce(sr.kicks, 0) as kicks,
  coalesce(sr.handballs, 0) as handballs,
  coalesce(sr.marks, 0) as marks,
  coalesce(sr.tackles, 0) as tackles,
  coalesce(sr.clearances, 0) as clearances
from stat_rows sr
full outer join goal_rows gr
  on sr.season_id = gr.season_id
 and sr.player_id = gr.player_id
left join public.eg_players p
  on p.id = coalesce(sr.player_id, gr.player_id);

commit;

notify pgrst, 'reload schema';
