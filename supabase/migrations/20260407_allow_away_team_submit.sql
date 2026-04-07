-- Allow both home and away coaches to submit fixture results.
-- Previously only the home team coach could submit (eg_submit_result_v2).
-- This migration replaces the home-only check with a check that the
-- submitting coach's team is either the home OR away team in the fixture.

-- We use CREATE OR REPLACE to update the function in-place.
-- The full function body is copied from 20260323_fix_team_stats_pipeline.sql
-- with the only change being the team validation on lines 170-173.

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
  v_fixture_row record;
  v_submission_id uuid;
  v_home_total integer;
  v_away_total integer;
  v_screenshots jsonb;
  v_screenshot_urls text[];
  v_ocr_raw_text text;
  v_ocr_team_stats jsonb;
  v_ocr_player_stats jsonb;
  v_season_id uuid;
begin
  -- Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve team
  select team_id into v_team_id
  from public.eg_coaches
  where user_id = v_user_id
  limit 1;

  if v_team_id is null then
    select team_id into v_team_id
    from public.eg_season_participants
    where user_id = v_user_id
    limit 1;
  end if;

  if v_team_id is null then
    raise exception 'No team linked to this account';
  end if;

  -- Validate scores
  if p_home_goals is null or p_home_behinds is null
     or p_away_goals is null or p_away_behinds is null then
    raise exception 'Complete score is required (home goals, home behinds, away goals, away behinds)';
  end if;

  -- Extract OCR fields
  v_screenshots := coalesce(p_ocr -> 'screenshots', '[]'::jsonb);
  v_ocr_raw_text := coalesce(p_ocr ->> 'rawText', '');
  v_ocr_team_stats := coalesce(p_ocr -> 'teamStats', '{}'::jsonb);
  v_ocr_player_stats := coalesce(p_ocr -> 'playerStats', '{}'::jsonb);

  select array_agg(url_value)
    into v_screenshot_urls
  from (
    select nullif(trim(screenshot ->> 'publicUrl'), '') as url_value
    from jsonb_array_elements(v_screenshots) as screenshot
  ) urls
  where url_value is not null;

  select id, season_id, home_team_id, away_team_id, status
    into v_fixture_row
  from public.eg_fixtures
  where id = p_fixture_id
  for update;

  if v_fixture_row is null then
    raise exception 'Fixture not found';
  end if;

  -- *** CHANGED: Allow both home and away team coaches to submit ***
  if v_team_id::text not in (
    coalesce(v_fixture_row.home_team_id::text, ''),
    coalesce(v_fixture_row.away_team_id::text, '')
  ) then
    raise exception 'Your team is not participating in this fixture';
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
  ) values (
    v_submission_id,
    p_fixture_id,
    v_team_id,
    v_user_id,
    v_user_id::text,
    p_home_goals,
    p_home_behinds,
    p_away_goals,
    p_away_behinds,
    coalesce(p_goal_kickers_home, '[]'::jsonb),
    coalesce(p_goal_kickers_away, '[]'::jsonb),
    coalesce(v_screenshot_urls, array[]::text[]),
    v_screenshots,
    v_ocr_raw_text,
    v_ocr_team_stats,
    v_ocr_player_stats,
    coalesce(p_notes, ''),
    now()
  );

  -- Create / overwrite eg_fixture_submissions row
  insert into public.eg_fixture_submissions (fixture_id, submitted_by_user_id, submitted_team_id, status, notes, updated_at)
  values (p_fixture_id, v_user_id, v_team_id, 'submitted', coalesce(p_notes, ''), now())
  on conflict (fixture_id) do update set
    submitted_by_user_id = excluded.submitted_by_user_id,
    submitted_team_id = excluded.submitted_team_id,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

  -- Persist screenshot metadata into eg_fixture_submission_images
  if jsonb_array_length(v_screenshots) > 0 then
    insert into public.eg_fixture_submission_images (
      submission_id,
      fixture_id,
      image_type,
      storage_bucket,
      storage_path,
      mime_type,
      ocr_status,
      page_number
    )
    select
      v_submission_id,
      p_fixture_id,
      coalesce(nullif(trim(s ->> 'imageType'), ''), 'match_summary'),
      coalesce(nullif(trim(s ->> 'bucket'), ''), 'Assets'),
      nullif(trim(s ->> 'storagePath'), ''),
      coalesce(nullif(trim(s ->> 'mimeType'), ''), 'image/jpeg'),
      'queued',
      row_number() over ()::int
    from jsonb_array_elements(v_screenshots) as s
    where nullif(trim(s ->> 'storagePath'), '') is not null;
  end if;

  -- Update fixture scores and status
  update public.eg_fixtures
  set
    home_goals   = p_home_goals,
    home_behinds = p_home_behinds,
    away_goals   = p_away_goals,
    away_behinds = p_away_behinds,
    home_total   = v_home_total,
    away_total   = v_away_total,
    status       = 'FINAL',
    submitted_at = now(),
    venue        = coalesce(nullif(trim(p_venue), ''), venue)
  where id = p_fixture_id;

  v_season_id := v_fixture_row.season_id;

  -- Upsert goal kickers into eg_players
  with raw_kickers as (
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
      player_name,
      team_id
    from raw_kickers
    where player_name is not null
  )
  insert into public.eg_players (id, name, team_id)
  select
    coalesce(player_id, gen_random_uuid()),
    player_name,
    team_id
  from identity_rows
  on conflict (id) do update
    set name    = excluded.name,
        team_id = coalesce(excluded.team_id, eg_players.team_id);

  -- OCR team stats → eg_fixture_team_stats
  if v_ocr_team_stats is not null and v_ocr_team_stats <> '{}'::jsonb then
    -- home stats
    insert into public.eg_fixture_team_stats (
      fixture_id, team_id, side,
      disposals, kicks, handballs, marks, tackles, clearances,
      hitouts, frees_for, frees_against, goals, behinds,
      rushed_behinds, inside_50s, rebound_50s, clangers, turnovers
    )
    values (
      p_fixture_id, v_fixture_row.home_team_id, 'home',
      (v_ocr_team_stats -> 'home' ->> 'disposals')::int,
      (v_ocr_team_stats -> 'home' ->> 'kicks')::int,
      (v_ocr_team_stats -> 'home' ->> 'handballs')::int,
      (v_ocr_team_stats -> 'home' ->> 'marks')::int,
      (v_ocr_team_stats -> 'home' ->> 'tackles')::int,
      (v_ocr_team_stats -> 'home' ->> 'clearances')::int,
      (v_ocr_team_stats -> 'home' ->> 'hitouts')::int,
      (v_ocr_team_stats -> 'home' ->> 'freesFor')::int,
      (v_ocr_team_stats -> 'home' ->> 'freesAgainst')::int,
      (v_ocr_team_stats -> 'home' ->> 'goals')::int,
      (v_ocr_team_stats -> 'home' ->> 'behinds')::int,
      (v_ocr_team_stats -> 'home' ->> 'rushedBehinds')::int,
      (v_ocr_team_stats -> 'home' ->> 'inside50s')::int,
      (v_ocr_team_stats -> 'home' ->> 'rebound50s')::int,
      (v_ocr_team_stats -> 'home' ->> 'clangers')::int,
      (v_ocr_team_stats -> 'home' ->> 'turnovers')::int
    )
    on conflict (fixture_id, team_id) do update set
      disposals      = excluded.disposals,
      kicks          = excluded.kicks,
      handballs      = excluded.handballs,
      marks          = excluded.marks,
      tackles        = excluded.tackles,
      clearances     = excluded.clearances,
      hitouts        = excluded.hitouts,
      frees_for      = excluded.frees_for,
      frees_against  = excluded.frees_against,
      goals          = excluded.goals,
      behinds        = excluded.behinds,
      rushed_behinds = excluded.rushed_behinds,
      inside_50s     = excluded.inside_50s,
      rebound_50s    = excluded.rebound_50s,
      clangers       = excluded.clangers,
      turnovers      = excluded.turnovers;

    -- away stats
    insert into public.eg_fixture_team_stats (
      fixture_id, team_id, side,
      disposals, kicks, handballs, marks, tackles, clearances,
      hitouts, frees_for, frees_against, goals, behinds,
      rushed_behinds, inside_50s, rebound_50s, clangers, turnovers
    )
    values (
      p_fixture_id, v_fixture_row.away_team_id, 'away',
      (v_ocr_team_stats -> 'away' ->> 'disposals')::int,
      (v_ocr_team_stats -> 'away' ->> 'kicks')::int,
      (v_ocr_team_stats -> 'away' ->> 'handballs')::int,
      (v_ocr_team_stats -> 'away' ->> 'marks')::int,
      (v_ocr_team_stats -> 'away' ->> 'tackles')::int,
      (v_ocr_team_stats -> 'away' ->> 'clearances')::int,
      (v_ocr_team_stats -> 'away' ->> 'hitouts')::int,
      (v_ocr_team_stats -> 'away' ->> 'freesFor')::int,
      (v_ocr_team_stats -> 'away' ->> 'freesAgainst')::int,
      (v_ocr_team_stats -> 'away' ->> 'goals')::int,
      (v_ocr_team_stats -> 'away' ->> 'behinds')::int,
      (v_ocr_team_stats -> 'away' ->> 'rushedBehinds')::int,
      (v_ocr_team_stats -> 'away' ->> 'inside50s')::int,
      (v_ocr_team_stats -> 'away' ->> 'rebound50s')::int,
      (v_ocr_team_stats -> 'away' ->> 'clangers')::int,
      (v_ocr_team_stats -> 'away' ->> 'turnovers')::int
    )
    on conflict (fixture_id, team_id) do update set
      disposals      = excluded.disposals,
      kicks          = excluded.kicks,
      handballs      = excluded.handballs,
      marks          = excluded.marks,
      tackles        = excluded.tackles,
      clearances     = excluded.clearances,
      hitouts        = excluded.hitouts,
      frees_for      = excluded.frees_for,
      frees_against  = excluded.frees_against,
      goals          = excluded.goals,
      behinds        = excluded.behinds,
      rushed_behinds = excluded.rushed_behinds,
      inside_50s     = excluded.inside_50s,
      rebound_50s    = excluded.rebound_50s,
      clangers       = excluded.clangers,
      turnovers      = excluded.turnovers;
  end if;

  -- Quarter scores
  if p_ocr is not null and p_ocr -> 'quarterScores' is not null then
    insert into public.eg_fixture_quarter_scores (
      fixture_id,
      home_q1, home_q2, home_q3, home_q4,
      away_q1, away_q2, away_q3, away_q4
    )
    values (
      p_fixture_id,
      (p_ocr -> 'quarterScores' -> 'home' ->> 'q1')::int,
      (p_ocr -> 'quarterScores' -> 'home' ->> 'q2')::int,
      (p_ocr -> 'quarterScores' -> 'home' ->> 'q3')::int,
      (p_ocr -> 'quarterScores' -> 'home' ->> 'q4')::int,
      (p_ocr -> 'quarterScores' -> 'away' ->> 'q1')::int,
      (p_ocr -> 'quarterScores' -> 'away' ->> 'q2')::int,
      (p_ocr -> 'quarterScores' -> 'away' ->> 'q3')::int,
      (p_ocr -> 'quarterScores' -> 'away' ->> 'q4')::int
    )
    on conflict (fixture_id) do update set
      home_q1 = excluded.home_q1,
      home_q2 = excluded.home_q2,
      home_q3 = excluded.home_q3,
      home_q4 = excluded.home_q4,
      away_q1 = excluded.away_q1,
      away_q2 = excluded.away_q2,
      away_q3 = excluded.away_q3,
      away_q4 = excluded.away_q4;
  end if;

  -- Recompute ladder + stats
  if exists (select 1 from pg_proc where proname = 'eg_recompute_ladder') then
    perform public.eg_recompute_ladder();
  end if;

  if exists (select 1 from pg_proc where proname = 'eg_recompute_stats') then
    perform public.eg_recompute_stats();
  end if;

  return json_build_object(
    'ok', true,
    'submission_id', v_submission_id,
    'fixture_id', p_fixture_id,
    'season_id', v_season_id,
    'home_total', v_home_total,
    'away_total', v_away_total
  );
end;
$$;
