-- 20260304_team_dedup_and_preseason_profile_fill.sql
-- Purpose:
-- 1) Add trigger to auto-fill coach_name / psn_name on preseason registrations.
-- 2) Backfill existing registrations from profiles.
-- 3) Add case-insensitive unique team-name index only when no duplicates exist.

begin;

create or replace function public.fill_preseason_registration_profile_fields()
returns trigger
language plpgsql
as $$
declare
  p record;
begin
  select display_name, psn
  into p
  from public.profiles
  where user_id = new.user_id;

  if new.coach_name is null or new.coach_name = '' then
    new.coach_name := coalesce(p.display_name, new.coach_name);
  end if;

  if new.psn_name is null or new.psn_name = '' then
    new.psn_name := coalesce(p.psn, new.psn, new.psn_name);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_preseason_regs_profile_fields on public.eg_preseason_registrations;
create trigger trg_fill_preseason_regs_profile_fields
before insert or update on public.eg_preseason_registrations
for each row execute function public.fill_preseason_registration_profile_fields();

update public.eg_preseason_registrations r
set coach_name = coalesce(r.coach_name, p.display_name),
    psn_name = coalesce(r.psn_name, p.psn, r.psn)
from public.profiles p
where p.user_id = r.user_id
  and (r.coach_name is null or r.psn_name is null);

do $$
begin
  if exists (
    select 1
    from (
      select lower(name) as team_name_norm, count(*) as cnt
      from public.eg_teams
      group by lower(name)
      having count(*) > 1
    ) d
  ) then
    raise notice 'Skipping eg_teams_name_unique_ci index creation: duplicate team names still exist.';
  else
    create unique index if not exists eg_teams_name_unique_ci
      on public.eg_teams (lower(name));
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
