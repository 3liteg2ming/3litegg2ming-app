-- Fix: eg_list_current_coaches was reading from public.profiles (legacy)
-- instead of public.eg_profiles (authoritative). Team assignments are written
-- to eg_profiles by the admin panel, so coaches were invisible on fixture cards.

CREATE OR REPLACE FUNCTION public.eg_list_current_coaches()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  psn text,
  team_id uuid,
  team_name text,
  team_logo_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.user_id,
    nullif(btrim(p.display_name), '') AS display_name,
    nullif(btrim(p.psn), '') AS psn,
    p.team_id,
    coalesce(nullif(btrim(t.name), ''), 'Team assigned') AS team_name,
    nullif(btrim(coalesce(t.logo_url, t.logo_path)), '') AS team_logo_url
  FROM public.eg_profiles p
  LEFT JOIN public.eg_teams t ON t.id = p.team_id
  WHERE p.team_id IS NOT NULL
  ORDER BY
    coalesce(nullif(btrim(t.name), ''), 'Team assigned') ASC,
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.psn), ''), 'Coach') ASC;
$$;

GRANT EXECUTE ON FUNCTION public.eg_list_current_coaches() TO authenticated, anon, service_role;

-- Also sync team_id from eg_profiles -> profiles so the legacy table stays consistent
UPDATE public.profiles p
SET
  team_id = ep.team_id,
  display_name = COALESCE(NULLIF(BTRIM(p.display_name), ''), ep.display_name),
  psn = COALESCE(NULLIF(BTRIM(p.psn), ''), ep.psn)
FROM public.eg_profiles ep
WHERE p.user_id = ep.user_id
  AND ep.team_id IS NOT NULL
  AND p.team_id IS DISTINCT FROM ep.team_id;
