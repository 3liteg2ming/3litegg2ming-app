begin;

-- 1) Ensure RLS is enabled (safe if already enabled)
alter table if exists public.profiles enable row level security;
alter table if exists public.eg_profiles enable row level security;

-- 2) Add INSERT policy for self on public.profiles (this is the missing piece)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert
with check (auth.uid() = user_id);

-- 3) Add INSERT policy for self on public.eg_profiles (admin console uses this)
drop policy if exists "eg_profiles_insert_self" on public.eg_profiles;
create policy "eg_profiles_insert_self" on public.eg_profiles
for insert
with check (auth.uid() = user_id);

-- 4) Also allow UPDATE self on eg_profiles (if not already)
drop policy if exists "eg_profiles_update_self" on public.eg_profiles;
create policy "eg_profiles_update_self" on public.eg_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5) Auto-create profile row on signup (prevents missing profiles forever)
-- Uses auth.users.raw_user_meta_data to populate display_name/psn.
create or replace function public.eg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_psn text;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');

  -- Create in public.profiles if table exists.
  if to_regclass('public.profiles') is not null then
    insert into public.profiles (user_id, email, display_name, psn, created_at, updated_at)
    values (new.id, new.email, v_display_name, v_psn, now(), now())
    on conflict (user_id) do update
      set email = excluded.email,
          display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
          psn = coalesce(nullif(excluded.psn, ''), public.profiles.psn),
          updated_at = now();
  end if;

  -- Mirror into eg_profiles if it exists.
  if to_regclass('public.eg_profiles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'eg_profiles'
        and column_name = 'created_at'
    ) then
      insert into public.eg_profiles (user_id, email, display_name, psn, created_at, updated_at)
      values (new.id, new.email, v_display_name, v_psn, now(), now())
      on conflict (user_id) do update
        set email = excluded.email,
            display_name = coalesce(nullif(excluded.display_name, ''), public.eg_profiles.display_name),
            psn = coalesce(nullif(excluded.psn, ''), public.eg_profiles.psn),
            updated_at = now();
    else
      insert into public.eg_profiles (user_id, email, display_name, psn, updated_at)
      values (new.id, new.email, v_display_name, v_psn, now())
      on conflict (user_id) do update
        set email = excluded.email,
            display_name = coalesce(nullif(excluded.display_name, ''), public.eg_profiles.display_name),
            psn = coalesce(nullif(excluded.psn, ''), public.eg_profiles.psn),
            updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.eg_handle_new_user();

-- Pretty view: readable coach + PSN + team names
create or replace view public.eg_preseason_registrations_pretty as
select
  r.*, 
  coalesce(nullif(r.coach_name,''), p.display_name, '') as coach_display_name,
  coalesce(nullif(r.psn_name,''), p.psn, nullif(r.psn,''), '') as coach_psn,
  trim(both ', ' from concat_ws(', ',
    t1.name,
    t2.name,
    t3.name,
    t4.name
  )) as pref_team_names,
  t1.name as pref_team_1_name,
  t2.name as pref_team_2_name,
  t3.name as pref_team_3_name,
  t4.name as pref_team_4_name
from public.eg_preseason_registrations r
left join public.profiles p on p.user_id = r.user_id
left join public.eg_teams t1 on t1.id = r.pref_team_ids[1]
left join public.eg_teams t2 on t2.id = r.pref_team_ids[2]
left join public.eg_teams t3 on t3.id = r.pref_team_ids[3]
left join public.eg_teams t4 on t4.id = r.pref_team_ids[4];

-- Replace obvious placeholder psn values in registrations using profiles.psn
update public.eg_preseason_registrations r
set
  coach_name = coalesce(r.coach_name, p.display_name),
  psn_name = case
    when r.psn_name is null or r.psn_name = '' or lower(r.psn_name) in ('yourpsn','your psn')
      then coalesce(p.psn, r.psn_name)
    else r.psn_name
  end,
  psn = case
    when r.psn is null or r.psn = '' or lower(r.psn) in ('yourpsn','your psn')
      then coalesce(p.psn, r.psn)
    else r.psn
  end
from public.profiles p
where p.user_id = r.user_id;

commit;

-- force schema refresh to avoid "schema cache" errors
notify pgrst, 'reload schema';
