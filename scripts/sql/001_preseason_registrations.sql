create extension if not exists pgcrypto;

create or replace function public.eg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table if not exists public.eg_preseason_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  psn text,
  pref_team_1 text,
  pref_team_2 text,
  pref_team_3 text,
  pref_team_4 text,
  -- compatibility columns for existing clients
  psn_name text,
  preference_1 text,
  preference_2 text,
  preference_3 text,
  preference_4 text
);

alter table public.eg_preseason_registrations add column if not exists created_at timestamptz not null default now();
alter table public.eg_preseason_registrations add column if not exists updated_at timestamptz not null default now();
alter table public.eg_preseason_registrations add column if not exists psn text;
alter table public.eg_preseason_registrations add column if not exists pref_team_1 text;
alter table public.eg_preseason_registrations add column if not exists pref_team_2 text;
alter table public.eg_preseason_registrations add column if not exists pref_team_3 text;
alter table public.eg_preseason_registrations add column if not exists pref_team_4 text;
alter table public.eg_preseason_registrations add column if not exists psn_name text;
alter table public.eg_preseason_registrations add column if not exists preference_1 text;
alter table public.eg_preseason_registrations add column if not exists preference_2 text;
alter table public.eg_preseason_registrations add column if not exists preference_3 text;
alter table public.eg_preseason_registrations add column if not exists preference_4 text;

create index if not exists eg_preseason_registrations_user_id_idx
  on public.eg_preseason_registrations(user_id);

drop trigger if exists trg_eg_preseason_registrations_updated_at on public.eg_preseason_registrations;
create trigger trg_eg_preseason_registrations_updated_at
before update on public.eg_preseason_registrations
for each row execute function public.eg_set_updated_at();

alter table public.eg_preseason_registrations enable row level security;

drop policy if exists "preseason_regs_select_own_or_admin" on public.eg_preseason_registrations;
create policy "preseason_regs_select_own_or_admin"
on public.eg_preseason_registrations
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_admin = true
  )
);

drop policy if exists "preseason_regs_insert_own" on public.eg_preseason_registrations;
create policy "preseason_regs_insert_own"
on public.eg_preseason_registrations
for insert
with check (user_id = auth.uid());

drop policy if exists "preseason_regs_update_own" on public.eg_preseason_registrations;
create policy "preseason_regs_update_own"
on public.eg_preseason_registrations
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
