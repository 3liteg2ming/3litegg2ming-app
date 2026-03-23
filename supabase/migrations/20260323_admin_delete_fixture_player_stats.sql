BEGIN;

-- Token-gated RPC for deleting all player stats for a fixture.
-- Useful when admin needs to clear and re-import stats.

CREATE OR REPLACE FUNCTION public.eg_admin_delete_fixture_player_stats(
  p_token text,
  p_fixture_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  PERFORM public.eg_assert_admin_session(p_token);

  IF p_fixture_id IS NULL THEN
    RAISE EXCEPTION 'fixture_id is required';
  END IF;

  DELETE FROM public.eg_fixture_player_stats
  WHERE fixture_id = p_fixture_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF to_regclass('public.eg_audit_log') IS NOT NULL THEN
    INSERT INTO public.eg_audit_log (actor_user_id, action, entity_table, entity_id, summary)
    VALUES (
      auth.uid(),
      'DELETE',
      'eg_fixture_player_stats',
      p_fixture_id::text,
      format('Admin deleted all player stats (%s rows) for fixture %s', v_deleted, p_fixture_id)
    );
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_admin_delete_fixture_player_stats(text, uuid) TO anon, authenticated;

COMMIT;
