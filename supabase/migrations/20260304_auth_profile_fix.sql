begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles + eg_profiles schema alignment
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists email text,
      add column if not exists first_name text,
      add column if not exists last_name text,
      add column if not exists psn text,
      add column if not exists display_name text,
      add column if not exists preseason_registered boolean not null default false,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();

    create unique index if not exists profiles_user_id_unique_idx
      on public.profiles (user_id);

    alter table public.profiles enable row level security;

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
  end if;
end $$;

do $$
begin
  if to_regclass('public.eg_profiles') is not null then
    alter table public.eg_profiles
      add column if not exists email text,
      add column if not exists first_name text,
      add column if not exists last_name text,
      add column if not exists psn text,
      add column if not exists display_name text,
      add column if not exists preseason_registered boolean not null default false,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();

    create unique index if not exists eg_profiles_user_id_unique_idx
      on public.eg_profiles (user_id);

    alter table public.eg_profiles enable row level security;

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
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Harden signup trigger so account creation never fails
-- ---------------------------------------------------------------------------
create or replace function public.eg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_psn text;
begin
  v_email := new.email;
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', '');
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');

  if to_regclass('public.profiles') is not null then
    begin
      insert into public.profiles (
        user_id,
        email,
        first_name,
        last_name,
        display_name,
        psn,
        updated_at
      )
      values (
        new.id,
        v_email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, ''),
        now()
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
  end if;

  if to_regclass('public.eg_profiles') is not null then
    begin
      insert into public.eg_profiles (
        user_id,
        email,
        first_name,
        last_name,
        display_name,
        psn,
        updated_at
      )
      values (
        new.id,
        v_email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, ''),
        now()
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
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.eg_handle_new_user();

-- ---------------------------------------------------------------------------
-- Make legacy registration identity fields optional for insert stability
-- ---------------------------------------------------------------------------
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

    alter table public.eg_preseason_registrations
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Readable registrations view with team names/slugs
-- ---------------------------------------------------------------------------
drop view if exists public.eg_preseason_registrations_view;
create view public.eg_preseason_registrations_view as
select
  r.id,
  r.user_id,
  r.season_id,
  r.season_slug,
  r.created_at,
  coalesce(r.updated_at, r.created_at) as updated_at,
  r.psn as coach_psn,
  coalesce(
    nullif(r.coach_name, ''),
    nullif(p.display_name, ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    ''
  ) as coach_display_name,
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
  t4.slug as pref_team_4_slug,
  trim(
    both ', ' from concat_ws(', ',
      t1.name,
      t2.name,
      t3.name,
      t4.name
    )
  ) as pref_team_names
from public.eg_preseason_registrations r
left join public.profiles p on p.user_id = r.user_id
left join public.eg_teams t1 on t1.id = r.pref_team_1
left join public.eg_teams t2 on t2.id = r.pref_team_2
left join public.eg_teams t3 on t3.id = r.pref_team_3
left join public.eg_teams t4 on t4.id = r.pref_team_4;

commit;

notify pgrst, 'reload schema';
