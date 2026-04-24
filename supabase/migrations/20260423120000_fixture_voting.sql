begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.eg_fixture_votes (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.eg_fixtures(id) on delete cascade,
  team_slug text not null,
  voter_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eg_fixture_votes_team_slug_nonempty check (nullif(btrim(team_slug), '') is not null),
  constraint eg_fixture_votes_voter_key_nonempty check (nullif(btrim(voter_key), '') is not null)
);

alter table public.eg_fixture_votes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'eg_fixture_votes_fixture_id_voter_key_key'
  ) then
    alter table public.eg_fixture_votes
      add constraint eg_fixture_votes_fixture_id_voter_key_key unique (fixture_id, voter_key);
  end if;
end $$;

create index if not exists idx_eg_fixture_votes_fixture_id
  on public.eg_fixture_votes (fixture_id);

create index if not exists idx_eg_fixture_votes_fixture_id_team_slug
  on public.eg_fixture_votes (fixture_id, team_slug);

drop trigger if exists trg_eg_fixture_votes_set_updated_at on public.eg_fixture_votes;
create trigger trg_eg_fixture_votes_set_updated_at
before update on public.eg_fixture_votes
for each row
execute function public.set_updated_at();

revoke all on public.eg_fixture_votes from anon, authenticated;
grant select on public.eg_fixture_votes to anon, authenticated;

drop policy if exists "Fixture votes public read" on public.eg_fixture_votes;
create policy "Fixture votes public read"
  on public.eg_fixture_votes
  for select
  using (true);

drop policy if exists "Fixture votes no direct insert" on public.eg_fixture_votes;
create policy "Fixture votes no direct insert"
  on public.eg_fixture_votes
  for insert
  with check (false);

drop policy if exists "Fixture votes no direct update" on public.eg_fixture_votes;
create policy "Fixture votes no direct update"
  on public.eg_fixture_votes
  for update
  using (false)
  with check (false);

drop policy if exists "Fixture votes no direct delete" on public.eg_fixture_votes;
create policy "Fixture votes no direct delete"
  on public.eg_fixture_votes
  for delete
  using (false);

create or replace function public.eg_get_fixture_vote_summary(
  p_fixture_id uuid,
  p_home_team_slug text default null,
  p_away_team_slug text default null,
  p_voter_key text default null
)
returns table(
  fixture_id uuid,
  home_votes bigint,
  away_votes bigint,
  total_votes bigint,
  current_user_vote text
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      p_fixture_id as fixture_id,
      lower(nullif(btrim(p_home_team_slug), '')) as home_slug,
      lower(nullif(btrim(p_away_team_slug), '')) as away_slug,
      nullif(btrim(p_voter_key), '') as voter_key
  ),
  votes as (
    select
      v.fixture_id,
      lower(nullif(btrim(v.team_slug), '')) as team_slug,
      nullif(btrim(v.voter_key), '') as voter_key
    from public.eg_fixture_votes v
    where v.fixture_id = p_fixture_id
  )
  select
    params.fixture_id,
    count(*) filter (where votes.team_slug = params.home_slug) as home_votes,
    count(*) filter (where votes.team_slug = params.away_slug) as away_votes,
    count(votes.fixture_id) as total_votes,
    max(case when votes.voter_key = params.voter_key then votes.team_slug end) as current_user_vote
  from params
  left join votes on votes.fixture_id = params.fixture_id
  group by params.fixture_id, params.home_slug, params.away_slug, params.voter_key;
$$;

create or replace function public.eg_cast_fixture_vote(
  p_fixture_id uuid,
  p_team_slug text,
  p_voter_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fixture_id uuid := p_fixture_id;
  v_team_slug text := lower(nullif(btrim(p_team_slug), ''));
  v_voter_key text := nullif(btrim(p_voter_key), '');
  v_vote_id uuid;
begin
  if v_fixture_id is null then
    raise exception 'fixture_id is required';
  end if;

  if v_team_slug is null then
    raise exception 'team_slug is required';
  end if;

  if v_voter_key is null then
    raise exception 'voter_key is required';
  end if;

  if not exists (
    select 1
    from public.eg_fixtures f
    where f.id = v_fixture_id
  ) then
    raise exception 'Fixture not found';
  end if;

  insert into public.eg_fixture_votes (
    fixture_id,
    team_slug,
    voter_key
  )
  values (
    v_fixture_id,
    v_team_slug,
    v_voter_key
  )
  on conflict (fixture_id, voter_key)
  do update
    set team_slug = excluded.team_slug,
        updated_at = now()
  returning id into v_vote_id;

  return v_vote_id;
end;
$$;

grant execute on function public.eg_get_fixture_vote_summary(uuid, text, text, text) to anon, authenticated;
grant execute on function public.eg_cast_fixture_vote(uuid, text, text) to anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'eg_fixture_votes'
  ) then
    execute 'alter publication supabase_realtime add table public.eg_fixture_votes';
  end if;
exception
  when insufficient_privilege then
    null;
  when undefined_object then
    null;
end $$;

commit;

notify pgrst, 'reload schema';
