begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists psn text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column display_name drop not null,
  alter column psn drop not null;

create unique index if not exists profiles_user_id_unique_idx on public.profiles (user_id);

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
  v_gamer_tag text;
begin
  v_email := new.email;
  v_first_name := nullif(coalesce(new.raw_user_meta_data->>'first_name', ''), '');
  v_last_name := nullif(coalesce(new.raw_user_meta_data->>'last_name', ''), '');
  v_display_name := nullif(
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')),
      ''
    ),
    ''
  );
  v_gamer_tag := nullif(
    coalesce(
      new.raw_user_meta_data->>'gamer_tag',
      new.raw_user_meta_data->>'gamertag',
      new.raw_user_meta_data->>'psn',
      new.raw_user_meta_data->>'psn_name',
      ''
    ),
    ''
  );

  begin
    insert into public.profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_gamer_tag, now(), now()
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

  return new;
end;
$$;

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
  v_gamer_tag text;
begin
  v_email := new.email;
  v_first_name := nullif(coalesce(new.raw_user_meta_data->>'first_name', ''), '');
  v_last_name := nullif(coalesce(new.raw_user_meta_data->>'last_name', ''), '');
  v_display_name := nullif(
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')),
      ''
    ),
    ''
  );
  v_gamer_tag := nullif(
    coalesce(
      new.raw_user_meta_data->>'gamer_tag',
      new.raw_user_meta_data->>'gamertag',
      new.raw_user_meta_data->>'psn',
      new.raw_user_meta_data->>'psn_name',
      ''
    ),
    ''
  );

  begin
    insert into public.profiles (
      user_id, email, first_name, last_name, display_name, psn, created_at, updated_at
    )
    values (
      new.id, v_email, v_first_name, v_last_name, v_display_name, v_gamer_tag, now(), now()
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

commit;

notify pgrst, 'reload schema';
