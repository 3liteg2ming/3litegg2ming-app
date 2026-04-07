import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const input = process.argv[2] || 'afl_squad_meta_2026.csv';

function text(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function canonicalPosition(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (raw === 'midfielder') return 'MID';
  if (raw === 'ruck') return 'RUC';
  if (raw === 'forward' || raw === 'key forward') return 'FWD';
  if (raw === 'defender' || raw === 'key defender') return 'DEF';
  return null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const csv = fs.readFileSync(path.resolve(input), 'utf8').replace(/^\uFEFF/, '');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(headers.map((header, index) => [header, index]));

  const sourceRows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const aflPlayerId = text(cells[idx.afl_player_id]);
    const teamName = text(cells[idx.team_name]);
    const playerName = text(cells[idx.player_name]);
    const position = canonicalPosition(cells[idx.position]);
    return { aflPlayerId, teamName, playerName, position, nameKey: `${normalizeKey(teamName)}::${normalizeKey(playerName)}` };
  });

  const byId = new Map(sourceRows.filter((row) => row.aflPlayerId && row.position).map((row) => [row.aflPlayerId, row.position]));
  const byName = new Map(sourceRows.filter((row) => row.nameKey && row.position).map((row) => [row.nameKey, row.position]));

  const { data: players, error } = await supabase
    .from('eg_players')
    .select('id,afl_player_id,name,team_name,position')
    .limit(5000);

  if (error) throw error;

  const updates = [];
  let matched = 0;
  let changed = 0;
  let missingSource = 0;
  let unmatched = 0;

  for (const player of players || []) {
    const aflPlayerId = text(player.afl_player_id);
    const lookup = aflPlayerId ? byId.get(aflPlayerId) : byName.get(`${normalizeKey(player.team_name)}::${normalizeKey(player.name)}`);
    if (!lookup) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    if (!lookup) {
      missingSource += 1;
      continue;
    }
    if (text(player.position) !== lookup) {
      changed += 1;
      updates.push({ id: player.id, position: lookup });
    }
  }

  for (const batch of chunk(updates, 500)) {
    const { error: upsertError } = await supabase.from('eg_players').upsert(batch, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  console.log(JSON.stringify({ matched, changed, missingSource, unmatched, updates: updates.length }, null, 2));
}

main().catch((error) => {
  console.error('POSITION SYNC FAILED', error);
  process.exit(1);
});
