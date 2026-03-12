begin;

-- 1) Add new columns for facebook_name and birth_year
alter table if exists public.profiles
  add column if not exists facebook_name text,
  add column if not exists birth_year integer;

alter table if exists public.eg_profiles
  add column if not exists facebook_name text,
  add column if not exists birth_year integer;

-- 2) Update the new user handler to populate the new fields
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
  v_facebook_name text;
  v_birth_year integer;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', '');
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');
  v_facebook_name := coalesce(new.raw_user_meta_data->>'facebook_name', '');
  v_birth_year := (new.raw_user_meta_data->>'birth_year')::integer;

  begin
    if to_regclass('public.profiles') is not null then
      insert into public.profiles (
        user_id,
        email,
        first_name,
        last_name,
        display_name,
        psn,
        facebook_name,
        birth_year
      )
      values (
        new.id,
        new.email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, ''),
        nullif(v_facebook_name, ''),
        v_birth_year
      )
      on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
          last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
          display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
          psn = coalesce(nullif(excluded.psn, ''), public.profiles.psn),
          facebook_name = coalesce(nullif(excluded.facebook_name, ''), public.profiles.facebook_name),
          birth_year = coalesce(excluded.birth_year, public.profiles.birth_year);
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
        psn,
        facebook_name,
        birth_year
      )
      values (
        new.id,
        new.email,
        nullif(v_first_name, ''),
        nullif(v_last_name, ''),
        nullif(v_display_name, ''),
        nullif(v_psn, ''),
        nullif(v_facebook_name, ''),
        v_birth_year
      )
      on conflict (user_id) do update
      set email = excluded.email,
          first_name = coalesce(nullif(excluded.first_name, ''), public.eg_profiles.first_name),
          last_name = coalesce(nullif(excluded.last_name, ''), public.eg_profiles.last_name),
          display_name = coalesce(nullif(excluded.display_name, ''), public.eg_profiles.display_name),
          psn = coalesce(nullif(excluded.psn, ''), public.eg_profiles.psn),
          facebook_name = coalesce(nullif(excluded.facebook_name, ''), public.eg_profiles.facebook_name),
          birth_year = coalesce(excluded.birth_year, public.eg_profiles.birth_year);
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


commit;

notify pgrst, 'reload schema';
