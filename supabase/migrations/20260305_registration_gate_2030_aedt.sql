begin;

create or replace function public.eg_registration_is_open()
returns boolean
language sql
stable
as $$
  select now() >= ('2026-03-05 20:30:00+11'::timestamptz);
$$;

create or replace function public.eg_enforce_registration_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eg_registration_is_open() then
    raise exception 'Registrations open at 8:30pm AEDT.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_eg_registration_open_guard on public.eg_preseason_registrations;
create trigger trg_eg_registration_open_guard
before insert or update on public.eg_preseason_registrations
for each row execute function public.eg_enforce_registration_open();

commit;

notify pgrst, 'reload schema';
