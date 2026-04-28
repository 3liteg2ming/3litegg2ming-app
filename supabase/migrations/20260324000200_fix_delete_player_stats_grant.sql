-- Fix: replace token-based delete with auth-based delete.
-- The original eg_admin_delete_fixture_player_stats depended on
-- eg_assert_admin_session which does not exist in this database.
-- This creates an auth-based version (same pattern as eg_upsert_fixture_player_stats)
-- that checks profiles.is_admin via auth.uid() instead.

BEGIN;

-- Auth-based delete: checks profiles.is_admin, no token required
CREATE OR REPLACE FUNCTION public.eg_delete_fixture_player_stats(
  p_fixture_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_admin boolean;
  v_deleted int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'fixture_id is required';
  END IF;

  SELECT COALESCE(p.is_admin, false)
  INTO v_is_admin
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF COALESCE(v_is_admin, false) = false THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  DELETE FROM public.eg_fixture_player_stats
  WHERE fixture_id = p_fixture_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF to_regclass('public.eg_audit_log') IS NOT NULL THEN
    INSERT INTO public.eg_audit_log (actor_user_id, action, entity_table, entity_id, summary)
    VALUES (
      v_uid,
      'DELETE',
      'eg_fixture_player_stats',
      p_fixture_id::text,
      format('Admin deleted all player stats (%s rows) for fixture %s', v_deleted, p_fixture_id)
    );
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_delete_fixture_player_stats(uuid) TO authenticated;

COMMIT;
