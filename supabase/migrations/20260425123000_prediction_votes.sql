begin;

create extension if not exists pgcrypto;

create table if not exists public.eg_prediction_votes (
  id uuid primary key default gen_random_uuid(),
  poll_key text not null,
  option_key text not null,
  voter_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eg_prediction_votes_poll_key_nonempty check (nullif(btrim(poll_key), '') is not null),
  constraint eg_prediction_votes_option_key_nonempty check (nullif(btrim(option_key), '') is not null),
  constraint eg_prediction_votes_voter_key_nonempty check (nullif(btrim(voter_key), '') is not null)
);

alter table public.eg_prediction_votes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'eg_prediction_votes_poll_key_voter_key_key'
  ) then
    alter table public.eg_prediction_votes
      add constraint eg_prediction_votes_poll_key_voter_key_key unique (poll_key, voter_key);
  end if;
end $$;

create index if not exists idx_eg_prediction_votes_poll_key
  on public.eg_prediction_votes (poll_key);

create index if not exists idx_eg_prediction_votes_poll_key_option_key
  on public.eg_prediction_votes (poll_key, option_key);

revoke all on public.eg_prediction_votes from anon, authenticated;
grant select on public.eg_prediction_votes to anon, authenticated;

drop policy if exists "Prediction votes public read" on public.eg_prediction_votes;
create policy "Prediction votes public read"
  on public.eg_prediction_votes
  for select
  using (true);

drop policy if exists "Prediction votes no direct insert" on public.eg_prediction_votes;
create policy "Prediction votes no direct insert"
  on public.eg_prediction_votes
  for insert
  with check (false);

drop policy if exists "Prediction votes no direct update" on public.eg_prediction_votes;
create policy "Prediction votes no direct update"
  on public.eg_prediction_votes
  for update
  using (false)
  with check (false);

drop policy if exists "Prediction votes no direct delete" on public.eg_prediction_votes;
create policy "Prediction votes no direct delete"
  on public.eg_prediction_votes
  for delete
  using (false);

create or replace function public.eg_get_prediction_vote_summary(
  p_poll_key text,
  p_option_keys text[] default null,
  p_voter_key text default null
)
returns table(
  option_key text,
  vote_count bigint,
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
      lower(nullif(btrim(p_poll_key), '')) as poll_key,
      nullif(btrim(p_voter_key), '') as voter_key
  ),
  options as (
    select distinct lower(nullif(btrim(option_key), '')) as option_key
    from unnest(coalesce(p_option_keys, array[]::text[])) as option_key
    where nullif(btrim(option_key), '') is not null
  ),
  votes as (
    select
      lower(nullif(btrim(v.option_key), '')) as option_key,
      nullif(btrim(v.voter_key), '') as voter_key
    from public.eg_prediction_votes v
    join params on lower(nullif(btrim(v.poll_key), '')) = params.poll_key
  ),
  counts as (
    select
      option_key,
      count(*)::bigint as vote_count
    from votes
    group by option_key
  ),
  totals as (
    select
      count(*)::bigint as total_votes,
      max(case when votes.voter_key = params.voter_key then votes.option_key end) as current_user_vote
    from params
    left join votes on true
    group by params.voter_key
  )
  select
    options.option_key,
    coalesce(counts.vote_count, 0)::bigint as vote_count,
    coalesce(totals.total_votes, 0)::bigint as total_votes,
    totals.current_user_vote
  from options
  cross join totals
  left join counts on counts.option_key = options.option_key
  order by array_position(p_option_keys, options.option_key), options.option_key;
$$;

create or replace function public.eg_cast_prediction_vote(
  p_poll_key text,
  p_option_key text,
  p_voter_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_key text := lower(nullif(btrim(p_poll_key), ''));
  v_option_key text := lower(nullif(btrim(p_option_key), ''));
  v_voter_key text := nullif(btrim(p_voter_key), '');
  v_vote_id uuid;
begin
  if v_poll_key is null then
    raise exception 'poll_key is required';
  end if;

  if v_option_key is null then
    raise exception 'option_key is required';
  end if;

  if v_voter_key is null then
    raise exception 'voter_key is required';
  end if;

  insert into public.eg_prediction_votes (
    poll_key,
    option_key,
    voter_key
  )
  values (
    v_poll_key,
    v_option_key,
    v_voter_key
  )
  on conflict (poll_key, voter_key)
  do update
    set option_key = excluded.option_key,
        updated_at = now()
  returning id into v_vote_id;

  return v_vote_id;
end;
$$;

grant execute on function public.eg_get_prediction_vote_summary(text, text[], text) to anon, authenticated;
grant execute on function public.eg_cast_prediction_vote(text, text, text) to anon, authenticated;

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
      and tablename = 'eg_prediction_votes'
  ) then
    execute 'alter publication supabase_realtime add table public.eg_prediction_votes';
  end if;
exception
  when insufficient_privilege then
    null;
  when undefined_object then
    null;
end $$;

commit;

notify pgrst, 'reload schema';
