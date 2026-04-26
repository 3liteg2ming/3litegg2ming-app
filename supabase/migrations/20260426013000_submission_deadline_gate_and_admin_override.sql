begin;

alter table public.eg_fixtures
  add column if not exists allow_late_submission boolean not null default false,
  add column if not exists late_submission_approved_at timestamptz null,
  add column if not exists late_submission_approved_by uuid null;

create or replace function public.eg_submit_result_v2(
  p_fixture_id uuid,
  p_home_goals integer,
  p_home_behinds integer,
  p_away_goals integer,
  p_away_behinds integer,
  p_venue text default null,
  p_goal_kickers_home jsonb default null,
  p_goal_kickers_away jsonb default null,
  p_ocr jsonb default null,
  p_notes text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
  v_profile_source text := null;
  v_fixture_row record;
  v_submission_id uuid;
  v_fixture_submission_id uuid;
  v_home_total integer;
  v_away_total integer;
  v_submitted_at timestamptz := now();
  v_screenshots jsonb := '[]'::jsonb;
  v_screenshot_urls jsonb := '[]'::jsonb;
  v_team_stats jsonb := '{}'::jsonb;
  v_quarter_scores text := null;
  v_submission_deadline timestamptz := '2026-04-26T23:59:59+10:00'::timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select team_id, 'eg_profiles'
    into v_team_id, v_profile_source
  from public.eg_profiles
  where user_id = v_user_id
  limit 1;

  if v_team_id is null then
    select team_id, 'profiles'
      into v_team_id, v_profile_source
    from public.profiles
    where user_id = v_user_id
    limit 1;
  end if;

  if v_team_id is null then
    begin
      select team_id, 'profiles.id'
        into v_team_id, v_profile_source
      from public.profiles
      where id = v_user_id
      limit 1;
    exception when undefined_column then
      null;
    end;
  end if;

  if v_team_id is null then
    raise exception 'User not linked to a team';
  end if;

  if p_home_goals is null
     or p_home_behinds is null
     or p_away_goals is null
     or p_away_behinds is null then
    raise exception 'Complete score required';
  end if;

  if p_ocr is not null and jsonb_typeof(p_ocr -> 'screenshots') = 'array' then
    v_screenshots := coalesce(p_ocr -> 'screenshots', '[]'::jsonb);
  end if;

  if jsonb_array_length(v_screenshots) = 0 then
    raise exception 'At least one screenshot is required';
  end if;

  if p_ocr is not null then
    v_team_stats := coalesce(p_ocr -> 'teamStats', '{}'::jsonb);
    v_quarter_scores := (p_ocr -> 'quarterScores')::text;
  end if;

  select coalesce(jsonb_agg(url_value), '[]'::jsonb)
    into v_screenshot_urls
  from (
    select nullif(trim(screenshot ->> 'publicUrl'), '') as url_value
    from jsonb_array_elements(v_screenshots) as screenshot
  ) urls
  where url_value is not null;

  select id, season_id, home_team_id, away_team_id, status, allow_late_submission
    into v_fixture_row
  from public.eg_fixtures
  where id = p_fixture_id
  for update;

  if v_fixture_row is null then
    raise exception 'Fixture not found';
  end if;

  if v_submitted_at > v_submission_deadline
     and not coalesce(v_fixture_row.allow_late_submission, false) then
    raise exception 'Submission window closed. Admin approval required for this fixture';
  end if;

  if v_team_id::text not in (
    coalesce(v_fixture_row.home_team_id::text, ''),
    coalesce(v_fixture_row.away_team_id::text, '')
  ) then
    raise exception 'Assigned team is not participating in this fixture';
  end if;

  if upper(coalesce(v_fixture_row.status::text, '')) in ('FINAL', 'COMPLETED', 'COMPLETE') then
    raise exception 'Fixture is already FINAL, cannot resubmit';
  end if;

  if exists(select 1 from public.submissions where fixture_id = p_fixture_id) then
    raise exception 'Fixture already has a submitted result';
  end if;

  v_home_total := (p_home_goals * 6) + p_home_behinds;
  v_away_total := (p_away_goals * 6) + p_away_behinds;
  v_submission_id := gen_random_uuid();

  insert into public.submissions (
    id,
    fixture_id,
    team_id,
    user_id,
    submitted_by,
    home_goals,
    home_behinds,
    away_goals,
    away_behinds,
    goal_kickers_home,
    goal_kickers_away,
    screenshot_urls,
    screenshots,
    ocr_raw_text,
    ocr_team_stats,
    ocr_player_stats,
    notes,
    submitted_at
  )
  values (
    v_submission_id,
    p_fixture_id,
    v_team_id,
    v_user_id,
    v_user_id,
    p_home_goals,
    p_home_behinds,
    p_away_goals,
    p_away_behinds,
    coalesce(p_goal_kickers_home, '[]'::jsonb),
    coalesce(p_goal_kickers_away, '[]'::jsonb),
    v_screenshot_urls,
    v_screenshots,
    v_quarter_scores,
    v_team_stats,
    '{}'::jsonb,
    p_notes,
    v_submitted_at
  );

  if to_regclass('public.eg_fixture_submissions') is not null then
    insert into public.eg_fixture_submissions (
      fixture_id,
      submitted_by_user_id,
      submitted_team_id,
      status,
      notes
    )
    values (
      p_fixture_id,
      v_user_id,
      v_team_id,
      'approved',
      p_notes
    )
    on conflict (fixture_id) do update
    set
      submitted_by_user_id = excluded.submitted_by_user_id,
      submitted_team_id = excluded.submitted_team_id,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = now()
    returning id into v_fixture_submission_id;
  end if;

  if v_fixture_submission_id is not null and to_regclass('public.eg_fixture_submission_images') is not null then
    delete from public.eg_fixture_submission_images
    where submission_id = v_fixture_submission_id;

    insert into public.eg_fixture_submission_images (
      submission_id,
      fixture_id,
      image_type,
      stat_key,
      page_number,
      storage_bucket,
      storage_path,
      mime_type,
      ocr_status
    )
    select
      v_fixture_submission_id,
      p_fixture_id,
      coalesce(nullif(trim(screenshot.value ->> 'imageType'), ''), 'match_summary'),
      nullif(trim(screenshot.value ->> 'statKey'), ''),
      case
        when (screenshot.value ->> 'pageNumber') ~ '^\d+$'
        then (screenshot.value ->> 'pageNumber')::integer
        else screenshot.ordinality::integer
      end,
      coalesce(nullif(trim(screenshot.value ->> 'bucket'), ''), 'Assets'),
      coalesce(nullif(trim(screenshot.value ->> 'path'), ''), ''),
      nullif(trim(screenshot.value ->> 'mimeType'), ''),
      'pending'
    from jsonb_array_elements(v_screenshots) with ordinality as screenshot(value, ordinality)
    where coalesce(nullif(trim(screenshot.value ->> 'path'), ''), '') <> '';
  end if;

  update public.eg_fixtures
  set
    home_goals = p_home_goals,
    home_behinds = p_home_behinds,
    away_goals = p_away_goals,
    away_behinds = p_away_behinds,
    home_total = v_home_total,
    away_total = v_away_total,
    status = 'FINAL',
    submitted_by = v_user_id,
    submitted_at = v_submitted_at,
    venue = coalesce(p_venue, venue)
  where id = p_fixture_id;

  with kicker_rows as (
    select
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      v_fixture_row.home_team_id as team_id
    from jsonb_array_elements(coalesce(p_goal_kickers_home, '[]'::jsonb)) as kicker

    union all

    select
      case
        when coalesce(trim(kicker->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (trim(kicker->>'id'))::uuid
        else null
      end as player_id,
      nullif(trim(kicker->>'name'), '') as player_name,
      v_fixture_row.away_team_id as team_id
    from jsonb_array_elements(coalesce(p_goal_kickers_away, '[]'::jsonb)) as kicker
  ),
  identity_rows as (
    select
      player_id,
      max(player_name) as player_name,
      max(team_id) as team_id
    from kicker_rows
    where player_id is not null
    group by player_id
  )
  insert into public.eg_players (id, name, display_name, full_name, team_id)
  select
    player_id,
    player_name,
    player_name,
    player_name,
    team_id
  from identity_rows
  on conflict (id) do update
  set
    name = coalesce(excluded.name, public.eg_players.name),
    display_name = coalesce(excluded.display_name, public.eg_players.display_name),
    full_name = coalesce(excluded.full_name, public.eg_players.full_name),
    team_id = coalesce(excluded.team_id, public.eg_players.team_id);

  if to_regprocedure('public.eg_recompute_ladder()') is not null then
    begin
      perform public.eg_recompute_ladder();
    exception when others then
      raise notice 'eg_recompute_ladder failed after fixture % submit: %', p_fixture_id, sqlerrm;
    end;
  end if;

  if to_regprocedure('public.eg_recompute_stats()') is not null then
    begin
      perform public.eg_recompute_stats();
    exception when others then
      raise notice 'eg_recompute_stats failed after fixture % submit: %', p_fixture_id, sqlerrm;
    end;
  end if;

  return json_build_object(
    'ok', true,
    'submission_id', v_submission_id,
    'fixture_id', p_fixture_id,
    'season_id', v_fixture_row.season_id,
    'submitted_team_id', v_team_id,
    'profile_source', v_profile_source,
    'home_total', v_home_total,
    'away_total', v_away_total,
    'status', 'FINAL',
    'submitted_at', v_submitted_at,
    'screenshots', v_screenshots
  );
end;
$$;

create or replace function public.eg_admin_upsert_fixture(
  p_token text,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_season_id uuid;
  v_season_slug text := nullif(trim(coalesce(payload->>'season_slug', '')), '');
  v_admin_user_id uuid;
  v_allow_late_submission boolean := null;
begin
  perform public.eg_assert_admin_session(p_token);

  select created_by
    into v_admin_user_id
  from public.eg_admin_sessions
  where token = p_token
    and expires_at > now()
  order by created_at desc
  limit 1;

  if payload ? 'allow_late_submission' then
    v_allow_late_submission := coalesce(nullif(payload->>'allow_late_submission', '')::boolean, false);
  end if;

  if nullif(trim(coalesce(payload->>'id', '')), '') is not null then
    v_id := (payload->>'id')::uuid;
  end if;

  if nullif(trim(coalesce(payload->>'season_id', '')), '') is not null then
    v_season_id := (payload->>'season_id')::uuid;
  elsif v_season_slug is not null then
    select id into v_season_id from public.eg_seasons where slug = v_season_slug limit 1;
  end if;

  if v_season_id is null then
    raise exception 'season_id or season_slug is required';
  end if;

  if v_id is null then
    insert into public.eg_fixtures (
      season_id, round, week_index, stage_name, stage_index, bracket_slot, next_fixture_id,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id,
      home_goals, home_behinds, home_total,
      away_goals, away_behinds, away_total,
      allow_late_submission, late_submission_approved_at, late_submission_approved_by
    ) values (
      v_season_id,
      coalesce(nullif(payload->>'round', '')::int, 1),
      nullif(payload->>'week_index', '')::int,
      nullif(payload->>'stage_name', ''),
      nullif(payload->>'stage_index', '')::int,
      nullif(payload->>'bracket_slot', ''),
      nullif(payload->>'next_fixture_id', '')::uuid,
      coalesce(nullif(payload->>'is_preseason', '')::boolean, false),
      coalesce(nullif(payload->>'status', ''), 'SCHEDULED'),
      nullif(payload->>'start_time', '')::timestamptz,
      nullif(payload->>'venue', ''),
      nullif(payload->>'home_team_id', '')::uuid,
      nullif(payload->>'away_team_id', '')::uuid,
      nullif(payload->>'home_goals', '')::int,
      nullif(payload->>'home_behinds', '')::int,
      nullif(payload->>'home_total', '')::int,
      nullif(payload->>'away_goals', '')::int,
      nullif(payload->>'away_behinds', '')::int,
      nullif(payload->>'away_total', '')::int,
      coalesce(v_allow_late_submission, false),
      case when coalesce(v_allow_late_submission, false) then now() else null end,
      case when coalesce(v_allow_late_submission, false) then v_admin_user_id else null end
    )
    returning id into v_id;

    return v_id;
  end if;

  update public.eg_fixtures
  set
    season_id = v_season_id,
    round = coalesce(nullif(payload->>'round', '')::int, 1),
    week_index = nullif(payload->>'week_index', '')::int,
    stage_name = nullif(payload->>'stage_name', ''),
    stage_index = nullif(payload->>'stage_index', '')::int,
    bracket_slot = nullif(payload->>'bracket_slot', ''),
    next_fixture_id = nullif(payload->>'next_fixture_id', '')::uuid,
    is_preseason = coalesce(nullif(payload->>'is_preseason', '')::boolean, false),
    status = coalesce(nullif(payload->>'status', ''), 'SCHEDULED'),
    start_time = nullif(payload->>'start_time', '')::timestamptz,
    venue = nullif(payload->>'venue', ''),
    home_team_id = nullif(payload->>'home_team_id', '')::uuid,
    away_team_id = nullif(payload->>'away_team_id', '')::uuid,
    home_goals = nullif(payload->>'home_goals', '')::int,
    home_behinds = nullif(payload->>'home_behinds', '')::int,
    home_total = nullif(payload->>'home_total', '')::int,
    away_goals = nullif(payload->>'away_goals', '')::int,
    away_behinds = nullif(payload->>'away_behinds', '')::int,
    away_total = nullif(payload->>'away_total', '')::int,
    allow_late_submission = case
      when v_allow_late_submission is null then allow_late_submission
      else v_allow_late_submission
    end,
    late_submission_approved_at = case
      when v_allow_late_submission is null then late_submission_approved_at
      when v_allow_late_submission then coalesce(late_submission_approved_at, now())
      else null
    end,
    late_submission_approved_by = case
      when v_allow_late_submission is null then late_submission_approved_by
      when v_allow_late_submission then coalesce(late_submission_approved_by, v_admin_user_id)
      else null
    end
  where id = v_id;

  if not found then
    insert into public.eg_fixtures (
      id,
      season_id, round, week_index, stage_name, stage_index, bracket_slot, next_fixture_id,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id,
      home_goals, home_behinds, home_total,
      away_goals, away_behinds, away_total,
      allow_late_submission, late_submission_approved_at, late_submission_approved_by
    ) values (
      v_id,
      v_season_id,
      coalesce(nullif(payload->>'round', '')::int, 1),
      nullif(payload->>'week_index', '')::int,
      nullif(payload->>'stage_name', ''),
      nullif(payload->>'stage_index', '')::int,
      nullif(payload->>'bracket_slot', ''),
      nullif(payload->>'next_fixture_id', '')::uuid,
      coalesce(nullif(payload->>'is_preseason', '')::boolean, false),
      coalesce(nullif(payload->>'status', ''), 'SCHEDULED'),
      nullif(payload->>'start_time', '')::timestamptz,
      nullif(payload->>'venue', ''),
      nullif(payload->>'home_team_id', '')::uuid,
      nullif(payload->>'away_team_id', '')::uuid,
      nullif(payload->>'home_goals', '')::int,
      nullif(payload->>'home_behinds', '')::int,
      nullif(payload->>'home_total', '')::int,
      nullif(payload->>'away_goals', '')::int,
      nullif(payload->>'away_behinds', '')::int,
      nullif(payload->>'away_total', '')::int,
      coalesce(v_allow_late_submission, false),
      case when coalesce(v_allow_late_submission, false) then now() else null end,
      case when coalesce(v_allow_late_submission, false) then v_admin_user_id else null end
    );
  end if;

  return v_id;
end;
$$;

drop function if exists public.eg_admin_update_fixture(uuid, text, timestamptz, text);

create or replace function public.eg_admin_update_fixture(
  p_fixture_id uuid,
  p_status text default null,
  p_start_time timestamptz default null,
  p_venue text default null,
  p_allow_late_submission boolean default null
)
returns public.eg_fixtures
language plpgsql
security definer
as $$
declare
  v_row public.eg_fixtures;
  v_actor_user_id uuid;
begin
  perform public.eg_require_admin();
  v_actor_user_id := auth.uid();

  update public.eg_fixtures
     set status = coalesce(p_status, status),
         start_time = coalesce(p_start_time, start_time),
         venue = coalesce(p_venue, venue),
         allow_late_submission = coalesce(p_allow_late_submission, allow_late_submission),
         late_submission_approved_at = case
           when p_allow_late_submission is null then late_submission_approved_at
           when p_allow_late_submission then coalesce(late_submission_approved_at, now())
           else null
         end,
         late_submission_approved_by = case
           when p_allow_late_submission is null then late_submission_approved_by
           when p_allow_late_submission then coalesce(late_submission_approved_by, v_actor_user_id)
           else null
         end
   where id = p_fixture_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Updated fixture fields',
    jsonb_build_object(
      'status', p_status,
      'start_time', p_start_time,
      'venue', p_venue,
      'allow_late_submission', p_allow_late_submission
    )
  );

  return v_row;
end $$;

grant execute on function public.eg_submit_result_v2(
  uuid,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  text
) to authenticated;

grant execute on function public.eg_admin_upsert_fixture(text, jsonb) to anon, authenticated;
grant execute on function public.eg_admin_update_fixture(uuid, text, timestamptz, text, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
