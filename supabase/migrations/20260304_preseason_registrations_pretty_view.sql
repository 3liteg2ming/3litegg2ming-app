create or replace view public.eg_preseason_registrations_pretty as
select
  r.*,

  -- Coach display fields (fallback chain)
  coalesce(r.coach_name, p.display_name, '') as coach_display_name,
  coalesce(r.psn_name, p.psn, r.psn, '') as coach_psn,

  -- Individual preferred teams (1..4) as names
  t1.name as pref_team_1_name,
  t2.name as pref_team_2_name,
  t3.name as pref_team_3_name,
  t4.name as pref_team_4_name,

  -- All preferred teams as one nice string
  trim(both ', ' from
    concat_ws(', ',
      t1.name,
      t2.name,
      t3.name,
      t4.name
    )
  ) as pref_team_names

from public.eg_preseason_registrations r
left join public.profiles p on p.user_id = r.user_id

left join public.eg_teams t1 on t1.id = r.pref_team_ids[1]
left join public.eg_teams t2 on t2.id = r.pref_team_ids[2]
left join public.eg_teams t3 on t3.id = r.pref_team_ids[3]
left join public.eg_teams t4 on t4.id = r.pref_team_ids[4];

notify pgrst, 'reload schema';
