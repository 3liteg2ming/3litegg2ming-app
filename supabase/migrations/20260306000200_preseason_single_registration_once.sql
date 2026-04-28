begin;

-- Enforce one registration per user per season at the database layer (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'eg_preseason_registrations_user_season_once_unique'
  ) then
    alter table public.eg_preseason_registrations
      add constraint eg_preseason_registrations_user_season_once_unique unique (user_id, season_slug);
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
