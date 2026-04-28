BEGIN;

-- Fix: admins were blocked from saving player stats when no submission existed
-- for the fixture. The previous check nested the admin role check inside an
-- EXISTS on eg_fixture_submissions, so zero submissions ⇒ false regardless.
-- Now admins can always write; non-admins still need their own submission.

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

  -- Admins can always write; non-admins need an existing submission they own
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = v_uid
        AND COALESCE(p.is_admin, false) = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.eg_fixture_submissions s
      WHERE s.fixture_id = p_fixture_id
        AND s.submitted_by_user_id = v_uid
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
    CASE WHEN COALESCE(x->>'disposals', '') ~ '^\d+$' THEN (x->>'disposals')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'kicks', '') ~ '^\d+$' THEN (x->>'kicks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'handballs', '') ~ '^\d+$' THEN (x->>'handballs')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'marks', '') ~ '^\d+$' THEN (x->>'marks')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'tackles', '') ~ '^\d+$' THEN (x->>'tackles')::int ELSE NULL END,
    CASE WHEN COALESCE(x->>'clearances', '') ~ '^\d+$' THEN (x->>'clearances')::int ELSE NULL END
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

COMMIT;
