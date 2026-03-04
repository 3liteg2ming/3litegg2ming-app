create or replace view public.eg_preseason_registrations_view as
select
  r.*,
  p.display_name as profile_display_name,
  p.psn as profile_psn,
  coalesce(string_agg(t.name, ', ' order by t.name), '') as pref_team_names
from public.eg_preseason_registrations r
left join public.profiles p
  on p.user_id = r.user_id
left join lateral unnest(r.pref_team_ids) as pref_team_uuid(team_id) on true
left join public.eg_teams t
  on t.id = pref_team_uuid.team_id
group by r.id, p.display_name, p.psn;

notify pgrst, 'reload schema';
