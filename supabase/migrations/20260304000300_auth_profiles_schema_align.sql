begin;

-- 1) Align profile schemas on both tables
alter table if exists public.profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists psn text,
  add column if not exists preseason_registered boolean not null default false;

alter table if exists public.eg_profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists psn text,
  add column if not exists preseason_registered boolean not null default false;

-- 2) Ensure uniqueness on user_id
create unique index if not exists profiles_user_id_uidx on public.profiles (user_id);
create unique index if not exists eg_profiles_user_id_uidx on public.eg_profiles (user_id);

-- 3) RLS policies
alter table if exists public.profiles enable row level security;
alter table if exists public.eg_profiles enable row level security;

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists eg_profiles_insert_own on public.eg_profiles;
create policy eg_profiles_insert_own on public.eg_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists eg_profiles_update_own on public.eg_profiles;
create policy eg_profiles_update_own on public.eg_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4) Signup trigger function cannot fail
create or replace function public.eg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_psn text;
  v_first_name text;
  v_last_name text;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', '');
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');

  begin
    if to_regclass('public.profiles') is not null then
      insert into public.profiles (
        user_id,
        email,
        first_name,
        last_name,
        display_name,
        psn
      )
      values (
        new.id,
        new.email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, '')
      )
      on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
          last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
          display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
          psn = coalesce(nullif(excluded.psn, ''), public.profiles.psn);
    end if;
  exception when others then
    raise notice 'eg_handle_new_user profiles upsert failed: %', sqlerrm;
  end;

  begin
    if to_regclass('public.eg_profiles') is not null then
      insert into public.eg_profiles (
        user_id,
        email,
        first_name,
        last_name,
        display_name,
        psn
      )
      values (
        new.id,
        new.email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, '')
      )
      on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(nullif(excluded.first_name, ''), public.eg_profiles.first_name),
          last_name = coalesce(nullif(excluded.last_name, ''), public.eg_profiles.last_name),
          display_name = coalesce(nullif(excluded.display_name, ''), public.eg_profiles.display_name),
          psn = coalesce(nullif(excluded.psn, ''), public.eg_profiles.psn);
    end if;
  exception when others then
    raise notice 'eg_handle_new_user eg_profiles upsert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.eg_handle_new_user();

-- 5) Preseason registrations compatibility: make old fields nullable and ensure timestamps
alter table if exists public.eg_preseason_registrations
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
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
end $$;

-- 6) Pretty view for readable registration fields
create extension if not exists pgcrypto;

drop view if exists public.eg_preseason_registrations_pretty;

create view public.eg_preseason_registrations_pretty as
select
  r.user_id,
  r.season_slug,
  r.created_at,
  coalesce(r.updated_at, r.created_at) as updated_at,
  r.psn as coach_psn,
  coalesce(
    nullif(r.coach_name, ''),
    nullif(p.display_name, ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
  ) as coach_display_name,
  r.pref_team_ids,
  r.pref_team_1,
  r.pref_team_2,
  r.pref_team_3,
  r.pref_team_4,
  t1.name as pref_team_1_name,
  t2.name as pref_team_2_name,
  t3.name as pref_team_3_name,
  t4.name as pref_team_4_name,
  trim(both ', ' from concat_ws(', ', t1.name, t2.name, t3.name, t4.name)) as pref_team_names
from public.eg_preseason_registrations r
left join public.profiles p on p.user_id = r.user_id
left join public.eg_teams t1 on t1.id = r.pref_team_1
left join public.eg_teams t2 on t2.id = r.pref_team_2
left join public.eg_teams t3 on t3.id = r.pref_team_3
left join public.eg_teams t4 on t4.id = r.pref_team_4;

commit;

notify pgrst, 'reload schema';
