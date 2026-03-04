begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: schema + defaults + nullable metadata fields
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists psn text,
  add column if not exists preseason_registered boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column display_name drop not null,
  alter column psn drop not null;

-- eg_profiles is optional in some environments, but keep it aligned if present
create table if not exists public.eg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.eg_profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists psn text,
  add column if not exists preseason_registered boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.eg_profiles
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column display_name drop not null,
  alter column psn drop not null;

create unique index if not exists profiles_user_id_unique_idx on public.profiles (user_id);
create unique index if not exists eg_profiles_user_id_unique_idx on public.eg_profiles (user_id);

-- ---------------------------------------------------------------------------
-- Updated-at helper + triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_eg_profiles_set_updated_at on public.eg_profiles;
create trigger trg_eg_profiles_set_updated_at
before update on public.eg_profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: users can read/update their own profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.eg_profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists eg_profiles_select_own on public.eg_profiles;
create policy eg_profiles_select_own
  on public.eg_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists eg_profiles_insert_own on public.eg_profiles;
create policy eg_profiles_insert_own
  on public.eg_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists eg_profiles_update_own on public.eg_profiles;
create policy eg_profiles_update_own
  on public.eg_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile rows for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_psn text;
begin
  v_email := new.email;
  v_first_name := nullif(coalesce(new.raw_user_meta_data->>'first_name', ''), '');
  v_last_name := nullif(coalesce(new.raw_user_meta_data->>'last_name', ''), '');
  v_display_name := nullif(coalesce(new.raw_user_meta_data->>'display_name', ''), '');
  v_psn := nullif(coalesce(new.raw_user_meta_data->>'psn', ''), '');

  begin
    insert into public.profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_psn, now(), now()
    )
    on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(excluded.first_name, public.profiles.first_name),
          last_name = coalesce(excluded.last_name, public.profiles.last_name),
          display_name = coalesce(excluded.display_name, public.profiles.display_name),
          psn = coalesce(excluded.psn, public.profiles.psn),
          updated_at = now();
  exception when others then
    raise notice 'handle_new_user profiles upsert failed: %', sqlerrm;
  end;

  begin
    insert into public.eg_profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_psn, now(), now()
    )
    on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(excluded.first_name, public.eg_profiles.first_name),
          last_name = coalesce(excluded.last_name, public.eg_profiles.last_name),
          display_name = coalesce(excluded.display_name, public.eg_profiles.display_name),
          psn = coalesce(excluded.psn, public.eg_profiles.psn),
          updated_at = now();
  exception when others then
    raise notice 'handle_new_user eg_profiles upsert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- Keep compatibility for older migrations/functions still calling eg_handle_new_user()
create or replace function public.eg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_psn text;
begin
  v_email := new.email;
  v_first_name := nullif(coalesce(new.raw_user_meta_data->>'first_name', ''), '');
  v_last_name := nullif(coalesce(new.raw_user_meta_data->>'last_name', ''), '');
  v_display_name := nullif(coalesce(new.raw_user_meta_data->>'display_name', ''), '');
  v_psn := nullif(coalesce(new.raw_user_meta_data->>'psn', ''), '');

  begin
    insert into public.profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_psn, now(), now()
    )
    on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(excluded.first_name, public.profiles.first_name),
          last_name = coalesce(excluded.last_name, public.profiles.last_name),
          display_name = coalesce(excluded.display_name, public.profiles.display_name),
          psn = coalesce(excluded.psn, public.profiles.psn),
          updated_at = now();
  exception when others then
    raise notice 'eg_handle_new_user profiles upsert failed: %', sqlerrm;
  end;

  begin
    insert into public.eg_profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_psn, now(), now()
    )
    on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(excluded.first_name, public.eg_profiles.first_name),
          last_name = coalesce(excluded.last_name, public.eg_profiles.last_name),
          display_name = coalesce(excluded.display_name, public.eg_profiles.display_name),
          psn = coalesce(excluded.psn, public.eg_profiles.psn),
          updated_at = now();
  exception when others then
    raise notice 'eg_handle_new_user eg_profiles upsert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Registration table hardening + readable helper fields
-- ---------------------------------------------------------------------------
alter table if exists public.eg_preseason_registrations
  add column if not exists season_slug text,
  add column if not exists coach_name text,
  add column if not exists psn_name text,
  add column if not exists pref_team_names text[],
  add column if not exists pref_team_slugs text[],
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.eg_preseason_registrations') is not null then
    begin
      alter table public.eg_preseason_registrations alter column dob drop not null;
    exception when undefined_column then null;
    end;
    begin
      alter table public.eg_preseason_registrations alter column first_name drop not null;
    exception when undefined_column then null;
    end;
    begin
      alter table public.eg_preseason_registrations alter column last_name drop not null;
    exception when undefined_column then null;
    end;
    begin
      alter table public.eg_preseason_registrations alter column psn_name drop not null;
    exception when undefined_column then null;
    end;
    begin
      alter table public.eg_preseason_registrations alter column coach_name drop not null;
    exception when undefined_column then null;
    end;
  end if;
end $$;

drop trigger if exists trg_preseason_regs_set_updated_at on public.eg_preseason_registrations;
create trigger trg_preseason_regs_set_updated_at
before update on public.eg_preseason_registrations
for each row execute function public.set_updated_at();

create or replace function public.eg_fill_preseason_registration_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_psn text;
begin
  if new.season_slug is null or trim(new.season_slug) = '' then
    new.season_slug := 'preseason-2026';
  end if;

  if new.user_id is not null then
    select p.display_name, p.psn
    into v_display_name, v_psn
    from public.profiles p
    where p.user_id = new.user_id
    limit 1;

    if coalesce(new.coach_name, '') = '' then
      new.coach_name := coalesce(nullif(v_display_name, ''), new.coach_name);
    end if;

    if coalesce(new.psn_name, '') = '' then
      new.psn_name := coalesce(nullif(v_psn, ''), nullif(new.psn, ''), new.psn_name);
    end if;

    if coalesce(new.psn, '') = '' then
      new.psn := coalesce(nullif(v_psn, ''), new.psn);
    end if;
  end if;

  if new.pref_team_ids is not null and cardinality(new.pref_team_ids) > 0 then
    select
      array_agg(t.name order by u.ord),
      array_agg(t.slug order by u.ord)
    into new.pref_team_names, new.pref_team_slugs
    from unnest(new.pref_team_ids) with ordinality as u(team_id, ord)
    left join public.eg_teams t on t.id = u.team_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_preseason_registration_fields on public.eg_preseason_registrations;
create trigger trg_fill_preseason_registration_fields
before insert or update on public.eg_preseason_registrations
for each row execute function public.eg_fill_preseason_registration_fields();

-- Human-readable admin view without changing normalized storage
drop view if exists public.eg_preseason_registrations_view;
create view public.eg_preseason_registrations_view as
select
  r.id,
  r.user_id,
  r.season_id,
  r.season_slug,
  r.created_at,
  coalesce(r.updated_at, r.created_at) as updated_at,
  r.pref_team_ids,
  r.pref_team_1 as pref_team_1_id,
  t1.name as pref_team_1_name,
  t1.slug as pref_team_1_slug,
  r.pref_team_2 as pref_team_2_id,
  t2.name as pref_team_2_name,
  t2.slug as pref_team_2_slug,
  r.pref_team_3 as pref_team_3_id,
  t3.name as pref_team_3_name,
  t3.slug as pref_team_3_slug,
  r.pref_team_4 as pref_team_4_id,
  t4.name as pref_team_4_name,
  t4.slug as pref_team_4_slug,
  r.pref_team_names,
  r.pref_team_slugs,
  coalesce(
    nullif(r.coach_name, ''),
    nullif(p.display_name, ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    ''
  ) as coach_display_name,
  coalesce(nullif(r.psn_name, ''), nullif(r.psn, ''), nullif(p.psn, ''), '') as coach_psn
from public.eg_preseason_registrations r
left join public.profiles p on p.user_id = r.user_id
left join public.eg_teams t1 on t1.id = r.pref_team_1
left join public.eg_teams t2 on t2.id = r.pref_team_2
left join public.eg_teams t3 on t3.id = r.pref_team_3
left join public.eg_teams t4 on t4.id = r.pref_team_4;

-- ---------------------------------------------------------------------------
-- Time gate: open at 9:00pm Melbourne (Wed 4 Mar 2026, AEDT / UTC+11)
-- ---------------------------------------------------------------------------
create or replace function public.eg_preseason_registration_is_open()
returns boolean
language sql
stable
as $$
  select now() >= ('2026-03-04 21:00:00+11'::timestamptz);
$$;

alter table if exists public.eg_preseason_registrations enable row level security;

drop policy if exists preseason_regs_insert_own_open on public.eg_preseason_registrations;
drop policy if exists "preseason_regs_insert_own_open" on public.eg_preseason_registrations;
create policy preseason_regs_insert_own_open
on public.eg_preseason_registrations
for insert
with check (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
);

drop policy if exists preseason_regs_update_own_open on public.eg_preseason_registrations;
drop policy if exists "preseason_regs_update_own_open" on public.eg_preseason_registrations;
create policy preseason_regs_update_own_open
on public.eg_preseason_registrations
for update
using (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
)
with check (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
);

commit;

notify pgrst, 'reload schema';
