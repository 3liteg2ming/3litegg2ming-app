begin;

-- Ensure timestamp columns exist and default to now()
alter table public.eg_preseason_registrations
  add column if not exists created_at timestamptz not null default now();

alter table public.eg_preseason_registrations
  add column if not exists updated_at timestamptz not null default now();

alter table public.eg_preseason_registrations
  alter column created_at set default now(),
  alter column updated_at set default now();

-- Make non-form / optional fields nullable when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eg_preseason_registrations' and column_name = 'dob'
  ) then
    execute 'alter table public.eg_preseason_registrations alter column dob drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eg_preseason_registrations' and column_name = 'first_name'
  ) then
    execute 'alter table public.eg_preseason_registrations alter column first_name drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eg_preseason_registrations' and column_name = 'last_name'
  ) then
    execute 'alter table public.eg_preseason_registrations alter column last_name drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eg_preseason_registrations' and column_name = 'psn_name'
  ) then
    execute 'alter table public.eg_preseason_registrations alter column psn_name drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eg_preseason_registrations' and column_name = 'email'
  ) then
    execute 'alter table public.eg_preseason_registrations alter column email drop not null';
  end if;
end $$;

-- updated_at maintenance trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_on_preseason_regs on public.eg_preseason_registrations;
create trigger trg_set_updated_at_on_preseason_regs
before update on public.eg_preseason_registrations
for each row
execute function public.set_updated_at();

commit;

notify pgrst, 'reload schema';
