-- 20260304_fix_preseason_regs_updated_at.sql
-- Fix: app expects updated_at in eg_preseason_registrations

-- 1) Add updated_at if missing
alter table public.eg_preseason_registrations
  add column if not exists updated_at timestamptz not null default now();

-- 2) Ensure created_at exists too (safe, helps consistency)
alter table public.eg_preseason_registrations
  add column if not exists created_at timestamptz not null default now();

-- 3) Create a generic trigger function (safe if already exists)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 4) Attach trigger to eg_preseason_registrations (drop+create is safe)
drop trigger if exists trg_set_updated_at_preseason_regs on public.eg_preseason_registrations;

create trigger trg_set_updated_at_preseason_regs
before update on public.eg_preseason_registrations
for each row
execute function public.set_updated_at();

-- 5) Force PostgREST to reload schema cache
select pg_notify('pgrst', 'reload schema');
