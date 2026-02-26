/**
 * Import AFL 2026 players CSV -> Supabase eg_players
 * - Maps team_id using eg_teams.name FIRST (since your eg_teams team_key includes mascot)
 * - Also maps by team_key/slug as fallback
 *
 * Expected CSV columns:
 *  - team_name
 *  - afl_player_id
 *  - player_name
 *  - position (optional)
 *  - jumper (optional)
 *  - headshot_url
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

function slugifyKebab(s) {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("eg_teams")
    .select("id,name,team_key,slug,short_name")
    .limit(500);

  if (error) throw error;

  const byName = new Map();
  const byTeamKey = new Map();
  const bySlug = new Map();
  const byNameKebab = new Map();

  for (const t of data || []) {
    if (t.name) byName.set(norm(t.name), t);
    if (t.team_key) byTeamKey.set(norm(t.team_key), t);
    if (t.slug) bySlug.set(norm(t.slug), t);
    if (t.name) byNameKebab.set(slugifyKebab(t.name), t);
  }

  return { byName, byTeamKey, bySlug, byNameKebab };
}

function parseNumber(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    const teamNameRaw = String(r.team_name || "").trim();
    const teamNameNorm = norm(teamNameRaw);

    // Your eg_teams uses the full club name w/ mascot, so match by name first.
    let teamRow =
      teams.byName.get(teamNameNorm) ||
      teams.byNameKebab.get(slugifyKebab(teamNameRaw)) ||
      teams.byTeamKey.get(teamNameNorm) ||
      teams.bySlug.get(teamNameNorm);

    if (!teamRow && teamNameRaw) {
      // If the CSV had shorter team names, try expanding common ones:
      const expansions = new Map([
        ["adelaide", "adelaide crows"],
        ["brisbane", "brisbane lions"],
        ["carlton", "carlton blues"],
        ["collingwood", "collingwood magpies"],
        ["essendon", "essendon bombers"],
        ["fremantle", "fremantle dockers"],
        ["geelong", "geelong cats"],
        ["gold coast", "gold coast suns"],
        ["gws", "gws giants"],
        ["hawthorn", "hawthorn hawks"],
        ["melbourne", "melbourne demons"],
        ["north melbourne", "north melbourne kangaroos"],
        ["port adelaide", "port adelaide power"],
        ["richmond", "richmond tigers"],
        ["st kilda", "st kilda saints"],
        ["sydney", "sydney swans"],
        ["west coast", "west coast eagles"],
        ["western bulldogs", "western bulldogs"],
      ]);

      const expanded = expansions.get(teamNameNorm);
      if (expanded) teamRow = teams.byName.get(expanded);
    }

    if (!teamRow) missingTeamMatch++;

    const aflPlayerId = Number(r.afl_player_id);
    if (!Number.isFinite(aflPlayerId)) continue;

    const playerName = String(r.player_name || "").trim();
    if (!playerName) continue;

    const position = String(r.position || "").trim() || null;
    const number = parseNumber(r.jumper ?? r.number ?? "");

    const headshotUrl = String(r.headshot_url || "").trim() || null;

    // Keep team_key consistent with your eg_teams
    const team_key = teamRow?.team_key ?? (teamNameRaw ? slugifyKebab(teamNameRaw) : null);

    upserts.push({
      afl_player_id: aflPlayerId,
      name: playerName,
      team_id: teamRow?.id ?? null,
      team_key,
      team_name: teamRow?.name ?? teamNameRaw ?? null,
      position,
      number,
      headshot_url: headshotUrl,
      photo_url: headshotUrl,
    });
  }

  console.log(`Prepared rows: ${upserts.length}`);
  if (missingTeamMatch) {
    console.warn(`Warning: ${missingTeamMatch} players could not match eg_teams. They will import with team_id null.`);
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

  console.log("✅ Import complete: eg_players updated.");
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e);
  process.exit(1);
});