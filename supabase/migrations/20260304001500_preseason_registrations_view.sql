-- 20260304_preseason_registrations_view.sql
-- Creates a stable registrations view with team/profile display fields.

begin;

do $$
declare
  has_pref_team_id boolean;
  has_team_uuid boolean;
  has_pref_team_name boolean;
  has_team_text boolean;
  team_join text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'eg_preseason_registrations'
      and column_name = 'pref_team_id'
  ) into has_pref_team_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'eg_preseason_registrations'
      and column_name = 'team_uuid'
  ) into has_team_uuid;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'eg_preseason_registrations'
      and column_name = 'pref_team_name'
  ) into has_pref_team_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'eg_preseason_registrations'
      and column_name = 'team'
  ) into has_team_text;

  if has_pref_team_id then
    team_join := 'left join public.eg_teams t on t.id = r.pref_team_id';
  elsif has_team_uuid then
    team_join := 'left join public.eg_teams t on t.id = r.team_uuid';
  elsif has_pref_team_name then
    team_join := 'left join public.eg_teams t on lower(t.name) = lower(r.pref_team_name)';
  elsif has_team_text then
    team_join := 'left join public.eg_teams t on lower(t.name) = lower(r.team)';
  else
    team_join := 'left join public.eg_teams t on false';
  end if;

  execute 'drop view if exists public.eg_preseason_registrations_view';

  execute format(
    $sql$
    create view public.eg_preseason_registrations_view as
    select
      r.*,
      t.name as team_name,
      t.slug as team_slug,
      p.display_name as profile_display_name,
      p.psn as profile_psn
    from public.eg_preseason_registrations r
    %s
    left join public.profiles p on p.user_id = r.user_id
    $sql$,
    team_join
  );
end
$$;

commit;

notify pgrst, 'reload schema';
