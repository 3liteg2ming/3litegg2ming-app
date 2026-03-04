begin;

create or replace function public.eg_preseason_registration_is_open()
returns boolean
language sql
stable
as $$
  -- Registration opens 8:30pm Melbourne time
  select now() >= ('2026-03-04 20:30:00+11'::timestamptz);
$$;

commit;

notify pgrst, 'reload schema';
