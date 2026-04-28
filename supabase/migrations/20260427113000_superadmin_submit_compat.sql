begin;

alter table if exists public.eg_fixtures
  add column if not exists quarter_scores_json jsonb default null,
  add column if not exists team_stats_json jsonb default null,
  add column if not exists submitted_at timestamptz null,
  add column if not exists verified_at timestamptz null,
  add column if not exists disputed_at timestamptz null,
  add column if not exists corrected_at timestamptz null;

create or replace function public.eg_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if to_regclass('public.eg_profiles') is not null then
    begin
      execute $sql$
        select exists(
          select 1
          from public.eg_profiles p
          where p.user_id = $1
            and coalesce(p.is_banned, false) = false
            and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin', 'superadmin')
        )
      $sql$
      into v_match
      using v_uid;
    exception when undefined_column then
      v_match := false;
    end;

    if v_match then
      return true;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute $sql$
        select exists(
          select 1
          from public.profiles p
          where coalesce(p.user_id, p.id) = $1
            and coalesce(p.is_banned, false) = false
            and (
              coalesce(p.is_admin, false) = true
              or lower(coalesce(p.role::text, '')) in ('admin', 'super_admin', 'superadmin')
            )
        )
      $sql$
      into v_match
      using v_uid;
    exception when undefined_column then
      begin
        execute $sql$
          select exists(
            select 1
            from public.profiles p
            where p.user_id = $1
              and coalesce(p.is_admin, false) = true
          )
        $sql$
        into v_match
        using v_uid;
      exception when undefined_column then
        v_match := false;
      end;
    end;

    if v_match then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.eg_admin_superadmin_auto_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := null;
  v_token text;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if to_regclass('public.eg_profiles') is not null then
    begin
      execute 'select role::text from public.eg_profiles where user_id = $1 limit 1'
      into v_role
      using v_uid;
    exception when undefined_column then
      v_role := null;
    end;
  end if;

  if lower(coalesce(trim(v_role), '')) not in ('super_admin', 'superadmin')
     and to_regclass('public.profiles') is not null then
    begin
      execute 'select role::text from public.profiles where coalesce(user_id, id) = $1 limit 1'
      into v_role
      using v_uid;
    exception when undefined_column then
      begin
        execute 'select role::text from public.profiles where user_id = $1 limit 1'
        into v_role
        using v_uid;
      exception when undefined_column then
        v_role := null;
      end;
    end;
  end if;

  if lower(coalesce(trim(v_role), '')) not in ('super_admin', 'superadmin') then
    return jsonb_build_object('ok', false, 'reason', 'not_super_admin');
  end if;

  delete from public.eg_admin_sessions where expires_at <= now();

  v_token := gen_random_uuid()::text || '-' || encode(gen_random_bytes(16), 'hex');
  v_expires_at := now() + interval '4 hours';

  insert into public.eg_admin_sessions (token, expires_at, created_by)
  values (v_token, v_expires_at, 'superadmin-auto');

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_in', 14400,
    'expires_at', v_expires_at
  );
end;
$$;

grant execute on function public.eg_admin_superadmin_auto_session() to authenticated;

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

  begin
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
  exception when undefined_function then
    null;
  end;

  return v_row;
end;
$$;

create or replace function public.eg_admin_clear_fixture_scores(
  p_fixture_id uuid
)
returns public.eg_fixtures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.eg_fixtures;
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

  begin
    perform public.eg_audit(
      'UPDATE',
      'eg_fixtures',
      p_fixture_id::text,
      'Cleared fixture scores',
      jsonb_build_object('cleared_quarter_scores', true, 'cleared_team_stats', true)
    );
  exception when undefined_function then
    null;
  end;

  return v_row;
end;
$$;

grant execute on function public.eg_admin_update_fixture_result(uuid, int, int, int, int, text, jsonb) to authenticated;
grant execute on function public.eg_admin_clear_fixture_scores(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
