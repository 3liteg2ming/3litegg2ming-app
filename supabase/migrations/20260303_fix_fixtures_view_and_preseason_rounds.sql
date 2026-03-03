-- Fix fixtures view schema drift + preseason generation behavior.
-- - Recreates eg_fixtures_with_teams without non-existent columns.
-- - Generates preseason fixtures for Round 1 + Round 2 only (no finals placeholders).

DROP VIEW IF EXISTS public.eg_fixtures_with_teams CASCADE;

CREATE VIEW public.eg_fixtures_with_teams (
  id,
  season_id,
  round,
  week_index,
  stage_name,
  stage_index,
  bracket_slot,
  next_fixture_id,
  is_preseason,
  status,
  start_time,
  venue,
  home_team_id,
  away_team_id,
  home_goals,
  home_behinds,
  home_total,
  away_goals,
  away_behinds,
  away_total,
  created_at,
  home_team_slug,
  home_team_name,
  home_team_logo_url,
  away_team_slug,
  away_team_name,
  away_team_logo_url
) AS
SELECT
  f.id,
  f.season_id,
  f.round,
  f.week_index,
  f.stage_name,
  f.stage_index,
  f.bracket_slot,
  f.next_fixture_id,
  f.is_preseason,
  f.status,
  f.start_time,
  f.venue,
  f.home_team_id,
  f.away_team_id,
  f.home_goals,
  f.home_behinds,
  f.home_total,
  f.away_goals,
  f.away_behinds,
  f.away_total,
  f.created_at,
  ht.slug AS home_team_slug,
  ht.name AS home_team_name,
  ht.logo_url AS home_team_logo_url,
  at.slug AS away_team_slug,
  at.name AS away_team_name,
  at.logo_url AS away_team_logo_url
FROM public.eg_fixtures f
LEFT JOIN public.eg_teams ht ON ht.id = f.home_team_id
LEFT JOIN public.eg_teams at ON at.id = f.away_team_id;

COMMENT ON VIEW public.eg_fixtures_with_teams IS
  'Fixtures view with explicit, schema-safe columns for app queries.';

CREATE OR REPLACE FUNCTION public.eg_generate_preseason_two_rounds_then_finals(
  p_preseason_slug text DEFAULT 'preseason',
  p_team_count int DEFAULT 10,
  p_generate_finals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_team_count int;
  v_selected_count int;
  v_needed int;
  v_base_ts timestamptz := now();
  v_attempt int;
  v_conflicts int;
  v_round2_found boolean := false;
  v_round1_ids uuid[];
  v_round2_ids uuid[];
  i int;
BEGIN
  IF p_team_count IS NULL OR p_team_count < 4 OR (p_team_count % 2) <> 0 THEN
    RAISE EXCEPTION 'p_team_count must be an even integer >= 4 (got %)', p_team_count;
  END IF;

  SELECT s.id
  INTO v_season_id
  FROM public.eg_seasons s
  WHERE s.slug = p_preseason_slug
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Preseason season not found for slug "%"', p_preseason_slug;
  END IF;

  -- Clear only preseason/knockout fixtures for this season.
  DELETE FROM public.eg_fixtures f
  WHERE f.season_id = v_season_id
    AND (
      COALESCE(f.is_preseason, false) = true
      OR COALESCE(f.stage_name, '') ILIKE '%preseason%'
      OR f.stage_index IS NOT NULL
    );

  CREATE TEMP TABLE _eg_preseason_pick (
    team_id uuid PRIMARY KEY,
    ord int NOT NULL
  ) ON COMMIT DROP;

  -- Prefer seeded teams if seedings table exists.
  IF to_regclass('public.eg_preseason_seedings') IS NOT NULL THEN
    INSERT INTO _eg_preseason_pick (team_id, ord)
    SELECT s.team_id, row_number() OVER (ORDER BY s.seed)
    FROM (
      SELECT team_id, seed
      FROM public.eg_preseason_seedings
      WHERE season_id = v_season_id
      ORDER BY seed
      LIMIT p_team_count
    ) s;
  END IF;

  SELECT COUNT(*) INTO v_selected_count FROM _eg_preseason_pick;
  v_needed := p_team_count - v_selected_count;

  -- Fill remainder randomly from eg_teams.
  IF v_needed > 0 THEN
    INSERT INTO _eg_preseason_pick (team_id, ord)
    SELECT t.id,
           v_selected_count + row_number() OVER (ORDER BY random())
    FROM public.eg_teams t
    WHERE NOT EXISTS (
      SELECT 1
      FROM _eg_preseason_pick p
      WHERE p.team_id = t.id
    )
    ORDER BY random()
    LIMIT v_needed;
  END IF;

  SELECT COUNT(*) INTO v_selected_count FROM _eg_preseason_pick;
  IF v_selected_count < p_team_count THEN
    RAISE EXCEPTION 'Not enough teams to generate preseason fixtures. Needed %, got %', p_team_count, v_selected_count;
  END IF;

  SELECT array_agg(team_id ORDER BY ord)
  INTO v_round1_ids
  FROM _eg_preseason_pick;

  v_team_count := COALESCE(array_length(v_round1_ids, 1), 0);
  IF v_team_count <> p_team_count THEN
    RAISE EXCEPTION 'Internal team selection error. Expected %, got %', p_team_count, v_team_count;
  END IF;

  CREATE TEMP TABLE _eg_r1_pairs (
    team_a uuid NOT NULL,
    team_b uuid NOT NULL,
    PRIMARY KEY (team_a, team_b)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _eg_r2_pairs (
    team_a uuid NOT NULL,
    team_b uuid NOT NULL,
    PRIMARY KEY (team_a, team_b)
  ) ON COMMIT DROP;

  -- Round 1 fixtures.
  i := 1;
  WHILE i <= v_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id,
      round,
      week_index,
      stage_name,
      stage_index,
      bracket_slot,
      next_fixture_id,
      is_preseason,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id
    ) VALUES (
      v_season_id,
      1,
      1,
      'Round 1',
      1,
      'R1-M' || ((i + 1) / 2),
      NULL,
      true,
      'SCHEDULED',
      v_base_ts + (((i + 1) / 2 - 1) * interval '2 hour'),
      'TBC',
      v_round1_ids[i],
      v_round1_ids[i + 1]
    );

    INSERT INTO _eg_r1_pairs (team_a, team_b)
    VALUES (
      LEAST(v_round1_ids[i], v_round1_ids[i + 1]),
      GREATEST(v_round1_ids[i], v_round1_ids[i + 1])
    );

    i := i + 2;
  END LOOP;

  -- Round 2 fixtures: shuffle + retry until there are no Round 1 rematches.
  FOR v_attempt IN 1..40 LOOP
    TRUNCATE TABLE _eg_r2_pairs;

    SELECT array_agg(x.team_id)
    INTO v_round2_ids
    FROM (
      SELECT team_id
      FROM unnest(v_round1_ids) AS t(team_id)
      ORDER BY random()
    ) x;

    i := 1;
    WHILE i <= v_team_count LOOP
      INSERT INTO _eg_r2_pairs (team_a, team_b)
      VALUES (
        LEAST(v_round2_ids[i], v_round2_ids[i + 1]),
        GREATEST(v_round2_ids[i], v_round2_ids[i + 1])
      );
      i := i + 2;
    END LOOP;

    SELECT COUNT(*)
    INTO v_conflicts
    FROM _eg_r2_pairs r2
    JOIN _eg_r1_pairs r1
      ON r1.team_a = r2.team_a
     AND r1.team_b = r2.team_b;

    IF v_conflicts = 0 THEN
      v_round2_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_round2_found THEN
    RAISE EXCEPTION 'Unable to generate Round 2 without rematches after % attempts', 40;
  END IF;

  i := 1;
  WHILE i <= v_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id,
      round,
      week_index,
      stage_name,
      stage_index,
      bracket_slot,
      next_fixture_id,
      is_preseason,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id
    ) VALUES (
      v_season_id,
      2,
      2,
      'Round 2',
      2,
      'R2-M' || ((i + 1) / 2),
      NULL,
      true,
      'SCHEDULED',
      v_base_ts + interval '7 days' + (((i + 1) / 2 - 1) * interval '2 hour'),
      'TBC',
      v_round2_ids[i],
      v_round2_ids[i + 1]
    );

    i := i + 2;
  END LOOP;

  IF p_generate_finals THEN
    RAISE NOTICE 'Finals generation is deferred until Round 2 completes. No placeholder finals were created.';
  END IF;
END;
$$;
