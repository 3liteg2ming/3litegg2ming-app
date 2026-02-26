/**
 * Import AFL 2026 players CSV -> Supabase eg_players
 *
 * Expected CSV columns:
 *  - team_name
 *  - afl_player_id
 *  - player_name
 *  - position
 *  - jumper
 *  - headshot_url
 *
 * Usage:
 *   node scripts/import-players-2026.mjs afl_players_2026_master.csv
 *
 * Env (terminal only):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env vars:");
  console.error("  SUPABASE_URL");
  console.error("  SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/import-players-2026.mjs afl_players_2026_master.csv");
  process.exit(1);
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, "").trim();
}

function teamKeyFromTeamName(teamName) {
  const t = norm(teamName);

  const map = new Map([
    ["adelaide crows", "adelaide"],
    ["brisbane lions", "brisbane"],
    ["carlton blues", "carlton"],
    ["collingwood magpies", "collingwood"],
    ["essendon bombers", "essendon"],
    ["fremantle dockers", "fremantle"],
    ["geelong cats", "geelong"],
    ["gold coast suns", "goldcoast"],
    ["gws giants", "gws"],
    ["hawthorn hawks", "hawthorn"],
    ["melbourne demons", "melbourne"],
    ["north melbourne kangaroos", "northmelbourne"],
    ["port adelaide power", "portadelaide"],
    ["richmond tigers", "richmond"],
    ["st kilda saints", "stkilda"],
    ["sydney swans", "sydney"],
    ["west coast eagles", "westcoast"],
    ["western bulldogs", "westernbulldogs"],
  ]);

  if (map.has(t)) return map.get(t);

  // fallback
  return t
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function loadTeams() {
  // NOTE: removed team_number to avoid your error
  const { data, error } = await supabase
    .from("eg_teams")
    .select("id,name,team_key,slug,short_name")
    .limit(500);

  if (error) throw error;

  const byKey = new Map();
  const bySlug = new Map();
  const byName = new Map();
  const byNameSlug = new Map();

  for (const t of data || []) {
    const key = t.team_key ? norm(t.team_key) : null;
    const slug = t.slug ? norm(t.slug) : null;
    const name = t.name ? norm(t.name) : null;

    if (key) byKey.set(key, t);
    if (slug) bySlug.set(slug, t);
    if (name) byName.set(name, t);
    if (name) byNameSlug.set(slugify(name), t);
  }

  return { byKey, bySlug, byName, byNameSlug };
}

async function main() {
  const csvText = fs.readFileSync(path.resolve(input), "utf8");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors?.length) {
    console.error("CSV parse errors:", parsed.errors);
    process.exit(1);
  }

  const rows = parsed.data;

  const teams = await loadTeams();

  const upserts = [];
  let missingTeamMatch = 0;

  for (const r of rows) {
    const teamName = String(r.team_name || "").trim();
    const teamKeyGuess = teamKeyFromTeamName(teamName);

    const teamRow =
      teams.byKey.get(norm(teamKeyGuess)) ||
      teams.bySlug.get(norm(teamKeyGuess)) ||
      teams.byName.get(norm(teamName)) ||
      teams.byNameSlug.get(slugify(teamName));

    if (!teamRow) missingTeamMatch++;

    const aflPlayerId = Number(r.afl_player_id);
    if (!Number.isFinite(aflPlayerId)) continue;

    const playerName = String(r.player_name || "").trim();
    if (!playerName) continue;

    const position = String(r.position || "").trim() || null;

    const numberRaw = r.jumper ?? r.number ?? "";
    let number = null;
    if (numberRaw !== "" && numberRaw != null) {
      const n = Number(numberRaw);
      if (Number.isFinite(n)) number = n;
    }

    const headshotUrl = String(r.headshot_url || "").trim() || null;

    upserts.push({
      afl_player_id: aflPlayerId,
      name: playerName,
      team_id: teamRow?.id ?? null,
      team_key: teamRow?.team_key ?? teamKeyGuess ?? null,
      team_name: teamRow?.name ?? teamName ?? null,
      position,
      number,
      headshot_url: headshotUrl,
      photo_url: headshotUrl,
    });
  }

  console.log(`Prepared rows: ${upserts.length}`);
  if (missingTeamMatch) {
    console.warn(
      `Warning: ${missingTeamMatch} players could not match a row in eg_teams. (They will still import with team_name/team_key)`
    );
  }

  const batches = chunk(upserts, 500);
  let done = 0;

  for (const b of batches) {
    const { error } = await supabase
      .from("eg_players")
      .upsert(b, { onConflict: "afl_player_id" });

    if (error) throw error;

    done += b.length;
    console.log(`Upserted ${done}/${upserts.length}`);
  }

  console.log("✅ Import complete: eg_players populated.");
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e);
  process.exit(1);
});