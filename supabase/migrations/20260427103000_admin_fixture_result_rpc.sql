begin;

alter table if exists public.eg_fixtures
  add column if not exists quarter_scores_json jsonb default null,
  add column if not exists team_stats_json jsonb default null;

create or replace function public.eg_admin_update_fixture_result(
  p_fixture_id uuid,
  p_home_goals int default null,
  p_home_behinds int default null,
  p_away_goals int default null,
  p_away_behinds int default null,
  p_status text default null,
  p_quarter_scores_json jsonb default null
)
returns public.eg_fixtures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.eg_fixtures;
  v_actor_user_id uuid;
  v_update_home boolean := p_home_goals is not null or p_home_behinds is not null;
  v_update_away boolean := p_away_goals is not null or p_away_behinds is not null;
  v_home_total int := null;
  v_away_total int := null;
begin
  perform public.eg_require_admin();
  v_actor_user_id := auth.uid();

  if v_update_home and (p_home_goals is null or p_home_behinds is null) then
    raise exception 'Home goals and behinds must both be provided when updating fixture scores';
  end if;

  if v_update_away and (p_away_goals is null or p_away_behinds is null) then
    raise exception 'Away goals and behinds must both be provided when updating fixture scores';
  end if;

  if v_update_home then
    v_home_total := greatest(p_home_goals, 0) * 6 + greatest(p_home_behinds, 0);
  end if;

  if v_update_away then
    v_away_total := greatest(p_away_goals, 0) * 6 + greatest(p_away_behinds, 0);
  end if;

  update public.eg_fixtures
     set home_goals = case when v_update_home then greatest(p_home_goals, 0) else home_goals end,
         home_behinds = case when v_update_home then greatest(p_home_behinds, 0) else home_behinds end,
         home_total = case when v_update_home then v_home_total else home_total end,
         away_goals = case when v_update_away then greatest(p_away_goals, 0) else away_goals end,
         away_behinds = case when v_update_away then greatest(p_away_behinds, 0) else away_behinds end,
         away_total = case when v_update_away then v_away_total else away_total end,
         status = coalesce(nullif(trim(p_status), ''), status),
         quarter_scores_json = coalesce(p_quarter_scores_json, quarter_scores_json),
         corrected_at = now()
   where id = p_fixture_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Fixture not found: %', p_fixture_id;
  end if;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Updated fixture result',
    jsonb_build_object(
      'home_goals', case when v_update_home then greatest(p_home_goals, 0) else null end,
      'home_behinds', case when v_update_home then greatest(p_home_behinds, 0) else null end,
      'home_total', case when v_update_home then v_home_total else null end,
      'away_goals', case when v_update_away then greatest(p_away_goals, 0) else null end,
      'away_behinds', case when v_update_away then greatest(p_away_behinds, 0) else null end,
      'away_total', case when v_update_away then v_away_total else null end,
      'status', p_status,
      'quarter_scores_updated', p_quarter_scores_json is not null,
      'actor_user_id', v_actor_user_id
    )
  );

  return v_row;
end;
$$;

create or replace function public.eg_admin_clear_fixture_scores(
  p_fixture_id uuid
)
returns public.eg_fixtures
language plpgsql
security definer
as $$
declare v_row public.eg_fixtures;
begin
  perform public.eg_require_admin();

  update public.eg_fixtures
     set home_total = null,
         away_total = null,
         home_goals = null,
         home_behinds = null,
         away_goals = null,
         away_behinds = null,
         submitted_at = null,
         verified_at = null,
         disputed_at = null,
         corrected_at = null,
         quarter_scores_json = null,
         team_stats_json = null
   where id = p_fixture_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Cleared fixture scores',
    jsonb_build_object('cleared_quarter_scores', true, 'cleared_team_stats', true)
  );

  return v_row;
end $$;

grant execute on function public.eg_admin_update_fixture_result(uuid, int, int, int, int, text, jsonb) to authenticated;
grant execute on function public.eg_admin_clear_fixture_scores(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
