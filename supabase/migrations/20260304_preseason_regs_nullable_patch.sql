begin;

-- Make fields optional if the UI does not collect them
alter table public.eg_preseason_registrations
  alter column first_name drop not null;

alter table public.eg_preseason_registrations
  alter column last_name drop not null;

alter table public.eg_preseason_registrations
  alter column dob drop not null;

-- Ensure timestamps behave
alter table public.eg_preseason_registrations
  alter column created_at set default now(),
  alter column updated_at set default now();

-- updated_at trigger (safe + reusable)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_set_updated_at_on_preseason_regs on public.eg_preseason_registrations;
create trigger trg_set_updated_at_on_preseason_regs
before update on public.eg_preseason_registrations
for each row execute function public.set_updated_at();

commit;

-- Fix "schema cache" errors
notify pgrst, 'reload schema';
