-- Repair: backfill NULL team_id on eg_players
-- Enhanced repair migration with AFL player source backfill and fallback team_key derivation.
-- Original direct join repairs kept.
-- Added safe AFL source backfill phase using dynamic SQL to handle optional source tables.
-- Added fallback team_key derivation to handle cases where team_name exists but team_key is NULL.
-- This addresses failures in original migration when both team_key and team_name were NULL.
-- Run in Supabase SQL editor or via migration runner.

BEGIN;

-- ════════════════════════════════════════════════════════
-- Step 1: Resolve team_id via team_key → eg_teams.team_key
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_key IS NOT NULL
  AND lower(replace(p.team_key, '-', '')) = lower(replace(t.team_key, '-', ''));

-- Step 2: Resolve team_id via team_key → eg_teams.slug
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_key IS NOT NULL
  AND lower(replace(p.team_key, '-', '')) = lower(replace(t.slug, '-', ''));

-- Step 3: Resolve team_id via team_name → eg_teams.name (case-insensitive)
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_name IS NOT NULL
  AND lower(trim(p.team_name)) = lower(trim(t.name));

-- Step 4: Resolve team_id via team_name kebab → eg_teams.slug
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_name IS NOT NULL
  AND lower(replace(trim(p.team_name), ' ', '-')) = lower(trim(t.slug));

-- ════════════════════════════════════════════════════════
-- Step 5: Backfill missing team_key/team_name from resolved team_id
-- (for rows that now have team_id but were missing team_key or team_name)
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players p
SET
  team_key  = COALESCE(p.team_key, t.slug),
  team_name = COALESCE(p.team_name, t.name)
FROM public.eg_teams t
WHERE p.team_id = t.id
  AND (p.team_key IS NULL OR p.team_name IS NULL);

-- ════════════════════════════════════════════════════════
-- Step 6: AFL player source backfill phase
-- Why: Original migration can fail when both team_key and team_name are NULL, leaving team_id unresolved.
-- This phase attempts to backfill missing team_key and team_name for NULL-team rows by joining on afl_player_id 
-- to one or more optional AFL player staging/source tables.
-- Uses dynamic SQL with to_regclass to safely skip updates if source tables do not exist.
-- Updates only rows where team_id IS NULL and afl_player_id IS NOT NULL.
-- ════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.afl_players_2026_master') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.eg_players p
      SET
        team_name = COALESCE(p.team_name, s.team_name),
        team_key = COALESCE(
          p.team_key,
          s.team_key,
          lower(replace(s.team_name, ' ', '-'))
        )
      FROM public.afl_players_2026_master s
      WHERE p.team_id IS NULL
        AND p.afl_player_id IS NOT NULL
        AND p.afl_player_id = s.afl_player_id
        AND (p.team_key IS NULL OR p.team_name IS NULL);
    $sql$;
  END IF;

  IF to_regclass('public.afl_players_master') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.eg_players p
      SET
        team_name = COALESCE(p.team_name, s.team_name),
        team_key = COALESCE(
          p.team_key,
          s.team_key,
          lower(replace(s.team_name, ' ', '-'))
        )
      FROM public.afl_players_master s
      WHERE p.team_id IS NULL
        AND p.afl_player_id IS NOT NULL
        AND p.afl_player_id = s.afl_player_id
        AND (p.team_key IS NULL OR p.team_name IS NULL);
    $sql$;
  END IF;

  IF to_regclass('public.afl_players') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.eg_players p
      SET
        team_name = COALESCE(p.team_name, s.team_name),
        team_key = COALESCE(
          p.team_key,
          s.team_key,
          lower(replace(s.team_name, ' ', '-'))
        )
      FROM public.afl_players s
      WHERE p.team_id IS NULL
        AND p.afl_player_id IS NOT NULL
        AND p.afl_player_id = s.afl_player_id
        AND (p.team_key IS NULL OR p.team_name IS NULL);
    $sql$;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════
-- Step 7: Re-run direct team_key/team_name → eg_teams resolution updates
-- to map newly filled values to team_id
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_key IS NOT NULL
  AND lower(replace(p.team_key, '-', '')) = lower(replace(t.team_key, '-', ''));

UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_key IS NOT NULL
  AND lower(replace(p.team_key, '-', '')) = lower(replace(t.slug, '-', ''));

UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_name IS NOT NULL
  AND lower(trim(p.team_name)) = lower(trim(t.name));

UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_name IS NOT NULL
  AND lower(replace(trim(p.team_name), ' ', '-')) = lower(trim(t.slug));

-- ════════════════════════════════════════════════════════
-- Step 8: Final fallback to derive team_key where team_id IS NULL,
-- team_name IS present, and team_key IS NULL
-- This helps final join succeed in Step 9
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players
SET team_key = lower(replace(trim(team_name), ' ', '-'))
WHERE team_id IS NULL
  AND team_name IS NOT NULL
  AND team_key IS NULL;

-- ════════════════════════════════════════════════════════
-- Step 9: Final attempt to resolve team_id via derived team_key → eg_teams.slug
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players p
SET team_id = t.id
FROM public.eg_teams t
WHERE p.team_id IS NULL
  AND p.team_key IS NOT NULL
  AND lower(replace(p.team_key, '-', '')) = lower(replace(t.slug, '-', ''));

-- ════════════════════════════════════════════════════════
-- Step 10: Backfill missing team_key/team_name from resolved team_id
-- (for rows that now have team_id but were missing team_key or team_name)
-- ════════════════════════════════════════════════════════
UPDATE public.eg_players p
SET
  team_key  = COALESCE(p.team_key, t.slug),
  team_name = COALESCE(p.team_name, t.name)
FROM public.eg_teams t
WHERE p.team_id = t.id
  AND (p.team_key IS NULL OR p.team_name IS NULL);

COMMIT;

-- ════════════════════════════════════════════════════════
-- Verification: count remaining NULL team_id, NULL team_key, NULL team_name rows
-- ════════════════════════════════════════════════════════
SELECT
  count(*) FILTER (WHERE team_id IS NULL) AS still_null_team_id,
  count(*) FILTER (WHERE team_key IS NULL) AS still_null_team_key,
  count(*) FILTER (WHERE team_name IS NULL) AS still_null_team_name,
  count(*) FILTER (WHERE team_id IS NOT NULL) AS resolved_team_id,
  count(*) AS total_rows
FROM public.eg_players;
