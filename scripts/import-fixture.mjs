import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-fixture.mjs <path-to-fixture.json>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const raw = fs.readFileSync(path.resolve(file), 'utf8');
const payload = JSON.parse(raw);

const seasonSlug = payload.season_slug;
if (!seasonSlug) throw new Error('fixture json must include season_slug');

const { data: season, error: seasonErr } = await supabase
  .from('eg_seasons')
  .upsert({ slug: seasonSlug, name: payload.season_name ?? seasonSlug }, { onConflict: 'slug' })
  .select('id, slug')
  .single();

if (seasonErr) throw new Error(seasonErr.message);

const rows = [];
for (const r of payload.rounds ?? []) {
  for (const m of r.matches ?? []) {
    rows.push({
      season_id: season.id,
      round: r.round,
      home_team_slug: m.home_team_slug,
      away_team_slug: m.away_team_slug,
      venue: m.venue ?? '',
      start_time: m.start_time ?? null,
      status: m.status ?? 'SCHEDULED',

      home_total: m.home_total ?? null,
      away_total: m.away_total ?? null,
      home_goals: m.home_goals ?? null,
      home_behinds: m.home_behinds ?? null,
      away_goals: m.away_goals ?? null,
      away_behinds: m.away_behinds ?? null,

      home_coach_name: m.home_coach_name ?? null,
      away_coach_name: m.away_coach_name ?? null,
      home_psn: m.home_psn ?? null,
      away_psn: m.away_psn ?? null,
    });
  }
}

if (!rows.length) {
  console.log('No matches found in JSON.');
  process.exit(0);
}

const { error: insertErr } = await supabase.from('eg_fixtures').insert(rows);
if (insertErr) throw new Error(insertErr.message);

console.log(`✅ Imported ${rows.length} matches into season ${seasonSlug}`);
