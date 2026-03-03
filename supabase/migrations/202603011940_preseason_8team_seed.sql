-- Preseason knockout 8-team seed + fixture generator (idempotent)

alter table if exists public.eg_fixtures
  add column if not exists stage_name text null,
  add column if not exists stage_index int null,
  add column if not exists bracket_slot text null,
  add column if not exists week_index int null,
  add column if not exists is_preseason boolean not null default false;

create index if not exists idx_eg_fixtures_season_round
  on public.eg_fixtures (season_id, round);

create index if not exists idx_eg_fixtures_season_stage_start
  on public.eg_fixtures (season_id, stage_index, start_time);

create table if not exists public.eg_preseason_seedings (
  season_id uuid not null references public.eg_seasons(id) on delete cascade,
  team_id uuid not null references public.eg_teams(id) on delete cascade,
  seed int not null check (seed between 1 and 8),
  source_season_id uuid null references public.eg_seasons(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (season_id, seed),
  unique (season_id, team_id)
);

create index if not exists idx_eg_preseason_seedings_season_seed
  on public.eg_preseason_seedings (season_id, seed);

create or replace function public.eg_seed_preseason_8team(
  p_preseason_season_id uuid,
  p_team_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len int;
begin
  if p_preseason_season_id is null then
    raise exception 'p_preseason_season_id is required';
  end if;

  v_len := coalesce(array_length(p_team_ids, 1), 0);
  if v_len <> 8 then
    raise exception 'p_team_ids must contain exactly 8 team ids in seed order (got %)', v_len;
  end if;

  delete from public.eg_preseason_seedings
  where season_id = p_preseason_season_id;

  insert into public.eg_preseason_seedings (season_id, team_id, seed)
  select
    p_preseason_season_id as season_id,
    p_team_ids[i] as team_id,
    i as seed
  from generate_subscripts(p_team_ids, 1) as i
  where p_team_ids[i] is not null;
end;
$$;

create or replace function public.eg_generate_preseason_8team_fixtures(
  p_preseason_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int := 0;
  s1 uuid;
  s2 uuid;
  s3 uuid;
  s4 uuid;
  s5 uuid;
  s6 uuid;
  s7 uuid;
  s8 uuid;
begin
  if p_preseason_season_id is null then
    raise exception 'p_preseason_season_id is required';
  end if;

  select count(*) into v_existing
  from public.eg_fixtures
  where season_id = p_preseason_season_id
    and coalesce(is_preseason, false) = true;

  if v_existing > 0 then
    return;
  end if;

  select team_id into s1 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 1;
  select team_id into s2 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 2;
  select team_id into s3 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 3;
  select team_id into s4 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 4;
  select team_id into s5 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 5;
  select team_id into s6 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 6;
  select team_id into s7 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 7;
  select team_id into s8 from public.eg_preseason_seedings where season_id = p_preseason_season_id and seed = 8;

  if s1 is null or s2 is null or s3 is null or s4 is null or s5 is null or s6 is null or s7 is null or s8 is null then
    raise exception 'eg_preseason_seedings must contain seeds 1..8 for season % before fixture generation', p_preseason_season_id;
  end if;

  -- Round 1: Quarter Finals (known teams)
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index, bracket_slot, is_preseason
  ) values
    (p_preseason_season_id, 1, 'scheduled', null, 'TBC', s1, s8, 'Quarter Finals', 1, 1, 'QF1', true),
    (p_preseason_season_id, 1, 'scheduled', null, 'TBC', s2, s7, 'Quarter Finals', 1, 1, 'QF2', true),
    (p_preseason_season_id, 1, 'scheduled', null, 'TBC', s3, s6, 'Quarter Finals', 1, 1, 'QF3', true),
    (p_preseason_season_id, 1, 'scheduled', null, 'TBC', s4, s5, 'Quarter Finals', 1, 1, 'QF4', true);

  -- Round 2: Semi Finals (TBD)
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index, bracket_slot, is_preseason
  ) values
    (p_preseason_season_id, 2, 'scheduled', null, 'TBC', null, null, 'Semi Finals', 2, 2, 'SF1', true),
    (p_preseason_season_id, 2, 'scheduled', null, 'TBC', null, null, 'Semi Finals', 2, 2, 'SF2', true);

  -- Round 3: Grand Final (TBD)
  insert into public.eg_fixtures (
    season_id, round, status, start_time, venue,
    home_team_id, away_team_id, stage_name, stage_index, week_index, bracket_slot, is_preseason
  ) values
    (p_preseason_season_id, 3, 'scheduled', null, 'TBC', null, null, 'Grand Final', 3, 3, 'GF', true);
end;
$$;

create or replace view public.eg_preseason_bracket_view as
select
  f.season_id,
  f.id as fixture_id,
  coalesce(f.round, 1) as round,
  coalesce(f.stage_name, 'Round ' || coalesce(f.round, 1)::text) as stage_name,
  coalesce(f.stage_index, f.round, 1) as stage_index,
  f.bracket_slot,
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
  f.next_fixture_id
from public.eg_fixtures f
where coalesce(f.is_preseason, false) = true
order by
  f.season_id,
  coalesce(f.round, 1),
  coalesce(f.stage_index, f.round, 1),
  coalesce(f.bracket_slot, ''),
  f.start_time nulls last;
