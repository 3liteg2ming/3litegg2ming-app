BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'pref_team_ids'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN pref_team_ids uuid[] NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'pref_team_1'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN pref_team_1 uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'pref_team_2'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN pref_team_2 uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'pref_team_3'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN pref_team_3 uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'pref_team_4'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN pref_team_4 uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eg_preseason_registrations'
      AND column_name = 'season_slug'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations ADD COLUMN season_slug text NULL;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_session_ping(p_token text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', public.eg_is_admin_session_valid(trim(COALESCE(p_token, ''))));
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_validate_session(p_token text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', public.eg_is_admin_session_valid(trim(COALESCE(p_token, ''))));
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_list_seasons(p_token text)
RETURNS TABLE (
  id uuid,
  slug text,
  label text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.slug, COALESCE(NULLIF(trim(s.name), ''), s.slug) AS label
  FROM public.eg_seasons s
  WHERE public.eg_is_admin_session_valid(trim(COALESCE(p_token, '')))
  ORDER BY s.slug;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_list_fixtures(
  p_token text,
  p_season_id uuid DEFAULT NULL
)
RETURNS SETOF public.eg_fixture_cards
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM public.eg_fixture_cards f
  WHERE public.eg_is_admin_session_valid(trim(COALESCE(p_token, '')))
    AND (p_season_id IS NULL OR f.season_id = p_season_id)
  ORDER BY f.week_index NULLS LAST, f.round NULLS LAST, f.start_time NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_list_profiles(p_token text)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  psn text,
  team_id uuid,
  role text,
  is_admin boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name, p.psn, p.team_id, p.role, p.is_admin
  FROM public.eg_profiles p
  WHERE public.eg_is_admin_session_valid(trim(COALESCE(p_token, '')))
  ORDER BY p.display_name NULLS LAST, p.user_id;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_list_preseason_registrations(p_token text)
RETURNS SETOF public.eg_preseason_registrations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.eg_preseason_registrations r
  WHERE public.eg_is_admin_session_valid(trim(COALESCE(p_token, '')))
  ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.eg_admin_update_preseason_registration(
  p_token text,
  p_user_id uuid,
  p_action text,
  p_team_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.eg_admin_update_registration(
    p_token => trim(COALESCE(p_token, '')),
    p_user_id => p_user_id,
    p_action => p_action,
    p_team_id => p_team_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.eg_admin_session_ping(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_validate_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_list_seasons(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_list_fixtures(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_list_profiles(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_list_preseason_registrations(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eg_admin_update_preseason_registration(text, uuid, text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
