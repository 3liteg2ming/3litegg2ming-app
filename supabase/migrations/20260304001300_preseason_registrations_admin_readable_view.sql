begin;

drop view if exists public.eg_preseason_registrations_admin_view;

create view public.eg_preseason_registrations_admin_view as
select
  r.id,
  r.user_id,
  r.season_id,
  r.season_slug,
  r.created_at,
  r.updated_at,
  r.coach_name,
  r.psn,
  r.psn_name,
  r.pref_team_ids,
  r.pref_team_1,
  r.pref_team_2,
  r.pref_team_3,
  r.pref_team_4,
  r.pref_team_names,
  r.pref_team_slugs,
  t1.name as pref_team_1_name,
  t1.slug as pref_team_1_slug,
  t2.name as pref_team_2_name,
  t2.slug as pref_team_2_slug,
  t3.name as pref_team_3_name,
  t3.slug as pref_team_3_slug,
  t4.name as pref_team_4_name,
  t4.slug as pref_team_4_slug,
  trim(both ', ' from concat_ws(', ', t1.name, t2.name, t3.name, t4.name)) as pref_team_names_joined
from public.eg_preseason_registrations r
left join public.eg_teams t1 on t1.id = r.pref_team_1
left join public.eg_teams t2 on t2.id = r.pref_team_2
left join public.eg_teams t3 on t3.id = r.pref_team_3
left join public.eg_teams t4 on t4.id = r.pref_team_4;

commit;

notify pgrst, 'reload schema';
