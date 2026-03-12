begin;

drop policy if exists "submissions_select_own" on public.submissions;
drop policy if exists "submissions_select_authenticated" on public.submissions;
create policy "submissions_select_authenticated" on public.submissions
  for select
  using (auth.role() = 'authenticated');

create or replace function public.eg_submit_result_home_only(
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
  v_has_profile boolean := false;
  v_fixture_row record;
  v_submission_id uuid;
  v_home_total integer;
  v_away_total integer;
  v_result json;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from public.eg_profiles where user_id = v_user_id)
      or exists(select 1 from public.profiles where user_id = v_user_id)
    into v_has_profile;

  if coalesce(v_has_profile, false) = false then
    raise exception 'No profile found for user';
  end if;

  select team_id
    into v_team_id
  from public.eg_profiles
  where user_id = v_user_id
  limit 1;

  if v_team_id is null then
    select team_id
      into v_team_id
    from public.profiles
    where user_id = v_user_id
    limit 1;
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

  select id, home_team_id, away_team_id, status
    into v_fixture_row
  from public.eg_fixtures
  where id = p_fixture_id
  for update;

  if v_fixture_row is null then
    raise exception 'Fixture not found';
  end if;

  if v_team_id::text <> coalesce(v_fixture_row.home_team_id::text, '') then
    raise exception 'Only the home team can submit results (home-team-only policy)';
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
    now()
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
    submitted_at = now(),
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
  insert into public.eg_players (id, name, goals, team_id)
  select
    player_id,
    player_name,
    goals,
    team_id
  from aggregated_kickers
  on conflict (id) do update
  set
    name = coalesce(excluded.name, public.eg_players.name),
    team_id = coalesce(excluded.team_id, public.eg_players.team_id),
    goals = coalesce(public.eg_players.goals, 0) + coalesce(excluded.goals, 0);

  begin
    perform public.eg_recompute_ladder();
  exception when undefined_function then
    null;
  end;

  begin
    perform public.eg_recompute_stats();
  exception when undefined_function then
    null;
  end;

  v_result := json_build_object(
    'submission_id', v_submission_id,
    'fixture_id', p_fixture_id,
    'home_goals', p_home_goals,
    'home_behinds', p_home_behinds,
    'away_goals', p_away_goals,
    'away_behinds', p_away_behinds,
    'home_total', v_home_total,
    'away_total', v_away_total,
    'status', 'FINAL',
    'submitted_at', now()
  );

  return v_result;
end;
$$;

commit;
