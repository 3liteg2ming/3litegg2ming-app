create or replace function public.eg_next_fixture_with_teams_for_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_team_id uuid;
  v_fixture record;
  v_home_team record;
  v_away_team record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  select p.team_id
    into v_team_id
  from public.profiles p
  where p.user_id = v_uid
  limit 1;

  if v_team_id is null then
    return null;
  end if;

  select f.id,
         f.round,
         f.venue,
         f.status,
         f.season_id,
         f.start_time,
         f.home_team_id,
         f.away_team_id
    into v_fixture
  from public.eg_fixtures f
  where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
    and coalesce(f.status, 'SCHEDULED') <> 'FINAL'
  order by coalesce(f.start_time, now()) asc, f.round asc
  limit 1;

  if v_fixture.id is null then
    return null;
  end if;

  select t.id,
         t.name,
         t.short_name,
         t.logo_url,
         coalesce(t.team_key, t.slug) as team_key
    into v_home_team
  from public.eg_teams t
  where t.id = v_fixture.home_team_id
  limit 1;

  select t.id,
         t.name,
         t.short_name,
         t.logo_url,
         coalesce(t.team_key, t.slug) as team_key
    into v_away_team
  from public.eg_teams t
  where t.id = v_fixture.away_team_id
  limit 1;

  return jsonb_build_object(
    'fixture', jsonb_build_object(
      'id', v_fixture.id,
      'round', coalesce(v_fixture.round, 0),
      'venue', coalesce(v_fixture.venue, 'TBC'),
      'status', coalesce(v_fixture.status, 'SCHEDULED'),
      'seasonId', v_fixture.season_id,
      'startTime', v_fixture.start_time
    ),
    'homeTeam', jsonb_build_object(
      'id', v_home_team.id,
      'name', coalesce(v_home_team.name, 'Unassigned'),
      'shortName', coalesce(v_home_team.short_name, v_home_team.name, 'Home'),
      'logo', coalesce(v_home_team.logo_url, ''),
      'teamKey', coalesce(v_home_team.team_key, '')
    ),
    'awayTeam', jsonb_build_object(
      'id', v_away_team.id,
      'name', coalesce(v_away_team.name, 'Unassigned'),
      'shortName', coalesce(v_away_team.short_name, v_away_team.name, 'Away'),
      'logo', coalesce(v_away_team.logo_url, ''),
      'teamKey', coalesce(v_away_team.team_key, '')
    )
  );
end;
$$;

grant execute on function public.eg_next_fixture_with_teams_for_user() to authenticated;
