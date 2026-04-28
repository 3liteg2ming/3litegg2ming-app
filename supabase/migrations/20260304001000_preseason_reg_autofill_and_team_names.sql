begin;

-- 1) Add readable columns (safe if already exists)
alter table public.eg_preseason_registrations
  add column if not exists pref_team_names text[],
  add column if not exists pref_team_slugs text[];

-- 2) Fill helper: take pref_team_ids and populate names/slugs, and coach fields from profiles
create or replace function public.eg_fill_preseason_registration_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_psn text;
begin
  -- Coach details from profiles if missing
  if new.user_id is not null then
    select p.display_name, p.psn
    into v_display, v_psn
    from public.profiles p
    where p.user_id = new.user_id;

    if (new.coach_name is null or new.coach_name = '') then
      new.coach_name := coalesce(v_display, new.coach_name);
    end if;

    -- prefer profile psn if present
    if (new.psn_name is null or new.psn_name = '' or lower(new.psn_name) in ('yourpsn','your psn','yourpsnid')) then
      new.psn_name := coalesce(nullif(v_psn,''), new.psn_name);
    end if;

    if (new.psn is null or new.psn = '' or lower(new.psn) in ('yourpsn','your psn','yourpsnid')) then
      new.psn := coalesce(nullif(v_psn,''), new.psn);
    end if;
  end if;

  -- Team readable arrays from pref_team_ids
  if new.pref_team_ids is not null and array_length(new.pref_team_ids, 1) > 0 then
    select
      array_agg(t.name order by ord) as names,
      array_agg(t.slug order by ord) as slugs
    into new.pref_team_names, new.pref_team_slugs
    from unnest(new.pref_team_ids) with ordinality as u(team_id, ord)
    join public.eg_teams t on t.id = u.team_id;
  else
    new.pref_team_names := null;
    new.pref_team_slugs := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_preseason_registration_fields on public.eg_preseason_registrations;
create trigger trg_fill_preseason_registration_fields
before insert or update on public.eg_preseason_registrations
for each row execute function public.eg_fill_preseason_registration_fields();

commit;

notify pgrst, 'reload schema';
