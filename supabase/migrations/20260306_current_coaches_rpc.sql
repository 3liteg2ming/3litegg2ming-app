begin;

create or replace function public.eg_list_current_coaches()
returns table(
  user_id uuid,
  display_name text,
  psn text,
  team_id uuid,
  team_name text,
  team_logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    nullif(btrim(p.display_name), '') as display_name,
    nullif(btrim(p.psn), '') as psn,
    p.team_id,
    coalesce(nullif(btrim(t.name), ''), 'Team assigned') as team_name,
    nullif(btrim(t.logo_url), '') as team_logo_url
  from public.profiles p
  left join public.eg_teams t on t.id = p.team_id
  where p.team_id is not null
  order by coalesce(nullif(btrim(t.name), ''), 'Team assigned') asc,
           coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.psn), ''), 'Coach') asc;
$$;

grant execute on function public.eg_list_current_coaches() to authenticated;
grant execute on function public.eg_list_current_coaches() to anon;

commit;

notify pgrst, 'reload schema';
