-- Fix: eg_admin_set_user_role_and_team was silently returning NULL when the
-- target user had no eg_profiles row (UPDATE matched 0 rows, no error raised).
-- The JS client treated null data as success, showed "Profile updated" toast,
-- then reverted the optimistic update on the re-fetch. Now we raise a clear
-- exception and also upsert the row if missing so the change always lands.

CREATE OR REPLACE FUNCTION public.eg_admin_set_user_role_and_team(
  p_user_id uuid,
  p_role public.eg_role,
  p_team_id uuid
)
RETURNS public.eg_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.eg_profiles;
BEGIN
  PERFORM public.eg_require_admin();

  -- Upsert so the row is guaranteed to exist before we update.
  INSERT INTO public.eg_profiles (user_id, role, team_id, updated_at)
  VALUES (p_user_id, p_role, p_team_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET role       = EXCLUDED.role,
        team_id    = EXCLUDED.team_id,
        updated_at = now()
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Profile row not found or could not be created for user %', p_user_id;
  END IF;

  PERFORM public.eg_audit(
    'UPDATE',
    'eg_profiles',
    p_user_id::text,
    'Set user role/team',
    jsonb_build_object('role', p_role, 'team_id', p_team_id)
  );

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.eg_admin_set_user_role_and_team(uuid, public.eg_role, uuid)
  TO authenticated, service_role;
