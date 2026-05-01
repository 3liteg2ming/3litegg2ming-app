begin;

alter table public.eg_fixture_player_stats
  add column if not exists goals int null check (goals is null or goals >= 0),
  add column if not exists behinds int null check (behinds is null or behinds >= 0),
  add column if not exists hitouts int null check (hitouts is null or hitouts >= 0);

alter table public.eg_fixture_submission_images
  drop constraint if exists eg_fixture_submission_images_stat_key_check;

alter table public.eg_fixture_submission_images
  add constraint eg_fixture_submission_images_stat_key_check
  check (stat_key is null or stat_key in (
    'clearances', 'tackles', 'disposals', 'marks', 'kicks', 'handballs',
    'goals', 'behinds', 'afl_fantasy', 'hitouts'
  ));

create or replace function public.eg_upsert_fixture_player_stats(
  p_fixture_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_can_write boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_fixture_id is null then
    raise exception 'fixture_id is required';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  select (
    exists (
      select 1
      from public.profiles p
      where p.user_id = v_uid
        and coalesce(p.is_admin, false) = true
    )
    or exists (
      select 1
      from public.eg_fixture_submissions s
      where s.fixture_id = p_fixture_id
        and s.submitted_by_user_id = v_uid
    )
  ) into v_can_write;

  if coalesce(v_can_write, false) = false then
    raise exception 'No editable submission found for this fixture';
  end if;

  insert into public.eg_fixture_player_stats (
    fixture_id,
    player_id,
    team_id,
    goals,
    behinds,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    clearances,
    hitouts,
    fantasy_points
  )
  select
    p_fixture_id,
    nullif(trim(x->>'player_id'), '')::uuid,
    nullif(trim(x->>'team_id'), '')::uuid,
    case when coalesce(x->>'goals', '') ~ '^\d+$' then (x->>'goals')::int else null end,
    case when coalesce(x->>'behinds', '') ~ '^\d+$' then (x->>'behinds')::int else null end,
    case when coalesce(x->>'disposals', '') ~ '^\d+$' then (x->>'disposals')::int else null end,
    case when coalesce(x->>'kicks', '') ~ '^\d+$' then (x->>'kicks')::int else null end,
    case when coalesce(x->>'handballs', '') ~ '^\d+$' then (x->>'handballs')::int else null end,
    case when coalesce(x->>'marks', '') ~ '^\d+$' then (x->>'marks')::int else null end,
    case when coalesce(x->>'tackles', '') ~ '^\d+$' then (x->>'tackles')::int else null end,
    case when coalesce(x->>'clearances', '') ~ '^\d+$' then (x->>'clearances')::int else null end,
    case when coalesce(x->>'hitouts', '') ~ '^\d+$' then (x->>'hitouts')::int else null end,
    case when coalesce(x->>'fantasy_points', '') ~ '^\d+$' then (x->>'fantasy_points')::int else null end
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  where coalesce(trim(x->>'player_id'), '') <> ''
    and coalesce(trim(x->>'team_id'), '') <> ''
  on conflict (fixture_id, player_id)
  do update set
    team_id = coalesce(excluded.team_id, public.eg_fixture_player_stats.team_id),
    goals = coalesce(excluded.goals, public.eg_fixture_player_stats.goals),
    behinds = coalesce(excluded.behinds, public.eg_fixture_player_stats.behinds),
    disposals = coalesce(excluded.disposals, public.eg_fixture_player_stats.disposals),
    kicks = coalesce(excluded.kicks, public.eg_fixture_player_stats.kicks),
    handballs = coalesce(excluded.handballs, public.eg_fixture_player_stats.handballs),
    marks = coalesce(excluded.marks, public.eg_fixture_player_stats.marks),
    tackles = coalesce(excluded.tackles, public.eg_fixture_player_stats.tackles),
    clearances = coalesce(excluded.clearances, public.eg_fixture_player_stats.clearances),
    hitouts = coalesce(excluded.hitouts, public.eg_fixture_player_stats.hitouts),
    fantasy_points = coalesce(excluded.fantasy_points, public.eg_fixture_player_stats.fantasy_points),
    updated_at = now();
end;
$$;

create or replace function public.eg_admin_upsert_player_stats(
  p_token text,
  p_fixture_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  perform public.eg_assert_admin_session(p_token);

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.eg_fixture_player_stats (
      fixture_id,
      player_id,
      team_id,
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
    ) values (
      p_fixture_id,
      nullif(trim(v_row->>'player_id'), '')::uuid,
      nullif(trim(v_row->>'team_id'), '')::uuid,
      case when coalesce(v_row->>'goals', '') ~ '^\d+$' then (v_row->>'goals')::int else null end,
      case when coalesce(v_row->>'behinds', '') ~ '^\d+$' then (v_row->>'behinds')::int else null end,
      case when coalesce(v_row->>'disposals', '') ~ '^\d+$' then (v_row->>'disposals')::int else null end,
      case when coalesce(v_row->>'kicks', '') ~ '^\d+$' then (v_row->>'kicks')::int else null end,
      case when coalesce(v_row->>'handballs', '') ~ '^\d+$' then (v_row->>'handballs')::int else null end,
      case when coalesce(v_row->>'marks', '') ~ '^\d+$' then (v_row->>'marks')::int else null end,
      case when coalesce(v_row->>'tackles', '') ~ '^\d+$' then (v_row->>'tackles')::int else null end,
      case when coalesce(v_row->>'clearances', '') ~ '^\d+$' then (v_row->>'clearances')::int else null end,
      case when coalesce(v_row->>'hitouts', '') ~ '^\d+$' then (v_row->>'hitouts')::int else null end,
      case when coalesce(v_row->>'fantasy_points', '') ~ '^\d+$' then (v_row->>'fantasy_points')::int else null end,
      now()
    )
    on conflict (fixture_id, player_id)
    do update set
      team_id = coalesce(excluded.team_id, public.eg_fixture_player_stats.team_id),
      goals = coalesce(excluded.goals, public.eg_fixture_player_stats.goals),
      behinds = coalesce(excluded.behinds, public.eg_fixture_player_stats.behinds),
      disposals = coalesce(excluded.disposals, public.eg_fixture_player_stats.disposals),
      kicks = coalesce(excluded.kicks, public.eg_fixture_player_stats.kicks),
      handballs = coalesce(excluded.handballs, public.eg_fixture_player_stats.handballs),
      marks = coalesce(excluded.marks, public.eg_fixture_player_stats.marks),
      tackles = coalesce(excluded.tackles, public.eg_fixture_player_stats.tackles),
      clearances = coalesce(excluded.clearances, public.eg_fixture_player_stats.clearances),
      hitouts = coalesce(excluded.hitouts, public.eg_fixture_player_stats.hitouts),
      fantasy_points = coalesce(excluded.fantasy_points, public.eg_fixture_player_stats.fantasy_points),
      updated_at = now();
  end loop;
end;
$$;

drop view if exists public.eg_player_season_totals_ext cascade;
create or replace view public.eg_player_season_totals_ext as
select
  f.season_id,
  s.player_id,
  coalesce(p.team_id, s.team_id) as team_id,
  coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player') as player_name,
  count(distinct s.fixture_id) as matches,
  sum(coalesce(s.disposals, 0)) as disposals,
  sum(coalesce(s.kicks, 0)) as kicks,
  sum(coalesce(s.handballs, 0)) as handballs,
  sum(coalesce(s.marks, 0)) as marks,
  sum(coalesce(s.tackles, 0)) as tackles,
  sum(coalesce(s.clearances, 0)) as clearances,
  sum(coalesce(s.hitouts, 0)) as hitouts,
  sum(coalesce(s.fantasy_points, 0)) as fantasy_points
from public.eg_fixture_player_stats s
join public.eg_fixtures f on f.id = s.fixture_id
left join public.eg_players p on p.id = s.player_id
group by
  f.season_id,
  s.player_id,
  coalesce(p.team_id, s.team_id),
  coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player');

create or replace function public.eg_recompute_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.eg_player_season_totals_store;

  insert into public.eg_player_season_totals_store (
    season_id, player_id, team_id, player_name, team_name, headshot_url,
    games, goals, behinds, disposals, kicks, handballs, marks,
    tackles, clearances, hitouts, fantasy_points, updated_at
  )
  with final_fixtures as (
    select f.id, f.season_id, f.home_team_id, f.away_team_id
    from public.eg_fixtures f
    where upper(coalesce(f.status::text, '')) in ('FINAL', 'COMPLETED', 'COMPLETE')
  ),
  goal_rows as (
    select ff.season_id, ff.id as fixture_id,
      case when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (trim(kicker->>'id'))::uuid else null end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      ff.home_team_id as team_id,
      case when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0) else 0 end as goals
    from public.submissions s
    join final_fixtures ff on ff.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_home, '[]'::jsonb)) as kicker

    union all

    select ff.season_id, ff.id as fixture_id,
      case when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (trim(kicker->>'id'))::uuid else null end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      ff.away_team_id as team_id,
      case when coalesce(kicker->>'goals', '') ~ '^\d+$' then greatest((kicker->>'goals')::integer, 0) else 0 end as goals
    from public.submissions s
    join final_fixtures ff on ff.id = s.fixture_id
    cross join lateral jsonb_array_elements(coalesce(s.goal_kickers_away, '[]'::jsonb)) as kicker
  ),
  stat_rows as (
    select
      ff.season_id, fps.fixture_id, fps.player_id,
      coalesce(fps.team_id, p.team_id) as team_id,
      coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, '')) as player_name,
      coalesce(fps.behinds, 0) as behinds,
      coalesce(fps.disposals, 0) as disposals,
      coalesce(fps.kicks, 0) as kicks,
      coalesce(fps.handballs, 0) as handballs,
      coalesce(fps.marks, 0) as marks,
      coalesce(fps.tackles, 0) as tackles,
      coalesce(fps.clearances, 0) as clearances,
      coalesce(fps.hitouts, 0) as hitouts,
      coalesce(fps.fantasy_points, 0) as fantasy_points
    from public.eg_fixture_player_stats fps
    join final_fixtures ff on ff.id = fps.fixture_id
    left join public.eg_players p on p.id = fps.player_id
  ),
  appearance_rows as (
    select season_id, fixture_id, player_id from goal_rows where player_id is not null
    union
    select season_id, fixture_id, player_id from stat_rows where player_id is not null
  ),
  appearance_totals as (
    select season_id, player_id, count(distinct fixture_id)::integer as games
    from appearance_rows group by season_id, player_id
  ),
  goal_totals as (
    select season_id, player_id, max(team_id::text) as team_id_text, max(player_name) as player_name, sum(goals)::integer as goals
    from goal_rows where player_id is not null group by season_id, player_id
  ),
  stat_totals as (
    select season_id, player_id, max(team_id::text) as team_id_text, max(player_name) as player_name,
      sum(behinds)::integer as behinds,
      sum(disposals)::integer as disposals, sum(kicks)::integer as kicks,
      sum(handballs)::integer as handballs, sum(marks)::integer as marks,
      sum(tackles)::integer as tackles, sum(clearances)::integer as clearances,
      sum(hitouts)::integer as hitouts, sum(fantasy_points)::integer as fantasy_points
    from stat_rows where player_id is not null group by season_id, player_id
  ),
  combined as (
    select
      a.season_id, a.player_id,
      coalesce(st.team_id_text, gt.team_id_text, p.team_id::text) as team_id_text,
      coalesce(st.player_name, gt.player_name, nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.name, ''), 'Unknown Player') as player_name,
      p.headshot_url, a.games,
      coalesce(gt.goals, 0) as goals,
      coalesce(st.behinds, 0) as behinds,
      coalesce(st.disposals, 0) as disposals, coalesce(st.kicks, 0) as kicks,
      coalesce(st.handballs, 0) as handballs, coalesce(st.marks, 0) as marks,
      coalesce(st.tackles, 0) as tackles, coalesce(st.clearances, 0) as clearances,
      coalesce(st.hitouts, 0) as hitouts, coalesce(st.fantasy_points, 0) as fantasy_points
    from appearance_totals a
    left join goal_totals gt on gt.season_id = a.season_id and gt.player_id = a.player_id
    left join stat_totals st on st.season_id = a.season_id and st.player_id = a.player_id
    left join public.eg_players p on p.id = a.player_id
  )
  select
    c.season_id, c.player_id, nullif(c.team_id_text, '')::uuid as team_id,
    c.player_name, t.name as team_name, c.headshot_url,
    c.games, c.goals, c.behinds, c.disposals, c.kicks, c.handballs, c.marks,
    c.tackles, c.clearances, c.hitouts, c.fantasy_points, now()
  from combined c
  left join public.eg_teams t on t.id = nullif(c.team_id_text, '')::uuid;
end;
$$;

grant execute on function public.eg_upsert_fixture_player_stats(uuid, jsonb) to authenticated;
grant execute on function public.eg_admin_upsert_player_stats(text, uuid, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
