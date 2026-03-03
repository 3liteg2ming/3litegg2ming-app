-- Compatibility helper:
-- Some parts of the app (and older SQL) may read from public.profiles, while the admin console
-- uses public.eg_profiles. This creates a VIEW named public.profiles when a real table doesn't exist.
--
-- Safe rules:
-- - If a real table named public.profiles exists, do nothing.
-- - If eg_profiles doesn't exist, do nothing.

do $$
begin
  if to_regclass('public.profiles') is null and to_regclass('public.eg_profiles') is not null then
    create view public.profiles as
    select
      user_id,
      display_name,
      psn,
      team_id,
      email,
      created_at,
      updated_at,
      (role in ('admin','super_admin')) as is_admin,
      role,
      is_banned
    from public.eg_profiles;

    comment on view public.profiles is
      'Compatibility view backed by eg_profiles. Do not edit directly.';
  end if;
end $$;
