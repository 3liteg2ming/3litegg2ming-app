begin;

create extension if not exists pgcrypto;

-- Profiles tables: create if missing and align columns used by app/signup flows
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text null,
  first_name text null,
  last_name text null,
  display_name text null,
  psn text null,
  xbox_gamertag text null,
  preseason_registered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text null,
  first_name text null,
  last_name text null,
  display_name text null,
  psn text null,
  xbox_gamertag text null,
  preseason_registered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists psn text;
alter table public.profiles add column if not exists xbox_gamertag text;
alter table public.profiles add column if not exists preseason_registered boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.eg_profiles add column if not exists email text;
alter table public.eg_profiles add column if not exists first_name text;
alter table public.eg_profiles add column if not exists last_name text;
alter table public.eg_profiles add column if not exists display_name text;
alter table public.eg_profiles add column if not exists psn text;
alter table public.eg_profiles add column if not exists xbox_gamertag text;
alter table public.eg_profiles add column if not exists preseason_registered boolean not null default false;
alter table public.eg_profiles add column if not exists created_at timestamptz not null default now();
alter table public.eg_profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_user_id_key on public.profiles(user_id);
create unique index if not exists eg_profiles_user_id_key on public.eg_profiles(user_id);

-- Keep signup resilient if old schema had strict columns in registrations
DO $$
BEGIN
  BEGIN
    alter table public.eg_preseason_registrations alter column dob drop not null;
  EXCEPTION WHEN undefined_column THEN null; END;
  BEGIN
    alter table public.eg_preseason_registrations alter column first_name drop not null;
  EXCEPTION WHEN undefined_column THEN null; END;
  BEGIN
    alter table public.eg_preseason_registrations alter column last_name drop not null;
  EXCEPTION WHEN undefined_column THEN null; END;
  BEGIN
    alter table public.eg_preseason_registrations alter column psn_name drop not null;
  EXCEPTION WHEN undefined_column THEN null; END;
  BEGIN
    alter table public.eg_preseason_registrations alter column coach_name drop not null;
  EXCEPTION WHEN undefined_column THEN null; END;
END$$;

-- RLS policies for profile self-read/update
alter table public.profiles enable row level security;
alter table public.eg_profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists eg_profiles_select_own on public.eg_profiles;
create policy eg_profiles_select_own on public.eg_profiles
for select
using (auth.uid() = user_id);

drop policy if exists eg_profiles_insert_own on public.eg_profiles;
create policy eg_profiles_insert_own on public.eg_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists eg_profiles_update_own on public.eg_profiles;
create policy eg_profiles_update_own on public.eg_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Safe trigger: never break auth signup if profile sync fails
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), '');
  v_last text := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '');
  v_display text := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '')), '');
  v_psn text := nullif(trim(coalesce(new.raw_user_meta_data->>'psn', new.raw_user_meta_data->>'gamer_tag', new.raw_user_meta_data->>'gamertag', '')), '');
  v_email text := nullif(trim(coalesce(new.email, '')), '');
begin
  begin
    insert into public.profiles (user_id, email, first_name, last_name, display_name, psn, xbox_gamertag, created_at, updated_at)
    values (new.id, v_email, v_first, v_last, v_display, v_psn, null, now(), now())
    on conflict (user_id) do update
      set email = coalesce(excluded.email, public.profiles.email),
          first_name = coalesce(excluded.first_name, public.profiles.first_name),
          last_name = coalesce(excluded.last_name, public.profiles.last_name),
          display_name = coalesce(excluded.display_name, public.profiles.display_name),
          psn = coalesce(excluded.psn, public.profiles.psn),
          updated_at = now();
  exception when others then
    raise notice 'handle_new_user profiles upsert failed: %', sqlerrm;
  end;

  begin
    insert into public.eg_profiles (user_id, email, first_name, last_name, display_name, psn, xbox_gamertag, created_at, updated_at)
    values (new.id, v_email, v_first, v_last, v_display, v_psn, null, now(), now())
    on conflict (user_id) do update
      set email = coalesce(excluded.email, public.eg_profiles.email),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Registration gate for launch: Thu 5 Mar 2026, 2:00pm Melbourne (AEDT)
create or replace function public.eg_preseason_registration_is_open()
returns boolean
language sql
stable
as $$
  select now() >= ('2026-03-05 14:00:00+11'::timestamptz);
$$;

alter table if exists public.eg_preseason_registrations enable row level security;

drop policy if exists preseason_regs_insert_own_open on public.eg_preseason_registrations;
create policy preseason_regs_insert_own_open
on public.eg_preseason_registrations
for insert
with check (auth.uid() = user_id and public.eg_preseason_registration_is_open());

drop policy if exists preseason_regs_update_own_open on public.eg_preseason_registrations;
create policy preseason_regs_update_own_open
on public.eg_preseason_registrations
for update
using (auth.uid() = user_id and public.eg_preseason_registration_is_open())
with check (auth.uid() = user_id and public.eg_preseason_registration_is_open());

-- Admin-readable registration view with names/slugs for team prefs
create or replace view public.eg_preseason_registrations_view as
select
  r.user_id,
  r.created_at,
  r.updated_at,
  r.season_slug,
  r.coach_name,
  r.psn_name,
  r.psn,
  r.pref_team_ids,
  r.pref_team_1 as pref_team_1_id,
  r.pref_team_2 as pref_team_2_id,
  r.pref_team_3 as pref_team_3_id,
  r.pref_team_4 as pref_team_4_id,
  t1.name as pref_team_1_name,
  t1.slug as pref_team_1_slug,
  t2.name as pref_team_2_name,
  t2.slug as pref_team_2_slug,
  t3.name as pref_team_3_name,
  t3.slug as pref_team_3_slug,
  t4.name as pref_team_4_name,
  t4.slug as pref_team_4_slug
from public.eg_preseason_registrations r
left join public.eg_teams t1 on t1.id = r.pref_team_1
left join public.eg_teams t2 on t2.id = r.pref_team_2
left join public.eg_teams t3 on t3.id = r.pref_team_3
left join public.eg_teams t4 on t4.id = r.pref_team_4;

commit;

notify pgrst, 'reload schema';
