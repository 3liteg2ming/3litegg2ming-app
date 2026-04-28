-- Finals Series — separate from preseason knockout
-- Adds: is_finals flag, home_seed/away_seed columns on eg_fixtures,
-- eg_finals_seedings table, eg_seed_finals_week1() RPC,
-- eg_finals_after_result() trigger for auto-progression (QF/EF -> SF -> PF -> GF),
-- eg_finals_bracket_fixtures view.

begin;

------------------------------------------------------------
-- 1) Additive columns on eg_fixtures
------------------------------------------------------------
alter table if exists public.eg_fixtures
  add column if not exists is_finals  boolean not null default false,
  add column if not exists home_seed  int,
  add column if not exists away_seed  int;

create index if not exists idx_eg_fixtures_is_finals_season
  on public.eg_fixtures (season_id, is_finals, stage_index);

-- Unique slot per season for finals only
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'eg_fixtures_finals_slot_uniq'
  ) then
    create unique index eg_fixtures_finals_slot_uniq
      on public.eg_fixtures (season_id, bracket_slot)
      where is_finals = true;
  end if;
end $$;

------------------------------------------------------------
-- 2) Finals seedings table
------------------------------------------------------------
create table if not exists public.eg_finals_seedings (
  season_id  uuid not null references public.eg_seasons(id) on delete cascade,
  team_id    uuid not null references public.eg_teams(id) on delete cascade,
  seed       int not null check (seed between 1 and 8),
  source_season_id uuid null references public.eg_seasons(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (season_id, team_id),
  unique (season_id, seed)
);

create index if not exists idx_eg_finals_seedings_season_seed
  on public.eg_finals_seedings (season_id, seed);

------------------------------------------------------------
-- 3) Seed finals Week 1 from current ladder
--    Pulls top-8 from eg_ladder_rows_v2 (or fallback eg_ladder),
--    populates eg_finals_seedings, then upserts 4 fixtures:
--    QF1 (1v4), QF2 (2v3), EF1 (5v8), EF2 (6v7)
------------------------------------------------------------
create or replace function public.eg_seed_finals_week1(
  p_season_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seeds_count int := 0;
  v_round int := 1;
  v_base_ts timestamptz := date_trunc('hour', now() + interval '1 day');
  r record;
  v_seed1 uuid; v_seed2 uuid; v_seed3 uuid; v_seed4 uuid;
  v_seed5 uuid; v_seed6 uuid; v_seed7 uuid; v_seed8 uuid;
  v_created int := 0;
begin
  if p_season_id is null then
    raise exception 'eg_seed_finals_week1: p_season_id is required';
  end if;

  -- Determine the round number to attach to finals fixtures (max regular round + 1)
  select coalesce(max(round), 0) + 1 into v_round
  from public.eg_fixtures
  where season_id = p_season_id
    and coalesce(is_finals, false) = false
    and coalesce(is_preseason, false) = false;

  -- Build top-8 from ladder view
  create temp table if not exists _eg_finals_seed_tmp (
    seed int primary key,
    team_id uuid not null
  ) on commit drop;

  truncate table _eg_finals_seed_tmp;

  if to_regclass('public.eg_ladder_rows_v2') is not null then
    insert into _eg_finals_seed_tmp (seed, team_id)
    select
      row_number() over (
        order by coalesce(points, 0) desc,
                 coalesce(percentage, 0) desc,
                 coalesce(pf, 0) desc,
                 team_id asc
      ) as seed,
      team_id
    from public.eg_ladder_rows_v2
    where season_id = p_season_id
      and team_id is not null
    limit 8;
  end if;

  select count(*) into v_seeds_count from _eg_finals_seed_tmp;

  if v_seeds_count < 8 and to_regclass('public.eg_ladder') is not null then
    truncate table _eg_finals_seed_tmp;
    insert into _eg_finals_seed_tmp (seed, team_id)
    select
      row_number() over (
        order by coalesce(position, 999) asc,
                 coalesce(points, 0) desc,
                 coalesce(percentage, 0) desc,
                 team_id asc
      ) as seed,
      team_id
    from public.eg_ladder
    where season_id = p_season_id
      and team_id is not null
    limit 8;
  end if;

  select count(*) into v_seeds_count from _eg_finals_seed_tmp;

  if v_seeds_count < 8 then
    raise exception 'eg_seed_finals_week1: need at least 8 ranked teams, got %', v_seeds_count;
  end if;

  -- Persist seedings (upsert)
  insert into public.eg_finals_seedings (season_id, team_id, seed, source_season_id)
  select p_season_id, team_id, seed, p_season_id
  from _eg_finals_seed_tmp
  on conflict (season_id, team_id)
  do update set seed = excluded.seed;

  -- Drop any seedings no longer in top-8
  delete from public.eg_finals_seedings s
  where s.season_id = p_season_id
    and not exists (select 1 from _eg_finals_seed_tmp t where t.team_id = s.team_id);

  -- Resolve seed -> team_id
  select team_id into v_seed1 from _eg_finals_seed_tmp where seed = 1;
  select team_id into v_seed2 from _eg_finals_seed_tmp where seed = 2;
  select team_id into v_seed3 from _eg_finals_seed_tmp where seed = 3;
  select team_id into v_seed4 from _eg_finals_seed_tmp where seed = 4;
  select team_id into v_seed5 from _eg_finals_seed_tmp where seed = 5;
  select team_id into v_seed6 from _eg_finals_seed_tmp where seed = 6;
  select team_id into v_seed7 from _eg_finals_seed_tmp where seed = 7;
  select team_id into v_seed8 from _eg_finals_seed_tmp where seed = 8;

  -- Helper: upsert one finals fixture by (season_id, bracket_slot)
  -- (inline below using INSERT ... ON CONFLICT)

  -- QF1: 1 v 4
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index,
    bracket_slot, is_finals, home_seed, away_seed
  ) values (
    p_season_id, v_round, 'SCHEDULED', v_base_ts, 'TBC',
    v_seed1, v_seed4, 'Qualifying Final', 1, 1,
    'QF1', true, 1, 4
  )
  on conflict (season_id, bracket_slot)
  where is_finals = true
  do update set
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stage_name = excluded.stage_name,
    stage_index = excluded.stage_index,
    week_index = excluded.week_index,
    is_finals = true,
    home_seed = excluded.home_seed,
    away_seed = excluded.away_seed;
  v_created := v_created + 1;

  -- QF2: 2 v 3
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index,
    bracket_slot, is_finals, home_seed, away_seed
  ) values (
    p_season_id, v_round, 'SCHEDULED', v_base_ts + interval '3 hour', 'TBC',
    v_seed2, v_seed3, 'Qualifying Final', 1, 1,
    'QF2', true, 2, 3
  )
  on conflict (season_id, bracket_slot)
  where is_finals = true
  do update set
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stage_name = excluded.stage_name,
    stage_index = excluded.stage_index,
    week_index = excluded.week_index,
    is_finals = true,
    home_seed = excluded.home_seed,
    away_seed = excluded.away_seed;
  v_created := v_created + 1;

  -- EF1: 5 v 8
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index,
    bracket_slot, is_finals, home_seed, away_seed
  ) values (
    p_season_id, v_round, 'SCHEDULED', v_base_ts + interval '1 day', 'TBC',
    v_seed5, v_seed8, 'Elimination Final', 1, 1,
    'EF1', true, 5, 8
  )
  on conflict (season_id, bracket_slot)
  where is_finals = true
  do update set
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stage_name = excluded.stage_name,
    stage_index = excluded.stage_index,
    week_index = excluded.week_index,
    is_finals = true,
    home_seed = excluded.home_seed,
    away_seed = excluded.away_seed;
  v_created := v_created + 1;

  -- EF2: 6 v 7
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index,
    bracket_slot, is_finals, home_seed, away_seed
  ) values (
    p_season_id, v_round, 'SCHEDULED', v_base_ts + interval '1 day' + interval '3 hour', 'TBC',
    v_seed6, v_seed7, 'Elimination Final', 1, 1,
    'EF2', true, 6, 7
  )
  on conflict (season_id, bracket_slot)
  where is_finals = true
  do update set
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stage_name = excluded.stage_name,
    stage_index = excluded.stage_index,
    week_index = excluded.week_index,
    is_finals = true,
    home_seed = excluded.home_seed,
    away_seed = excluded.away_seed;
  v_created := v_created + 1;

  return json_build_object(
    'season_id', p_season_id,
    'created', v_created,
    'round', v_round
  );
end;
$$;

grant execute on function public.eg_seed_finals_week1(uuid) to authenticated, service_role;

------------------------------------------------------------
-- 4) Auto-progression trigger (QF/EF -> SF -> PF -> GF)
--    AFL 2025 pairing rules:
--      SF1 = loser(QF1) hosts winner(EF2)
--      SF2 = loser(QF2) hosts winner(EF1)
--      PF1 = winner(QF1) hosts winner(SF1)
--      PF2 = winner(QF2) hosts winner(SF2)
--      GF  = winner(PF1) vs winner(PF2) at MCG
------------------------------------------------------------
create or replace function public.eg_finals_progression(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  qf1 record; qf2 record; ef1 record; ef2 record;
  sf1 record; sf2 record;
  pf1 record; pf2 record;
  v_base_ts timestamptz;
  function_result_dummy int;
begin
  if p_season_id is null then return; end if;

  -- Helper: load finals fixture by slot (single row)
  select * into qf1 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'QF1';
  select * into qf2 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'QF2';
  select * into ef1 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'EF1';
  select * into ef2 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'EF2';

  -- Stage 1 -> Stage 2 cascade (Week 1 QF/EF -> Semis)
  if qf1.id is not null and qf2.id is not null and ef1.id is not null and ef2.id is not null
     and upper(coalesce(qf1.status::text,'')) = 'FINAL'
     and upper(coalesce(qf2.status::text,'')) = 'FINAL'
     and upper(coalesce(ef1.status::text,'')) = 'FINAL'
     and upper(coalesce(ef2.status::text,'')) = 'FINAL'
     and qf1.home_total is not null and qf1.away_total is not null
     and qf2.home_total is not null and qf2.away_total is not null
     and ef1.home_total is not null and ef1.away_total is not null
     and ef2.home_total is not null and ef2.away_total is not null
  then
    -- compute base time = max(qf/ef start_time) + 7 days
    v_base_ts := date_trunc('hour', greatest(
      coalesce(qf1.start_time, now()),
      coalesce(qf2.start_time, now()),
      coalesce(ef1.start_time, now()),
      coalesce(ef2.start_time, now())
    ) + interval '7 days');

    -- SF1: loser(QF1) hosts winner(EF2)
    insert into public.eg_fixtures (
      season_id, round, status, start_time, venue,
      home_team_id, away_team_id, stage_name, stage_index, week_index,
      bracket_slot, is_finals, home_seed, away_seed
    ) values (
      p_season_id,
      coalesce(qf1.round, 1),
      'SCHEDULED',
      v_base_ts,
      'TBC',
      case when qf1.home_total < qf1.away_total then qf1.home_team_id
           when qf1.home_total > qf1.away_total then qf1.away_team_id
           else qf1.home_team_id end,
      case when ef2.home_total > ef2.away_total then ef2.home_team_id
           when ef2.home_total < ef2.away_total then ef2.away_team_id
           else ef2.home_team_id end,
      'Semi Final', 2, 2, 'SF1', true,
      case when qf1.home_total < qf1.away_total then qf1.home_seed
           when qf1.home_total > qf1.away_total then qf1.away_seed
           else qf1.home_seed end,
      case when ef2.home_total > ef2.away_total then ef2.home_seed
           when ef2.home_total < ef2.away_total then ef2.away_seed
           else ef2.home_seed end
    )
    on conflict (season_id, bracket_slot) where is_finals = true
    do update set
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_seed = excluded.home_seed,
      away_seed = excluded.away_seed,
      stage_name = excluded.stage_name,
      stage_index = excluded.stage_index,
      week_index = excluded.week_index;

    -- SF2: loser(QF2) hosts winner(EF1)
    insert into public.eg_fixtures (
      season_id, round, status, start_time, venue,
      home_team_id, away_team_id, stage_name, stage_index, week_index,
      bracket_slot, is_finals, home_seed, away_seed
    ) values (
      p_season_id,
      coalesce(qf2.round, 1),
      'SCHEDULED',
      v_base_ts + interval '3 hour',
      'TBC',
      case when qf2.home_total < qf2.away_total then qf2.home_team_id
           when qf2.home_total > qf2.away_total then qf2.away_team_id
           else qf2.home_team_id end,
      case when ef1.home_total > ef1.away_total then ef1.home_team_id
           when ef1.home_total < ef1.away_total then ef1.away_team_id
           else ef1.home_team_id end,
      'Semi Final', 2, 2, 'SF2', true,
      case when qf2.home_total < qf2.away_total then qf2.home_seed
           when qf2.home_total > qf2.away_total then qf2.away_seed
           else qf2.home_seed end,
      case when ef1.home_total > ef1.away_total then ef1.home_seed
           when ef1.home_total < ef1.away_total then ef1.away_seed
           else ef1.home_seed end
    )
    on conflict (season_id, bracket_slot) where is_finals = true
    do update set
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_seed = excluded.home_seed,
      away_seed = excluded.away_seed,
      stage_name = excluded.stage_name,
      stage_index = excluded.stage_index,
      week_index = excluded.week_index;
  end if;

  -- Stage 2 -> Stage 3 cascade (Semis -> Prelims)
  select * into sf1 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'SF1';
  select * into sf2 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'SF2';

  if sf1.id is not null and sf2.id is not null
     and upper(coalesce(sf1.status::text,'')) = 'FINAL'
     and upper(coalesce(sf2.status::text,'')) = 'FINAL'
     and sf1.home_total is not null and sf1.away_total is not null
     and sf2.home_total is not null and sf2.away_total is not null
  then
    v_base_ts := date_trunc('hour', greatest(
      coalesce(sf1.start_time, now()),
      coalesce(sf2.start_time, now())
    ) + interval '7 days');

    -- PF1: winner(QF1) hosts winner(SF1)
    insert into public.eg_fixtures (
      season_id, round, status, start_time, venue,
      home_team_id, away_team_id, stage_name, stage_index, week_index,
      bracket_slot, is_finals, home_seed, away_seed
    ) values (
      p_season_id,
      coalesce(sf1.round, 1),
      'SCHEDULED',
      v_base_ts,
      'TBC',
      case when qf1.home_total > qf1.away_total then qf1.home_team_id
           when qf1.home_total < qf1.away_total then qf1.away_team_id
           else qf1.home_team_id end,
      case when sf1.home_total > sf1.away_total then sf1.home_team_id
           when sf1.home_total < sf1.away_total then sf1.away_team_id
           else sf1.home_team_id end,
      'Preliminary Final', 3, 3, 'PF1', true,
      case when qf1.home_total > qf1.away_total then qf1.home_seed
           when qf1.home_total < qf1.away_total then qf1.away_seed
           else qf1.home_seed end,
      case when sf1.home_total > sf1.away_total then sf1.home_seed
           when sf1.home_total < sf1.away_total then sf1.away_seed
           else sf1.home_seed end
    )
    on conflict (season_id, bracket_slot) where is_finals = true
    do update set
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_seed = excluded.home_seed,
      away_seed = excluded.away_seed,
      stage_name = excluded.stage_name,
      stage_index = excluded.stage_index,
      week_index = excluded.week_index;

    -- PF2: winner(QF2) hosts winner(SF2)
    insert into public.eg_fixtures (
      season_id, round, status, start_time, venue,
      home_team_id, away_team_id, stage_name, stage_index, week_index,
      bracket_slot, is_finals, home_seed, away_seed
    ) values (
      p_season_id,
      coalesce(sf2.round, 1),
      'SCHEDULED',
      v_base_ts + interval '3 hour',
      'TBC',
      case when qf2.home_total > qf2.away_total then qf2.home_team_id
           when qf2.home_total < qf2.away_total then qf2.away_team_id
           else qf2.home_team_id end,
      case when sf2.home_total > sf2.away_total then sf2.home_team_id
           when sf2.home_total < sf2.away_total then sf2.away_team_id
           else sf2.home_team_id end,
      'Preliminary Final', 3, 3, 'PF2', true,
      case when qf2.home_total > qf2.away_total then qf2.home_seed
           when qf2.home_total < qf2.away_total then qf2.away_seed
           else qf2.home_seed end,
      case when sf2.home_total > sf2.away_total then sf2.home_seed
           when sf2.home_total < sf2.away_total then sf2.away_seed
           else sf2.home_seed end
    )
    on conflict (season_id, bracket_slot) where is_finals = true
    do update set
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_seed = excluded.home_seed,
      away_seed = excluded.away_seed,
      stage_name = excluded.stage_name,
      stage_index = excluded.stage_index,
      week_index = excluded.week_index;
  end if;

  -- Stage 3 -> Stage 4 cascade (Prelims -> Grand Final)
  select * into pf1 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'PF1';
  select * into pf2 from public.eg_fixtures where season_id = p_season_id and is_finals = true and bracket_slot = 'PF2';

  if pf1.id is not null and pf2.id is not null
     and upper(coalesce(pf1.status::text,'')) = 'FINAL'
     and upper(coalesce(pf2.status::text,'')) = 'FINAL'
     and pf1.home_total is not null and pf1.away_total is not null
     and pf2.home_total is not null and pf2.away_total is not null
  then
    v_base_ts := date_trunc('hour', greatest(
      coalesce(pf1.start_time, now()),
      coalesce(pf2.start_time, now())
    ) + interval '7 days');

    -- GF: winner(PF1) vs winner(PF2) at MCG
    insert into public.eg_fixtures (
      season_id, round, status, start_time, venue,
      home_team_id, away_team_id, stage_name, stage_index, week_index,
      bracket_slot, is_finals, home_seed, away_seed
    ) values (
      p_season_id,
      coalesce(pf1.round, 1),
      'SCHEDULED',
      v_base_ts,
      'MCG',
      case when pf1.home_total > pf1.away_total then pf1.home_team_id
           when pf1.home_total < pf1.away_total then pf1.away_team_id
           else pf1.home_team_id end,
      case when pf2.home_total > pf2.away_total then pf2.home_team_id
           when pf2.home_total < pf2.away_total then pf2.away_team_id
           else pf2.home_team_id end,
      'Grand Final', 4, 4, 'GF', true,
      case when pf1.home_total > pf1.away_total then pf1.home_seed
           when pf1.home_total < pf1.away_total then pf1.away_seed
           else pf1.home_seed end,
      case when pf2.home_total > pf2.away_total then pf2.home_seed
           when pf2.home_total < pf2.away_total then pf2.away_seed
           else pf2.home_seed end
    )
    on conflict (season_id, bracket_slot) where is_finals = true
    do update set
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_seed = excluded.home_seed,
      away_seed = excluded.away_seed,
      venue = 'MCG',
      stage_name = excluded.stage_name,
      stage_index = excluded.stage_index,
      week_index = excluded.week_index;
  end if;
end;
$$;

grant execute on function public.eg_finals_progression(uuid) to authenticated, service_role;

create or replace function public.eg_finals_after_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when the row is a finals fixture and just transitioned/updated to FINAL
  if coalesce(new.is_finals, false) = false then
    return new;
  end if;

  if upper(coalesce(new.status::text, '')) <> 'FINAL' then
    return new;
  end if;

  if new.home_total is null or new.away_total is null then
    return new;
  end if;

  perform public.eg_finals_progression(new.season_id);
  return new;
end;
$$;

drop trigger if exists eg_fixtures_finals_progression on public.eg_fixtures;
create trigger eg_fixtures_finals_progression
  after update of status, home_total, away_total
  on public.eg_fixtures
  for each row
  execute function public.eg_finals_after_result();

------------------------------------------------------------
-- 5) Read view for finals bracket
------------------------------------------------------------
create or replace view public.eg_finals_bracket_fixtures as
select
  f.season_id,
  f.id as fixture_id,
  f.round,
  coalesce(f.stage_name, '') as stage_name,
  coalesce(f.stage_index, 1) as stage_index,
  f.bracket_slot,
  f.start_time,
  f.status,
  f.venue,
  f.home_team_id,
  f.away_team_id,
  f.home_seed,
  f.away_seed,
  f.home_goals,
  f.home_behinds,
  f.home_total,
  f.away_goals,
  f.away_behinds,
  f.away_total,
  f.next_fixture_id
from public.eg_fixtures f
where coalesce(f.is_finals, false) = true
order by f.season_id, coalesce(f.stage_index, 1), coalesce(f.start_time, now());

commit;
