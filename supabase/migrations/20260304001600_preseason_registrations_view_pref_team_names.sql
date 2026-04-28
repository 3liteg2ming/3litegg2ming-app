drop view if exists public.eg_preseason_registrations_view;

create view public.eg_preseason_registrations_view as
select
  r.id,
  r.user_id,
  r.season_slug,
  r.created_at,
  coalesce(r.updated_at, r.created_at) as updated_at,
  r.coach_name,
  r.psn,
  r.psn_name,
  r.pref_team_ids,
  r.pref_team_1,
  r.pref_team_2,
  r.pref_team_3,
  r.pref_team_4,
  r.pref_team_slugs,
  p.display_name as profile_display_name,
  p.psn as profile_psn,
  coalesce(string_agg(t.name, ', ' order by t.name), '') as pref_team_names
from public.eg_preseason_registrations r
left join public.profiles p
  on p.user_id = r.user_id
left join lateral unnest(r.pref_team_ids) as pref_team_uuid(team_id) on true
left join public.eg_teams t
  on t.id = pref_team_uuid.team_id
group by
  r.id,
  r.user_id,
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
  r.pref_team_slugs,
  p.display_name,
  p.psn;

notify pgrst, 'reload schema';
