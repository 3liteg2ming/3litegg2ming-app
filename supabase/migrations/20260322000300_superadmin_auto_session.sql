BEGIN;

CREATE OR REPLACE FUNCTION public.eg_admin_superadmin_auto_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT role INTO v_role
  FROM public.eg_profiles
  WHERE user_id = v_uid;

  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  DELETE FROM public.eg_admin_sessions WHERE expires_at <= now();

  v_token := gen_random_uuid()::text || '-' || encode(gen_random_bytes(16), 'hex');
  v_expires_at := now() + interval '4 hours';

  INSERT INTO public.eg_admin_sessions (token, expires_at, created_by)
  VALUES (v_token, v_expires_at, 'superadmin-auto');

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_in', 14400);
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_admin_superadmin_auto_session() TO authenticated;

COMMIT;
