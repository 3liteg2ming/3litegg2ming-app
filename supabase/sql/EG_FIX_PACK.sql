-- Elite Gaming – Quick Fix Pack
-- Run in Supabase SQL editor (safe to re-run). Review before running.

-- 1) Ensure seasons exist with the slugs the app expects.
insert into public.eg_seasons (slug, name)
values
  ('preseason', 'Knockout Preseason'),
  ('afl26-season-two', 'AFL 26 Season Two')
on conflict (slug) do nothing;

-- 2) Backfill eg_players.team_id (fixes "NULL team" issues across stats, match centre, goal kickers).
-- 2a) Join on team_key -> eg_teams.team_key
update public.eg_players p
set team_id = t.id
from public.eg_teams t
where p.team_id is null
  and p.team_key is not null
  and lower(replace(p.team_key,'-','')) = lower(replace(t.team_key,'-',''));

-- 2b) Join on team_key -> eg_teams.slug
update public.eg_players p
set team_id = t.id
from public.eg_teams t
where p.team_id is null
  and p.team_key is not null
  and lower(replace(p.team_key,'-','')) = lower(replace(t.slug,'-',''));

-- 2c) Join on team_name -> eg_teams.name
update public.eg_players p
set team_id = t.id
from public.eg_teams t
where p.team_id is null
  and p.team_name is not null
  and lower(trim(p.team_name)) = lower(trim(t.name));

-- 2d) Join on team_name kebab -> eg_teams.slug
update public.eg_players p
set team_id = t.id
from public.eg_teams t
where p.team_id is null
  and p.team_name is not null
  and lower(replace(trim(p.team_name),' ','-')) = lower(trim(t.slug));

-- 3) Optional: enforce unique afl_player_id for upserts.
-- uncomment if you use afl_player_id and want safe re-imports.
-- alter table public.eg_players add constraint if not exists eg_players_afl_player_id_key unique (afl_player_id);
