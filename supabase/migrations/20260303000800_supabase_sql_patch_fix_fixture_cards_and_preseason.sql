/* =========================================================
   EG SUPABASE PATCH — Fix team slugs, rebuild fixture view,
   and replace preseason generator with a stable signature.
   Run in Supabase Dashboard -> SQL Editor as postgres.
   ========================================================= */

BEGIN;

-- 0) Make sure team slugs exist (this is the #1 reason you see TBC).
-- If you already have slugs, this won't change them.
UPDATE public.eg_teams
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE (slug IS NULL OR trim(slug) = '')
  AND name IS NOT NULL
  AND trim(name) <> '';

-- 1) Drop ALL existing overloads of the preseason generator so we can recreate cleanly.
-- (This fixes the “cannot remove parameter defaults” error.)
DROP FUNCTION IF EXISTS public.eg_preseason_reset_and_generate_rounds(text, integer);
DROP FUNCTION IF EXISTS public.eg_preseason_reset_and_generate_rounds(text, integer, integer);

-- 2) Recreate the generator with the signature your app/calls want.
-- Generates EXACTLY:
--  - Week 1: Round 1 (p_team_count/2 matches)
--  - Week 2: Round 2 (p_team_count/2 matches, best-effort avoids repeats)
CREATE OR REPLACE FUNCTION public.eg_preseason_reset_and_generate_rounds(
  p_season_slug text,
  p_team_count integer,
  p_seed integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_team_ids uuid[];
  v_round2_ids uuid[];
  i int;
  v_seed numeric;
  v_conflicts int;
  v_attempt int;
  v_round2_ok boolean := false;
BEGIN
  IF p_team_count IS NULL OR p_team_count < 4 OR (p_team_count % 2) <> 0 THEN
    RAISE EXCEPTION 'p_team_count must be an even integer >= 4 (got %)', p_team_count;
  END IF;

  SELECT id INTO v_season_id
  FROM public.eg_seasons
  WHERE slug = p_season_slug
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Season not found for slug "%"', p_season_slug;
  END IF;

  -- Deterministic randomness if seed provided
  IF p_seed IS NOT NULL THEN
    v_seed := ((abs(p_seed)::numeric % 1000000) / 500000.0) - 1.0;
    PERFORM setseed(v_seed::double precision);
  END IF;

  -- Reset preseason fixtures for that season
  DELETE FROM public.eg_fixtures WHERE season_id = v_season_id;

  -- Pick p_team_count teams (random for now; later we’ll swap this to seed-based)
  SELECT array_agg(x.id ORDER BY x.rnd)
  INTO v_team_ids
  FROM (
    SELECT t.id, random() AS rnd
    FROM public.eg_teams t
    ORDER BY rnd
    LIMIT p_team_count
  ) x;

  IF COALESCE(array_length(v_team_ids, 1), 0) <> p_team_count THEN
    RAISE EXCEPTION 'Not enough teams in eg_teams to generate: needed %, got %',
      p_team_count, COALESCE(array_length(v_team_ids, 1), 0);
  END IF;

  CREATE TEMP TABLE _r1_pairs (a uuid NOT NULL, b uuid NOT NULL, PRIMARY KEY (a,b)) ON COMMIT DROP;
  CREATE TEMP TABLE _r2_pairs (a uuid NOT NULL, b uuid NOT NULL, PRIMARY KEY (a,b)) ON COMMIT DROP;

  -- Round 1 (week_index=1)
  i := 1;
  WHILE i <= p_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id, round, week_index, stage_name, stage_index,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id
    ) VALUES (
      v_season_id, 1, 1, 'Round 1', 1,
      true, 'SCHEDULED', NULL, NULL,
      v_team_ids[i], v_team_ids[i+1]
    );

    INSERT INTO _r1_pairs (a,b)
    VALUES (LEAST(v_team_ids[i], v_team_ids[i+1]), GREATEST(v_team_ids[i], v_team_ids[i+1]));

    i := i + 2;
  END LOOP;

  -- Round 2 (week_index=2) - reshuffle to avoid repeats
  FOR v_attempt IN 1..40 LOOP
    TRUNCATE TABLE _r2_pairs;

    SELECT array_agg(u.team_id)
    INTO v_round2_ids
    FROM (
      SELECT team_id FROM unnest(v_team_ids) AS t(team_id)
      ORDER BY random()
    ) u;

    i := 1;
    WHILE i <= p_team_count LOOP
      INSERT INTO _r2_pairs (a,b)
      VALUES (LEAST(v_round2_ids[i], v_round2_ids[i+1]), GREATEST(v_round2_ids[i], v_round2_ids[i+1]));
      i := i + 2;
    END LOOP;

    SELECT COUNT(*) INTO v_conflicts
    FROM _r2_pairs r2
    JOIN _r1_pairs r1 ON r1.a = r2.a AND r1.b = r2.b;

    IF v_conflicts = 0 THEN
      v_round2_ok := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_round2_ok THEN
    -- last resort: accept any pairing
    SELECT array_agg(u.team_id)
    INTO v_round2_ids
    FROM (
      SELECT team_id FROM unnest(v_team_ids) AS t(team_id)
      ORDER BY random()
    ) u;
  END IF;

  i := 1;
  WHILE i <= p_team_count LOOP
    INSERT INTO public.eg_fixtures (
      season_id, round, week_index, stage_name, stage_index,
      is_preseason, status, start_time, venue,
      home_team_id, away_team_id
    ) VALUES (
      v_season_id, 2, 2, 'Round 2', 2,
      true, 'SCHEDULED', NULL, NULL,
      v_round2_ids[i], v_round2_ids[i+1]
    );
    i := i + 2;
  END LOOP;
END;
$$;

-- 3) Rebuild eg_fixture_cards view so frontend always gets slugs/names/logos.
-- Drop + Create avoids the “cannot change name of view column” problem.
DROP VIEW IF EXISTS public.eg_fixture_cards;

CREATE VIEW public.eg_fixture_cards AS
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
  f.created_at
FROM public.eg_fixtures f
LEFT JOIN public.eg_teams ht ON ht.id = f.home_team_id
LEFT JOIN public.eg_teams at ON at.id = f.away_team_id;

COMMIT;

/* After running the script, run this TEST call:
   select public.eg_preseason_reset_and_generate_rounds('preseason', 10);
*/
