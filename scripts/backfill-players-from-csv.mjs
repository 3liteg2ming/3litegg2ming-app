import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/backfill-players-from-csv.mjs afl_players_2026_master.csv");
  process.exit(1);
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function teamSlugFromName(teamName) {
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
  return t.replace(/[^a-z0-9]+/g, "");
}

function parseNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const csvText = fs.readFileSync(path.resolve(input), "utf8");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors?.length) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    process.exit(1);
  }

  const rows = parsed.data;

  const payload = [];
  for (const r of rows) {
    const aflPlayerId = Number(r.afl_player_id);
    if (!Number.isFinite(aflPlayerId)) continue;

    const teamName = String(r.team_name || "").trim();
    const teamKey = teamSlugFromName(teamName);

    payload.push({
      afl_player_id: aflPlayerId,
      // INCLUDE name so inserts can’t fail
      name: String(r.player_name || "").trim() || "Unknown",
      team_name: teamName || null,
      team_key: teamKey || null,
      position: String(r.position || "").trim() || null,
      number: parseNumber(r.jumper),
      headshot_url: String(r.headshot_url || "").trim() || null,
    });
  }

  console.log("Prepared rows:", payload.length);

  const batches = chunk(payload, 500);
  let done = 0;

  for (const b of batches) {
    const { error } = await supabase
      .from("eg_players")
      .upsert(b, { onConflict: "afl_player_id" });

    if (error) throw error;

    done += b.length;
    console.log(`Upserted ${done}/${payload.length}`);
  }

  // Backfill team_id
  const { data: teams, error: teamErr } = await supabase
    .from("eg_teams")
    .select("id,slug");

  if (teamErr) throw teamErr;

  const bySlug = new Map((teams || []).map((t) => [norm(t.slug), t.id]));

  // Update team_id in batches using update-by-id approach
  const { data: players, error: plErr } = await supabase
    .from("eg_players")
    .select("id,team_key")
    .is("team_id", null)
    .limit(2000);

  if (plErr) throw plErr;

  const toUpdate = [];
  for (const p of players || []) {
    const tid = bySlug.get(norm(p.team_key));
    if (tid) toUpdate.push({ id: p.id, team_id: tid });
  }

  const updBatches = chunk(toUpdate, 500);
  for (const ub of updBatches) {
    // Upsert by primary key id (safe)
    const { error } = await supabase.from("eg_players").upsert(ub, { onConflict: "id" });
    if (error) throw error;
  }

  console.log("✅ Backfill complete (team_name/team_key/position/number/headshot_url + team_id).");
}

main().catch((e) => {
  console.error("BACKFILL FAILED:", e);
  process.exit(1);
});