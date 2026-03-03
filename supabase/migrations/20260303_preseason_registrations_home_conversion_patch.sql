BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.eg_preseason_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_slug text NOT NULL DEFAULT 'preseason',
  pref_team_ids uuid[] NOT NULL DEFAULT '{}',
  pref_team_1 uuid NULL,
  pref_team_2 uuid NULL,
  pref_team_3 uuid NULL,
  pref_team_4 uuid NULL,
  first_name text NULL,
  last_name text NULL,
  psn_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, season_slug)
);

ALTER TABLE public.eg_preseason_registrations
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS season_slug text,
  ADD COLUMN IF NOT EXISTS pref_team_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pref_team_1 uuid NULL,
  ADD COLUMN IF NOT EXISTS pref_team_2 uuid NULL,
  ADD COLUMN IF NOT EXISTS pref_team_3 uuid NULL,
  ADD COLUMN IF NOT EXISTS pref_team_4 uuid NULL,
  ADD COLUMN IF NOT EXISTS first_name text NULL,
  ADD COLUMN IF NOT EXISTS last_name text NULL,
  ADD COLUMN IF NOT EXISTS psn_name text NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'eg_preseason_registrations_user_season_key'
  ) THEN
    ALTER TABLE public.eg_preseason_registrations
      ADD CONSTRAINT eg_preseason_registrations_user_season_key UNIQUE (user_id, season_slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eg_preseason_registrations_user
  ON public.eg_preseason_registrations (user_id);

CREATE INDEX IF NOT EXISTS idx_eg_preseason_registrations_season
  ON public.eg_preseason_registrations (season_slug);

CREATE INDEX IF NOT EXISTS idx_eg_preseason_registrations_pref_ids
  ON public.eg_preseason_registrations USING gin (pref_team_ids);

ALTER TABLE public.eg_profiles
  ADD COLUMN IF NOT EXISTS preseason_registered boolean NOT NULL DEFAULT false;

ALTER TABLE public.eg_preseason_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own preseason registration" ON public.eg_preseason_registrations;
CREATE POLICY "Users can select own preseason registration"
ON public.eg_preseason_registrations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preseason registration" ON public.eg_preseason_registrations;
CREATE POLICY "Users can insert own preseason registration"
ON public.eg_preseason_registrations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preseason registration" ON public.eg_preseason_registrations;
CREATE POLICY "Users can update own preseason registration"
ON public.eg_preseason_registrations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all preseason registrations" ON public.eg_preseason_registrations;
CREATE POLICY "Admins can read all preseason registrations"
ON public.eg_preseason_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.eg_profiles p
    WHERE p.user_id = auth.uid()
      AND (
        COALESCE(p.is_admin, false) = true
        OR LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin', 'superadmin')
      )
  )
);

COMMIT;
