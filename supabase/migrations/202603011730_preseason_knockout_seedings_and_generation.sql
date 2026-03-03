-- Preseason knockout seedings + fixture generation (ship-ready)

alter table if exists public.eg_fixtures
  add column if not exists week_index int null,
  add column if not exists is_preseason boolean not null default false;

create index if not exists idx_eg_fixtures_season_week_start
  on public.eg_fixtures (season_id, week_index, start_time);

create table if not exists public.eg_preseason_seedings (
  season_id uuid not null references public.eg_seasons(id) on delete cascade,
  team_id uuid not null references public.eg_teams(id) on delete cascade,
  seed int not null,
  source_season_id uuid null references public.eg_seasons(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (season_id, team_id),
  unique (season_id, seed)
);

create index if not exists idx_eg_preseason_seedings_season_seed
  on public.eg_preseason_seedings (season_id, seed);

create or replace function public.eg_build_preseason_seedings(
  p_preseason_season_id uuid,
  p_source_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  create temp table if not exists _eg_seed_tmp (
    team_id uuid not null,
    seed int not null
  ) on commit drop;

  truncate table _eg_seed_tmp;

  if to_regclass('public.eg_ladder') is not null then
    execute '
      insert into _eg_seed_tmp(team_id, seed)
      select team_id,
             row_number() over (
               order by coalesce(position, 999) asc,
                        coalesce(points, 0) desc,
                        coalesce(percentage, 0) desc,
                        team_id asc
             ) as seed
      from public.eg_ladder
      where season_id = $1
        and team_id is not null'
    using p_source_season_id;
  end if;

  select count(*) into v_count from _eg_seed_tmp;

  if v_count = 0 and to_regclass('public.eg_team_season_totals') is not null then
    execute '
      insert into _eg_seed_tmp(team_id, seed)
      select team_id,
             row_number() over (
               order by coalesce(points, 0) desc,
                        coalesce(percentage, 0) desc,
                        team_id asc
             ) as seed
      from public.eg_team_season_totals
      where season_id = $1
        and team_id is not null'
    using p_source_season_id;
  end if;

  select count(*) into v_count from _eg_seed_tmp;

  if v_count = 0 then
    insert into _eg_seed_tmp(team_id, seed)
    select id,
           row_number() over (order by name asc, id asc) as seed
    from public.eg_teams;
  end if;

  insert into public.eg_preseason_seedings (season_id, team_id, seed, source_season_id)
  select p_preseason_season_id, t.team_id, t.seed, p_source_season_id
  from _eg_seed_tmp t
  on conflict (season_id, team_id)
  do update set
    seed = excluded.seed,
    source_season_id = excluded.source_season_id;

  delete from public.eg_preseason_seedings s
  where s.season_id = p_preseason_season_id
    and not exists (
      select 1
      from _eg_seed_tmp t
      where t.team_id = s.team_id
    );
end;
$$;

create or replace function public.eg_generate_preseason_fixtures(
  p_preseason_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int := 0;
  v_team_count int := 0;
  v_match_count int := 0;
  i int;
  home_team uuid;
  away_team uuid;
  base_ts timestamptz := now();
begin
  select count(*) into v_existing
  from public.eg_fixtures
  where season_id = p_preseason_season_id
    and coalesce(is_preseason, false) = true;

  if v_existing > 0 then
    return;
  end if;

  create temp table if not exists _eg_seed_order (
    seed int not null,
    team_id uuid not null
  ) on commit drop;

  truncate table _eg_seed_order;

  insert into _eg_seed_order(seed, team_id)
  select seed, team_id
  from public.eg_preseason_seedings
  where season_id = p_preseason_season_id
  order by seed asc;

  select count(*) into v_team_count from _eg_seed_order;
  if v_team_count < 2 then
    return;
  end if;

  v_match_count := ceil(v_team_count::numeric / 2.0)::int;

  -- Week 1 seeded matchups: 1vN, 2vN-1, ...
  for i in 1..v_match_count loop
    select team_id into home_team from _eg_seed_order where seed = i;
    select team_id into away_team from _eg_seed_order where seed = (v_team_count - i + 1);

    if home_team is null and away_team is null then
      continue;
    end if;

    insert into public.eg_fixtures (
      season_id,
      round,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id,
      stage_name,
      stage_index,
      week_index,
      bracket_slot,
      is_preseason
    ) values (
      p_preseason_season_id,
      1,
      'SCHEDULED',
      base_ts + ((i - 1) * interval '2 hour'),
      'TBC',
      home_team,
      away_team,
      'Week 1',
      1,
      1,
      'W1-M' || i,
      true
    );
  end loop;

  -- Week 2 placeholders
  for i in 1..v_match_count loop
    insert into public.eg_fixtures (
      season_id,
      round,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id,
      stage_name,
      stage_index,
      week_index,
      bracket_slot,
      is_preseason
    ) values (
      p_preseason_season_id,
      2,
      'SCHEDULED',
      base_ts + interval '7 days' + ((i - 1) * interval '2 hour'),
      'TBC',
      null,
      null,
      'Week 2',
      2,
      2,
      'W2-M' || i,
      true
    );
  end loop;

  -- Week 3 placeholders
  for i in 1..v_match_count loop
    insert into public.eg_fixtures (
      season_id,
      round,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id,
      stage_name,
      stage_index,
      week_index,
      bracket_slot,
      is_preseason
    ) values (
      p_preseason_season_id,
      3,
      'SCHEDULED',
      base_ts + interval '14 days' + ((i - 1) * interval '2 hour'),
      'TBC',
      null,
      null,
      'Week 3',
      3,
      3,
      'W3-M' || i,
      true
    );
  end loop;

  -- Finals placeholders: 2 semis + grand final
  insert into public.eg_fixtures (
    season_id,
    round,
    status,
    start_time,
    venue,
    home_team_id,
    away_team_id,
    stage_name,
    stage_index,
    week_index,
    bracket_slot,
    is_preseason
  ) values
    (p_preseason_season_id, 4, 'SCHEDULED', base_ts + interval '21 days', 'TBC', null, null, 'Semi Finals', 4, 4, 'F-SF1', true),
    (p_preseason_season_id, 4, 'SCHEDULED', base_ts + interval '21 days' + interval '2 hour', 'TBC', null, null, 'Semi Finals', 4, 4, 'F-SF2', true),
    (p_preseason_season_id, 4, 'SCHEDULED', base_ts + interval '28 days', 'TBC', null, null, 'Grand Final', 5, 4, 'F-GF', true);
end;
$$;

create or replace view public.eg_preseason_bracket_fixtures as
select
  f.season_id,
  coalesce(f.week_index, 1) as week_index,
  coalesce(nullif(trim(f.stage_name), ''), 'Week ' || coalesce(f.week_index, 1)::text) as stage_name,
  coalesce(f.stage_index, f.week_index, f.round, 1) as stage_index,
  f.id as fixture_id,
  f.start_time,
  f.status,
  f.venue,
  f.home_team_id,
  f.away_team_id,
  f.home_goals,
  f.home_behinds,
  f.home_total,
  f.away_goals,
  f.away_behinds,
  f.away_total,
  f.bracket_slot,
  f.next_fixture_id
from public.eg_fixtures f
where coalesce(f.is_preseason, false) = true
order by f.season_id, coalesce(f.week_index, 1), coalesce(f.stage_index, 1), f.start_time;
