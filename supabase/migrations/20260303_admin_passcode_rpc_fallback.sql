BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.eg_admin_passcode_config (
  id boolean PRIMARY KEY DEFAULT true,
  passcode_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = true)
);

INSERT INTO public.eg_admin_passcode_config (id, passcode_hash)
VALUES (true, crypt('PendlesEZEMJ', gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.eg_admin_exchange_passcode(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  SELECT passcode_hash INTO v_hash
  FROM public.eg_admin_passcode_config
  WHERE id = true;

  IF COALESCE(trim(v_hash), '') = '' THEN
    RAISE EXCEPTION 'Admin passcode config missing';
  END IF;

  IF COALESCE(trim(p_code), '') = '' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF crypt(p_code, v_hash) <> v_hash THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_token := gen_random_uuid()::text || '-' || encode(gen_random_bytes(16), 'hex');
  v_expires_at := now() + interval '1 hour';

  DELETE FROM public.eg_admin_sessions WHERE expires_at <= now();

  INSERT INTO public.eg_admin_sessions (token, expires_at, created_by)
  VALUES (v_token, v_expires_at, 'rpc-passcode');

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_in', 3600);
END;
$$;

REVOKE ALL ON TABLE public.eg_admin_passcode_config FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_exchange_passcode(text) TO anon, authenticated;

COMMIT;
