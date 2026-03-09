-- Preseason fixtures bootstrap + season-slug compatibility
-- Safe to run multiple times.

begin;

insert into public.eg_seasons (slug, name)
values
  ('preseason', 'Knockout Preseason'),
  ('preseason-2026', 'Knockout Preseason 2026')
on conflict (slug) do update
set name = excluded.name;

-- If preseason has no fixtures yet, generate them using existing generator if present.
do $$
declare
  v_preseason_id uuid;
  v_has_preseason_fixtures boolean := false;
  v_team_count int := 10;
begin
  select s.id
  into v_preseason_id
  from public.eg_seasons s
  where s.slug = 'preseason'
  limit 1;

  if v_preseason_id is null then
    raise exception 'Season "preseason" not found after upsert.';
  end if;

  select exists (
    select 1
    from public.eg_fixtures f
    where f.season_id = v_preseason_id
  )
  into v_has_preseason_fixtures;

  if not v_has_preseason_fixtures then
    if to_regprocedure('public.eg_preseason_reset_and_generate_rounds(text,integer)') is not null then
      perform public.eg_preseason_reset_and_generate_rounds('preseason', v_team_count);
    elsif to_regprocedure('public.eg_generate_preseason_two_rounds_then_finals(text,integer,boolean)') is not null then
      perform public.eg_generate_preseason_two_rounds_then_finals('preseason', v_team_count, false);
    else
      -- Last-resort lightweight insert if generator functions are unavailable.
      with ordered_teams as (
        select
          t.id,
          row_number() over (
            order by
              case when t.preseason_seed is null then 1 else 0 end,
              t.preseason_seed asc nulls last,
              lower(t.name) asc,
              t.id
          ) as rn
        from public.eg_teams t
        limit v_team_count
      ),
      round1_pairs as (
        select
          h.id as home_team_id,
          a.id as away_team_id,
          row_number() over () as slot
        from ordered_teams h
        join ordered_teams a
          on h.rn <= v_team_count / 2
         and a.rn = (v_team_count - h.rn + 1)
        where h.rn <= v_team_count / 2
      ),
      round2_pairs as (
        select
          h.id as home_team_id,
          a.id as away_team_id,
          row_number() over () as slot
        from ordered_teams h
        join ordered_teams a
          on h.rn <= v_team_count / 2
         and a.rn = (v_team_count / 2 + h.rn)
        where h.rn <= v_team_count / 2
      )
      insert into public.eg_fixtures (
        season_id,
        round,
        week_index,
        stage_name,
        stage_index,
        bracket_slot,
        is_preseason,
        status,
        start_time,
        venue,
        home_team_id,
        away_team_id
      )
      select
        v_preseason_id,
        1,
        1,
        'Round 1',
        1,
        'R1-M' || r1.slot,
        true,
        'SCHEDULED',
        null,
        'TBC',
        r1.home_team_id,
        r1.away_team_id
      from round1_pairs r1
      union all
      select
        v_preseason_id,
        2,
        2,
        'Round 2',
        2,
        'R2-M' || r2.slot,
        true,
        'SCHEDULED',
        null,
        'TBC',
        r2.home_team_id,
        r2.away_team_id
      from round2_pairs r2;
    end if;
  end if;

  -- Normalize preseason fixture metadata.
  update public.eg_fixtures f
  set
    is_preseason = true,
    round = coalesce(f.round, f.week_index, f.stage_index, 1),
    week_index = coalesce(f.week_index, f.round, f.stage_index, 1),
    stage_index = coalesce(f.stage_index, f.week_index, f.round, 1),
    stage_name = coalesce(nullif(trim(f.stage_name), ''), 'Round ' || coalesce(f.week_index, f.round, 1)::text),
    venue = coalesce(nullif(trim(f.venue), ''), 'TBC'),
    status = upper(coalesce(nullif(trim(f.status), ''), 'SCHEDULED'))
  where f.season_id = v_preseason_id;

  -- Backfill team slugs when missing for preseason fixtures.
  update public.eg_fixtures f
  set home_team_slug = t.slug
  from public.eg_teams t
  where f.season_id = v_preseason_id
    and f.home_team_id = t.id
    and (f.home_team_slug is null or trim(f.home_team_slug) = '');

  update public.eg_fixtures f
  set away_team_slug = t.slug
  from public.eg_teams t
  where f.season_id = v_preseason_id
    and f.away_team_id = t.id
    and (f.away_team_slug is null or trim(f.away_team_slug) = '');

  -- Mirror preseason fixtures into preseason-2026 season if that season exists and is empty.
  if exists (select 1 from public.eg_seasons s where s.slug = 'preseason-2026') then
    perform 1;
    with src as (
      select *
      from public.eg_fixtures f
      where f.season_id = v_preseason_id
    ),
    dst as (
      select s.id as season_id
      from public.eg_seasons s
      where s.slug = 'preseason-2026'
      limit 1
    )
    insert into public.eg_fixtures (
      season_id,
      round,
      week_index,
      stage_name,
      stage_index,
      bracket_slot,
      next_fixture_id,
      is_preseason,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id,
      home_team_slug,
      away_team_slug,
      home_goals,
      home_behinds,
      home_total,
      away_goals,
      away_behinds,
      away_total,
      submitted_by,
      submitted_at
    )
    select
      d.season_id,
      s.round,
      s.week_index,
      s.stage_name,
      s.stage_index,
      s.bracket_slot,
      null,
      true,
      s.status,
      s.start_time,
      s.venue,
      s.home_team_id,
      s.away_team_id,
      s.home_team_slug,
      s.away_team_slug,
      s.home_goals,
      s.home_behinds,
      s.home_total,
      s.away_goals,
      s.away_behinds,
      s.away_total,
      s.submitted_by,
      s.submitted_at
    from src s
    cross join dst d
    where not exists (
      select 1
      from public.eg_fixtures existing
      where existing.season_id = d.season_id
    );
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';
