-- Fix fixture cards view compatibility and preseason round generation.
-- - Adds missing fixture submission columns when absent.
-- - Rebuilds eg_fixture_cards using DROP + CREATE (no CREATE OR REPLACE rename conflict).
-- - Adds unique index to prevent duplicate pairings per season/week.
-- - Adds preseason reset+generate function for exactly Round 1 and Round 2.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_fixtures'
      AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE public.eg_fixtures ADD COLUMN submitted_by uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_fixtures'
      AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE public.eg_fixtures ADD COLUMN submitted_at timestamptz NULL;
  END IF;
END
$$;

DROP VIEW IF EXISTS public.eg_fixture_cards;

DO $$
DECLARE
  has_eg_coaches boolean := to_regclass('public.eg_coaches') IS NOT NULL;
  has_eg_profiles boolean := to_regclass('public.eg_profiles') IS NOT NULL;
  has_profiles boolean := to_regclass('public.profiles') IS NOT NULL;

  coach_name_col text;
  coach_psn_col text;

  sql_text text;
  home_coach_name_expr text := 'NULL::text';
  away_coach_name_expr text := 'NULL::text';
  home_psn_expr text := 'NULL::text';
  away_psn_expr text := 'NULL::text';

  coach_join_sql text := '';
BEGIN
  IF has_eg_coaches THEN
    SELECT c.column_name
    INTO coach_name_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'eg_coaches'
      AND c.column_name IN ('display_name', 'full_name', 'name')
    ORDER BY CASE c.column_name WHEN 'display_name' THEN 1 WHEN 'full_name' THEN 2 ELSE 3 END
    LIMIT 1;

    SELECT c.column_name
    INTO coach_psn_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'eg_coaches'
      AND c.column_name IN ('psn', 'psn_id')
    ORDER BY CASE c.column_name WHEN 'psn' THEN 1 ELSE 2 END
    LIMIT 1;

    coach_join_sql := ' LEFT JOIN LATERAL (
      SELECT ' ||
      COALESCE(format('c.%I::text AS coach_name', coach_name_col), 'NULL::text AS coach_name') || ', ' ||
      COALESCE(format('c.%I::text AS coach_psn', coach_psn_col), 'NULL::text AS coach_psn') || '
      FROM public.eg_coaches c
      WHERE c.team_id = f.home_team_id
      LIMIT 1
    ) hc ON true
    LEFT JOIN LATERAL (
      SELECT ' ||
      COALESCE(format('c.%I::text AS coach_name', coach_name_col), 'NULL::text AS coach_name') || ', ' ||
      COALESCE(format('c.%I::text AS coach_psn', coach_psn_col), 'NULL::text AS coach_psn') || '
      FROM public.eg_coaches c
      WHERE c.team_id = f.away_team_id
      LIMIT 1
    ) ac ON true ';

    home_coach_name_expr := 'hc.coach_name';
    away_coach_name_expr := 'ac.coach_name';
    home_psn_expr := 'hc.coach_psn';
    away_psn_expr := 'ac.coach_psn';

  ELSIF has_eg_profiles THEN
    coach_join_sql := ' LEFT JOIN LATERAL (
      SELECT p.display_name::text AS coach_name, p.psn::text AS coach_psn
      FROM public.eg_profiles p
      WHERE p.team_id = f.home_team_id
      LIMIT 1
    ) hp ON true
    LEFT JOIN LATERAL (
      SELECT p.display_name::text AS coach_name, p.psn::text AS coach_psn
      FROM public.eg_profiles p
      WHERE p.team_id = f.away_team_id
      LIMIT 1
    ) ap ON true ';

    home_coach_name_expr := 'hp.coach_name';
    away_coach_name_expr := 'ap.coach_name';
    home_psn_expr := 'hp.coach_psn';
    away_psn_expr := 'ap.coach_psn';

  ELSIF has_profiles THEN
    coach_join_sql := ' LEFT JOIN LATERAL (
      SELECT p.display_name::text AS coach_name, p.psn::text AS coach_psn
      FROM public.profiles p
      WHERE p.team_id = f.home_team_id
      LIMIT 1
    ) hp ON true
    LEFT JOIN LATERAL (
      SELECT p.display_name::text AS coach_name, p.psn::text AS coach_psn
      FROM public.profiles p
      WHERE p.team_id = f.away_team_id
      LIMIT 1
    ) ap ON true ';

    home_coach_name_expr := 'hp.coach_name';
    away_coach_name_expr := 'ap.coach_name';
    home_psn_expr := 'hp.coach_psn';
    away_psn_expr := 'ap.coach_psn';
  END IF;

  sql_text := 'CREATE VIEW public.eg_fixture_cards AS
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
      ht.slug AS home_team_slug,
      at.slug AS away_team_slug,
      ht.name AS home_team_name,
      at.name AS away_team_name,
      ht.logo_url AS home_team_logo_url,
      at.logo_url AS away_team_logo_url,
      f.home_goals,
      f.home_behinds,
      f.home_total,
      f.away_goals,
      f.away_behinds,
      f.away_total,
      f.submitted_by,
      f.submitted_at,
      f.created_at,
      COALESCE(' || home_coach_name_expr || ', NULL::text) AS home_coach_name,
      COALESCE(' || away_coach_name_expr || ', NULL::text) AS away_coach_name,
      COALESCE(' || home_psn_expr || ', NULL::text) AS home_psn,
      COALESCE(' || away_psn_expr || ', NULL::text) AS away_psn
    FROM public.eg_fixtures f
    LEFT JOIN public.eg_teams ht ON ht.id = f.home_team_id
    LEFT JOIN public.eg_teams at ON at.id = f.away_team_id' || coach_join_sql || ';';

  EXECUTE sql_text;
END
$$;

COMMENT ON VIEW public.eg_fixture_cards IS
  'Stable fixture card projection with teams and optional coach/profile info.';

CREATE UNIQUE INDEX IF NOT EXISTS eg_fixtures_unique_pairing_per_week
  ON public.eg_fixtures (
    season_id,
    week_index,
    LEAST(home_team_id, away_team_id),
    GREATEST(home_team_id, away_team_id)
  )
  WHERE home_team_id IS NOT NULL
    AND away_team_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eg_preseason_reset_and_generate_rounds(
  p_season_slug text DEFAULT 'preseason',
  p_team_count int DEFAULT 10,
  p_seed int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_selected_count int;
  v_attempt int;
  v_conflicts int;
  v_round2_ok boolean := false;
  v_team_ids uuid[];
  v_round2_ids uuid[];
  i int;
  v_seed numeric;
BEGIN
  IF p_team_count IS NULL OR p_team_count < 4 OR (p_team_count % 2) <> 0 THEN
    RAISE EXCEPTION 'p_team_count must be an even integer >= 4 (got %)', p_team_count;
  END IF;

  SELECT s.id
  INTO v_season_id
  FROM public.eg_seasons s
  WHERE s.slug = p_season_slug
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Season not found for slug "%"', p_season_slug;
  END IF;

  DELETE FROM public.eg_fixtures
  WHERE season_id = v_season_id;

  IF p_seed IS NOT NULL THEN
    v_seed := ((abs(p_seed)::numeric % 1000000) / 500000.0) - 1.0;
    PERFORM setseed(v_seed::double precision);
  END IF;

  SELECT array_agg(x.id ORDER BY x.rnd)
  INTO v_team_ids
  FROM (
    SELECT t.id, random() AS rnd
    FROM public.eg_teams t
    ORDER BY rnd
    LIMIT p_team_count
  ) x;

  v_selected_count := COALESCE(array_length(v_team_ids, 1), 0);
  IF v_selected_count <> p_team_count THEN
    RAISE EXCEPTION 'Not enough teams to generate preseason rounds. Needed %, got %', p_team_count, v_selected_count;
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

  i := 1;
  WHILE i <= p_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id,
      round,
      week_index,
      stage_name,
      stage_index,
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
      true,
      'SCHEDULED',
      NULL,
      NULL,
      v_team_ids[i],
      v_team_ids[i + 1]
    );

    INSERT INTO _eg_r1_pairs (team_a, team_b)
    VALUES (
      LEAST(v_team_ids[i], v_team_ids[i + 1]),
      GREATEST(v_team_ids[i], v_team_ids[i + 1])
    );

    i := i + 2;
  END LOOP;

  FOR v_attempt IN 1..40 LOOP
    TRUNCATE TABLE _eg_r2_pairs;

    SELECT array_agg(u.team_id)
    INTO v_round2_ids
    FROM (
      SELECT team_id
      FROM unnest(v_team_ids) AS t(team_id)
      ORDER BY random()
    ) u;

    i := 1;
    WHILE i <= p_team_count LOOP
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
      v_round2_ok := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_round2_ok THEN
    SELECT array_agg(u.team_id)
    INTO v_round2_ids
    FROM (
      SELECT team_id
      FROM unnest(v_team_ids) AS t(team_id)
      ORDER BY random()
    ) u;
  END IF;

  i := 1;
  WHILE i <= p_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id,
      round,
      week_index,
      stage_name,
      stage_index,
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
      true,
      'SCHEDULED',
      NULL,
      NULL,
      v_round2_ids[i],
      v_round2_ids[i + 1]
    );

    i := i + 2;
  END LOOP;
END;
$$;

-- select public.eg_preseason_reset_and_generate_rounds('preseason', 10);
