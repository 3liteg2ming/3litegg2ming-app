-- Preseason knockout fixture metadata support (safe additive migration)

alter table if exists public.eg_fixtures
  add column if not exists stage_name text null,
  add column if not exists stage_index integer null,
  add column if not exists bracket_slot text null,
  add column if not exists next_fixture_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'eg_fixtures_next_fixture_id_fkey'
      and conrelid = 'public.eg_fixtures'::regclass
  ) then
    alter table public.eg_fixtures
      add constraint eg_fixtures_next_fixture_id_fkey
      foreign key (next_fixture_id)
      references public.eg_fixtures(id)
      on delete set null;
  end if;
end $$;

create index if not exists eg_fixtures_season_stage_time_idx
  on public.eg_fixtures (season_id, stage_index, start_time);

create index if not exists eg_fixtures_season_round_idx
  on public.eg_fixtures (season_id, round);

create or replace view public.eg_fixtures_by_stage as
select
  f.season_id,
  coalesce(f.stage_index, f.round, 0) as stage_index,
  coalesce(nullif(trim(f.stage_name), ''), 'Round ' || coalesce(f.round, 0)::text) as stage_name,
  f.id as fixture_id,
  f.start_time,
  f.home_team_id,
  f.away_team_id,
  f.home_team_slug,
  f.away_team_slug,
  upper(coalesce(f.status, 'SCHEDULED')) as status,
  f.home_goals,
  f.home_behinds,
  f.home_total,
  f.away_goals,
  f.away_behinds,
  f.away_total,
  f.bracket_slot,
  f.next_fixture_id
from public.eg_fixtures f
order by
  f.season_id,
  coalesce(f.stage_index, f.round, 0),
  f.start_time nulls last,
  f.id;
