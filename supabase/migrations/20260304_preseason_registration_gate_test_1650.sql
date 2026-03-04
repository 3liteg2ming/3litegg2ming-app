begin;

create or replace function public.eg_preseason_registration_is_open()
returns boolean
language sql
stable
as $$
  -- TEST OPEN TIME: 4:50pm Melbourne time on 2026-03-04
  select now() >= ('2026-03-04 16:50:00+11'::timestamptz);
$$;

alter table if exists public.eg_preseason_registrations enable row level security;

drop policy if exists "preseason_regs_insert_own_open" on public.eg_preseason_registrations;
create policy "preseason_regs_insert_own_open"
on public.eg_preseason_registrations
for insert
with check (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
);

drop policy if exists "preseason_regs_update_own_open" on public.eg_preseason_registrations;
create policy "preseason_regs_update_own_open"
on public.eg_preseason_registrations
for update
using (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
)
with check (
  auth.uid() = user_id
  and public.eg_preseason_registration_is_open()
);

commit;

notify pgrst, 'reload schema';
