alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles(is_admin);

alter table public.profiles enable row level security;

-- Optional policy scaffold for future admin-only screens.
drop policy if exists "profiles_admin_view_all" on public.profiles;
create policy "profiles_admin_view_all"
on public.profiles
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

-- Quick admin grant snippet:
-- update public.profiles
-- set is_admin = true
-- where user_id = 'YOUR-USER-UUID';
