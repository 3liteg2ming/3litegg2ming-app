-- Fixture Player Stats Pack (mandatory screenshots + per-player fixture stats)
-- Adds:
-- 1) eg_fixture_submissions
-- 2) eg_fixture_submission_images
-- 3) eg_fixture_player_stats
-- 4) player matching support on eg_players (name_key + optional afl_player_id)
-- 5) helper RPCs for submission creation + player-stat upsert
-- 6) season aggregate view: eg_player_season_totals_ext

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Updated-at helper trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) eg_fixture_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eg_fixture_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.eg_fixtures(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_team_id uuid NULL REFERENCES public.eg_teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'needs_review', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_eg_fixture_submissions_fixture
  ON public.eg_fixture_submissions (fixture_id);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submissions_submitted_by
  ON public.eg_fixture_submissions (submitted_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submissions_status
  ON public.eg_fixture_submissions (status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_eg_fixture_submissions_updated_at ON public.eg_fixture_submissions;
CREATE TRIGGER trg_eg_fixture_submissions_updated_at
BEFORE UPDATE ON public.eg_fixture_submissions
FOR EACH ROW EXECUTE FUNCTION public.eg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- B) eg_fixture_submission_images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eg_fixture_submission_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.eg_fixture_submissions(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES public.eg_fixtures(id) ON DELETE CASCADE,
  image_type text NOT NULL CHECK (image_type IN ('player_stat', 'team_stats', 'match_summary', 'worm', 'quarter_breakdown')),
  stat_key text NULL CHECK (stat_key IS NULL OR stat_key IN ('clearances', 'tackles', 'disposals', 'marks', 'kicks', 'handballs')),
  page_number int NULL CHECK (page_number IS NULL OR page_number > 0),
  storage_bucket text NOT NULL DEFAULT 'Assets',
  storage_path text NOT NULL,
  mime_type text NULL,
  width int NULL CHECK (width IS NULL OR width > 0),
  height int NULL CHECK (height IS NULL OR height > 0),
  ocr_status text NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'done', 'failed')),
  ocr_confidence numeric NULL CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submission_images_fixture
  ON public.eg_fixture_submission_images (fixture_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submission_images_submission
  ON public.eg_fixture_submission_images (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submission_images_type_stat
  ON public.eg_fixture_submission_images (image_type, stat_key, page_number);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_submission_images_ocr_status
  ON public.eg_fixture_submission_images (ocr_status, created_at DESC);

-- ---------------------------------------------------------------------------
-- C) eg_fixture_player_stats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eg_fixture_player_stats (
  fixture_id uuid NOT NULL REFERENCES public.eg_fixtures(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.eg_players(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES public.eg_teams(id) ON DELETE RESTRICT,
  disposals int NULL CHECK (disposals IS NULL OR disposals >= 0),
  kicks int NULL CHECK (kicks IS NULL OR kicks >= 0),
  handballs int NULL CHECK (handballs IS NULL OR handballs >= 0),
  marks int NULL CHECK (marks IS NULL OR marks >= 0),
  tackles int NULL CHECK (tackles IS NULL OR tackles >= 0),
  clearances int NULL CHECK (clearances IS NULL OR clearances >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_player_stats_fixture_team
  ON public.eg_fixture_player_stats (fixture_id, team_id);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_player_stats_team
  ON public.eg_fixture_player_stats (team_id);

CREATE INDEX IF NOT EXISTS idx_eg_fixture_player_stats_player
  ON public.eg_fixture_player_stats (player_id);

DROP TRIGGER IF EXISTS trg_eg_fixture_player_stats_updated_at ON public.eg_fixture_player_stats;
CREATE TRIGGER trg_eg_fixture_player_stats_updated_at
BEFORE UPDATE ON public.eg_fixture_player_stats
FOR EACH ROW EXECUTE FUNCTION public.eg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- D) eg_players matching support
-- ---------------------------------------------------------------------------
ALTER TABLE public.eg_players ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.eg_players ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.eg_players ADD COLUMN IF NOT EXISTS afl_player_id bigint;
ALTER TABLE public.eg_players ADD COLUMN IF NOT EXISTS name_key text;

UPDATE public.eg_players
SET full_name = COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), full_name)
WHERE full_name IS NULL OR full_name = '';

UPDATE public.eg_players
SET display_name = COALESCE(NULLIF(display_name, ''), NULLIF(full_name, ''), NULLIF(name, ''), display_name)
WHERE display_name IS NULL OR display_name = '';

CREATE OR REPLACE FUNCTION public.eg_normalize_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(COALESCE(p_name, ''), '[^a-z0-9]+', '', 'g'));
$$;

UPDATE public.eg_players
SET name_key = public.eg_normalize_name_key(COALESCE(NULLIF(full_name, ''), NULLIF(name, '')))
WHERE name_key IS NULL OR name_key = '';

CREATE OR REPLACE FUNCTION public.eg_players_sync_name_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
    NEW.full_name := COALESCE(NULLIF(NEW.name, ''), NEW.full_name);
  END IF;

  IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
    NEW.display_name := COALESCE(NULLIF(NEW.full_name, ''), NULLIF(NEW.name, ''), NEW.display_name);
  END IF;

  NEW.name_key := public.eg_normalize_name_key(COALESCE(NULLIF(NEW.full_name, ''), NULLIF(NEW.name, '')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eg_players_sync_name_fields ON public.eg_players;
CREATE TRIGGER trg_eg_players_sync_name_fields
BEFORE INSERT OR UPDATE OF name, full_name, display_name
ON public.eg_players
FOR EACH ROW EXECUTE FUNCTION public.eg_players_sync_name_fields();

-- De-duplicate name_key within team before enforcing uniqueness.
WITH ranked AS (
  SELECT
    id,
    team_id,
    name_key,
    row_number() OVER (PARTITION BY team_id, name_key ORDER BY id) AS rn
  FROM public.eg_players
  WHERE team_id IS NOT NULL
    AND COALESCE(name_key, '') <> ''
)
UPDATE public.eg_players p
SET name_key = p.name_key || '_' || substr(replace(p.id::text, '-', ''), 1, 8)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_eg_players_team_name_key
  ON public.eg_players (team_id, name_key)
  WHERE team_id IS NOT NULL AND COALESCE(name_key, '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_eg_players_afl_player_id
  ON public.eg_players (afl_player_id)
  WHERE afl_player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eg_players_name_key
  ON public.eg_players (name_key);

-- ---------------------------------------------------------------------------
-- E) Season totals view extension
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.eg_player_season_totals_ext AS
SELECT
  f.season_id,
  s.player_id,
  COALESCE(p.team_id, s.team_id) AS team_id,
  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), NULLIF(p.name, ''), 'Unknown Player') AS player_name,
  COUNT(DISTINCT s.fixture_id) AS matches,
  SUM(COALESCE(s.disposals, 0)) AS disposals,
  SUM(COALESCE(s.kicks, 0)) AS kicks,
  SUM(COALESCE(s.handballs, 0)) AS handballs,
  SUM(COALESCE(s.marks, 0)) AS marks,
  SUM(COALESCE(s.tackles, 0)) AS tackles,
  SUM(COALESCE(s.clearances, 0)) AS clearances
FROM public.eg_fixture_player_stats s
JOIN public.eg_fixtures f ON f.id = s.fixture_id
LEFT JOIN public.eg_players p ON p.id = s.player_id
GROUP BY
  f.season_id,
  s.player_id,
  COALESCE(p.team_id, s.team_id),
  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), NULLIF(p.name, ''), 'Unknown Player');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.eg_fixture_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eg_fixture_submission_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eg_fixture_player_stats ENABLE ROW LEVEL SECURITY;

-- Submission policies
DROP POLICY IF EXISTS "eg_fixture_submissions_select_authenticated" ON public.eg_fixture_submissions;
CREATE POLICY "eg_fixture_submissions_select_authenticated"
ON public.eg_fixture_submissions
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "eg_fixture_submissions_insert_own" ON public.eg_fixture_submissions;
CREATE POLICY "eg_fixture_submissions_insert_own"
ON public.eg_fixture_submissions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND submitted_by_user_id = auth.uid()
);

DROP POLICY IF EXISTS "eg_fixture_submissions_update_own_or_admin" ON public.eg_fixture_submissions;
CREATE POLICY "eg_fixture_submissions_update_own_or_admin"
ON public.eg_fixture_submissions
FOR UPDATE
USING (
  submitted_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.is_admin, false) = true
  )
)
WITH CHECK (
  submitted_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.is_admin, false) = true
  )
);

-- Submission image policies
DROP POLICY IF EXISTS "eg_fixture_submission_images_select_authenticated" ON public.eg_fixture_submission_images;
CREATE POLICY "eg_fixture_submission_images_select_authenticated"
ON public.eg_fixture_submission_images
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "eg_fixture_submission_images_insert_owner_or_admin" ON public.eg_fixture_submission_images;
CREATE POLICY "eg_fixture_submission_images_insert_owner_or_admin"
ON public.eg_fixture_submission_images
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.eg_fixture_submissions s
    WHERE s.id = submission_id
      AND s.fixture_id = fixture_id
      AND (
        s.submitted_by_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND COALESCE(p.is_admin, false) = true
        )
      )
  )
);

DROP POLICY IF EXISTS "eg_fixture_submission_images_update_owner_or_admin" ON public.eg_fixture_submission_images;
CREATE POLICY "eg_fixture_submission_images_update_owner_or_admin"
ON public.eg_fixture_submission_images
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.eg_fixture_submissions s
    WHERE s.id = submission_id
      AND (
        s.submitted_by_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND COALESCE(p.is_admin, false) = true
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.eg_fixture_submissions s
    WHERE s.id = submission_id
      AND (
        s.submitted_by_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND COALESCE(p.is_admin, false) = true
        )
      )
  )
);

-- Player stats policies (writes only via RPC)
DROP POLICY IF EXISTS "eg_fixture_player_stats_select_authenticated" ON public.eg_fixture_player_stats;
CREATE POLICY "eg_fixture_player_stats_select_authenticated"
ON public.eg_fixture_player_stats
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "eg_fixture_player_stats_insert_via_rpc" ON public.eg_fixture_player_stats;
CREATE POLICY "eg_fixture_player_stats_insert_via_rpc"
ON public.eg_fixture_player_stats
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "eg_fixture_player_stats_update_via_rpc" ON public.eg_fixture_player_stats;
CREATE POLICY "eg_fixture_player_stats_update_via_rpc"
ON public.eg_fixture_player_stats
FOR UPDATE
USING (false)
WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- RPC helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eg_create_fixture_submission(
  p_fixture_id uuid,
  p_submitted_team_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing_id uuid;
  v_existing_owner uuid;
  v_is_admin boolean;
  v_new_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'fixture_id is required';
  END IF;

  SELECT id, submitted_by_user_id
  INTO v_existing_id, v_existing_owner
  FROM public.eg_fixture_submissions
  WHERE fixture_id = p_fixture_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT COALESCE(is_admin, false)
    INTO v_is_admin
    FROM public.profiles
    WHERE user_id = v_uid
    LIMIT 1;

    IF v_existing_owner <> v_uid AND COALESCE(v_is_admin, false) = false THEN
      RAISE EXCEPTION 'Submission already exists for this fixture';
    END IF;

    UPDATE public.eg_fixture_submissions
    SET
      submitted_team_id = COALESCE(p_submitted_team_id, submitted_team_id),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE id = v_existing_id;

    RETURN v_existing_id;
  END IF;

  INSERT INTO public.eg_fixture_submissions (
    fixture_id,
    submitted_by_user_id,
    submitted_team_id,
    status,
    notes
  )
  VALUES (
    p_fixture_id,
    v_uid,
    p_submitted_team_id,
    'draft',
    p_notes
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eg_upsert_fixture_player_stats(
  p_fixture_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_can_write boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'fixture_id is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.eg_fixture_submissions s
    WHERE s.fixture_id = p_fixture_id
      AND (
        s.submitted_by_user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.user_id = v_uid
            AND COALESCE(p.is_admin, false) = true
        )
      )
  ) INTO v_can_write;

  IF COALESCE(v_can_write, false) = false THEN
    RAISE EXCEPTION 'No editable submission found for this fixture';
  END IF;

  INSERT INTO public.eg_fixture_player_stats (
    fixture_id,
    player_id,
    team_id,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    clearances
  )
  SELECT
    p_fixture_id,
    NULLIF(trim(x->>'player_id'), '')::uuid,
    NULLIF(trim(x->>'team_id'), '')::uuid,
    CASE WHEN COALESCE(x->>'disposals', '') ~ '^\\d+$' THEN (x->>'disposals')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'kicks', '') ~ '^\\d+$' THEN (x->>'kicks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'handballs', '') ~ '^\\d+$' THEN (x->>'handballs')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'marks', '') ~ '^\\d+$' THEN (x->>'marks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'tackles', '') ~ '^\\d+$' THEN (x->>'tackles')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'clearances', '') ~ '^\\d+$' THEN (x->>'clearances')::int ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x
  WHERE COALESCE(trim(x->>'player_id'), '') <> ''
    AND COALESCE(trim(x->>'team_id'), '') <> ''
  ON CONFLICT (fixture_id, player_id)
  DO UPDATE SET
    team_id = EXCLUDED.team_id,
    disposals = EXCLUDED.disposals,
    kicks = EXCLUDED.kicks,
    handballs = EXCLUDED.handballs,
    marks = EXCLUDED.marks,
    tackles = EXCLUDED.tackles,
    clearances = EXCLUDED.clearances,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_create_fixture_submission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eg_upsert_fixture_player_stats(uuid, jsonb) TO authenticated;

COMMIT;
