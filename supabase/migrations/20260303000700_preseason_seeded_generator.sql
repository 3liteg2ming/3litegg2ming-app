-- Preseason seeded generation based on AFL26 Season One form.
-- Adds preseason_seed to teams, validation helpers, deterministic generator, and finals placeholder.

BEGIN;

ALTER TABLE public.eg_teams
  ADD COLUMN IF NOT EXISTS preseason_seed int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'eg_teams_preseason_seed_range_chk'
      AND conrelid = 'public.eg_teams'::regclass
  ) THEN
    ALTER TABLE public.eg_teams
      ADD CONSTRAINT eg_teams_preseason_seed_range_chk
      CHECK (preseason_seed IS NULL OR (preseason_seed >= 1 AND preseason_seed <= 32));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_eg_teams_preseason_seed
  ON public.eg_teams (preseason_seed)
  WHERE preseason_seed IS NOT NULL;

DROP FUNCTION IF EXISTS public.eg_preseason_reset_and_generate_rounds(text, integer);
DROP FUNCTION IF EXISTS public.eg_preseason_reset_and_generate_rounds(text, integer, integer);

CREATE OR REPLACE FUNCTION public.eg_preseason_validate_seeds(p_team_count int)
RETURNS TABLE(issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_count int := COALESCE(p_team_count, 10);
  v_total_teams int := 0;
  v_seeded_teams int := 0;
BEGIN
  IF v_team_count < 4 OR (v_team_count % 2) <> 0 THEN
    RETURN QUERY SELECT format('invalid team count: %s (must be even and >= 4)', v_team_count);
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM public.eg_teams;
  IF v_total_teams < v_team_count THEN
    RETURN QUERY SELECT format('not enough teams: have %s, need %s', v_total_teams, v_team_count);
  END IF;

  RETURN QUERY
  SELECT format('seed outside range 1..32: %s (%s)', t.name, t.preseason_seed)
  FROM public.eg_teams t
  WHERE t.preseason_seed IS NOT NULL
    AND (t.preseason_seed < 1 OR t.preseason_seed > 32)
  ORDER BY t.name;

  RETURN QUERY
  SELECT format('duplicate seed %s: %s', d.preseason_seed, string_agg(d.name, ', ' ORDER BY d.name))
  FROM (
    SELECT preseason_seed, name
    FROM public.eg_teams
    WHERE preseason_seed IS NOT NULL
  ) d
  GROUP BY d.preseason_seed
  HAVING COUNT(*) > 1
  ORDER BY d.preseason_seed;

  SELECT COUNT(*)
  INTO v_seeded_teams
  FROM public.eg_teams
  WHERE preseason_seed IS NOT NULL;

  IF v_seeded_teams < v_team_count THEN
    RETURN QUERY SELECT format('missing seeds: only %s seeded teams for requested %s slots', v_seeded_teams, v_team_count);
  ELSE
    RETURN QUERY
    SELECT format('missing seed number in 1..%s: %s', v_team_count, gs)
    FROM generate_series(1, LEAST(v_team_count, 32)) gs
    LEFT JOIN public.eg_teams t ON t.preseason_seed = gs
    WHERE t.id IS NULL
    ORDER BY gs;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT 1
      FROM public.eg_teams t
      WHERE t.preseason_seed IS NOT NULL
        AND (t.preseason_seed < 1 OR t.preseason_seed > 32)
      UNION ALL
      SELECT 1
      FROM (
        SELECT preseason_seed
        FROM public.eg_teams
        WHERE preseason_seed IS NOT NULL
        GROUP BY preseason_seed
        HAVING COUNT(*) > 1
      ) dup
      UNION ALL
      SELECT 1
      WHERE v_total_teams < v_team_count
      UNION ALL
      SELECT 1
      WHERE v_seeded_teams < v_team_count
    ) problems
  ) THEN
    RETURN QUERY SELECT 'ok';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_preseason_reset_and_generate_rounds(
  p_season_slug text,
  p_team_count int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_team_count int := COALESCE(p_team_count, 10);
  v_selected_count int := 0;
  v_half int;
  i int;

  v_home uuid;
  v_away uuid;
  v_tmp uuid;

  v_home_ids uuid[] := ARRAY[]::uuid[];
  v_away_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_team_count < 4 OR (v_team_count % 2) <> 0 THEN
    RAISE EXCEPTION 'p_team_count must be an even integer >= 4 (got %)', v_team_count;
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

  CREATE TEMP TABLE _eg_preseason_selected (
    seed_rank int PRIMARY KEY,
    team_id uuid NOT NULL UNIQUE,
    source_seed int NULL
  ) ON COMMIT DROP;

  INSERT INTO _eg_preseason_selected (seed_rank, team_id, source_seed)
  SELECT
    row_number() OVER (
      ORDER BY
        CASE WHEN t.preseason_seed IS NULL THEN 1 ELSE 0 END,
        t.preseason_seed ASC NULLS LAST,
        lower(t.name) ASC,
        t.id ASC
    )::int AS seed_rank,
    t.id,
    t.preseason_seed
  FROM public.eg_teams t
  ORDER BY
    CASE WHEN t.preseason_seed IS NULL THEN 1 ELSE 0 END,
    t.preseason_seed ASC NULLS LAST,
    lower(t.name) ASC,
    t.id ASC
  LIMIT v_team_count;

  SELECT COUNT(*) INTO v_selected_count FROM _eg_preseason_selected;
  IF v_selected_count < v_team_count THEN
    RAISE EXCEPTION 'Not enough teams to generate preseason fixtures. Needed %, got %', v_team_count, v_selected_count;
  END IF;

  v_half := v_team_count / 2;

  CREATE TEMP TABLE _eg_r1_pairs (
    team_a uuid NOT NULL,
    team_b uuid NOT NULL,
    PRIMARY KEY (team_a, team_b)
  ) ON COMMIT DROP;

  -- Round 1: 1 v N, 2 v N-1, ...
  FOR i IN 1..v_half LOOP
    SELECT team_id INTO v_home FROM _eg_preseason_selected WHERE seed_rank = i;
    SELECT team_id INTO v_away FROM _eg_preseason_selected WHERE seed_rank = (v_team_count - i + 1);

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
      v_home,
      v_away
    );

    INSERT INTO _eg_r1_pairs (team_a, team_b)
    VALUES (LEAST(v_home, v_away), GREATEST(v_home, v_away));
  END LOOP;

  -- Round 2 base pairings: seed1 v seed(half+1), seed2 v seed(half+2), ...
  FOR i IN 1..v_half LOOP
    SELECT team_id INTO v_home FROM _eg_preseason_selected WHERE seed_rank = i;
    SELECT team_id INTO v_away FROM _eg_preseason_selected WHERE seed_rank = (v_half + i);

    v_home_ids := array_append(v_home_ids, v_home);
    v_away_ids := array_append(v_away_ids, v_away);
  END LOOP;

  -- Best-effort deterministic swap to avoid Round 1 repeats.
  FOR i IN 1..v_half LOOP
    IF EXISTS (
      SELECT 1
      FROM _eg_r1_pairs r1
      WHERE r1.team_a = LEAST(v_home_ids[i], v_away_ids[i])
        AND r1.team_b = GREATEST(v_home_ids[i], v_away_ids[i])
    ) THEN
      IF i < v_half THEN
        v_tmp := v_away_ids[i];
        v_away_ids[i] := v_away_ids[i + 1];
        v_away_ids[i + 1] := v_tmp;
      ELSIF v_half > 1 THEN
        v_tmp := v_away_ids[i - 1];
        v_away_ids[i - 1] := v_away_ids[i];
        v_away_ids[i] := v_tmp;
      END IF;
    END IF;
  END LOOP;

  -- Round 2 inserts.
  FOR i IN 1..v_half LOOP
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
      v_home_ids[i],
      v_away_ids[i]
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_preseason_seed_finals(p_season_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE NOTICE 'Finals seeding not implemented yet';
END;
$$;

COMMIT;
