/**
 * export-season1-player-stats.ts
 *
 * Exports all existing Season 1 (afl26-season-two) player stats to Excel,
 * identifies missing/incomplete fixtures, and generates an OCR recovery plan.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... npm run export:season1-player-stats
 *
 * The script reads .env and .env.local automatically via dotenv.
 * For full table access, set SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY).
 * Falls back to VITE_SUPABASE_ANON_KEY for read-only public tables if no service role is set.
 */

import 'dotenv/config';
import * as dotenvLocal from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// Also load .env.local (dotenv/config only loads .env)
dotenvLocal.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

// ─── Config ──────────────────────────────────────────────────────────────────

const SEASON_SLUG = 'afl26-season-two';
const MIN_ROUND = 1;
const MAX_ROUND = 11;
const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
const EXPORT_FILE = path.join(OUTPUT_DIR, 'season-1-player-stats-export.xlsx');
const OCR_PLAN_FILE = path.join(OUTPUT_DIR, 'missing-player-stats-ocr-plan.xlsx');

// ─── Env ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('');
  console.error('❌  Missing Supabase credentials.');
  console.error('    Set SUPABASE_URL and SUPABASE_SERVICE_ROLE before running.');
  console.error('    Example:');
  console.error('      SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE=<key> npm run export:season1-player-stats');
  console.error('');
  process.exit(1);
}

const usingServiceRole = !!(process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!usingServiceRole) {
  console.warn('⚠️  No service role key found — using anon key. RLS may limit some results.');
  console.warn('    Set SUPABASE_SERVICE_ROLE for complete data access.');
  console.warn('');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SeasonRow = { id: string; name: string | null; slug: string };

type FixtureRow = {
  id: string;
  season_id: string;
  round: number | null;
  status: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_total: number | null;
  away_total: number | null;
  start_time: string | null;
  venue: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  slug: string | null;
};

type PlayerRow = {
  id: string;
  name: string | null;
  full_name: string | null;
  display_name: string | null;
  team_id: string | null;
  afl_player_id: number | null;
};

type StatRow = {
  fixture_id: string;
  player_id: string;
  team_id: string;
  goals: number | null;
  behinds: number | null;
  kicks: number | null;
  handballs: number | null;
  disposals: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
  hitouts: number | null;
  fantasy_points: number | null;
};

type ImageRow = {
  fixture_id: string;
  image_type: string;
  stat_key: string | null;
  storage_bucket: string;
  storage_path: string;
  ocr_status: string | null;
};

type OcrRow = {
  fixture_id: string;
  status: string;
  updated_at: string | null;
};

type FixtureCompleteness = 'complete' | 'incomplete' | 'missing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function teamLabel(t: TeamRow | undefined): string {
  return t?.short_name || t?.name || 'Unknown';
}

function teamSlug(t: TeamRow | undefined): string {
  return t?.slug || '';
}

function playerLabel(p: PlayerRow | undefined): string {
  return p?.display_name || p?.full_name || p?.name || 'Unknown';
}

function matchup(f: FixtureRow, teamsById: Map<string, TeamRow>): string {
  const home = teamLabel(teamsById.get(f.home_team_id || ''));
  const away = teamLabel(teamsById.get(f.away_team_id || ''));
  return `${home} vs ${away}`;
}

function publicUrl(bucket: string, storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

function fixtureCompleteness(rows: StatRow[]): FixtureCompleteness {
  if (!rows.length) return 'missing';
  // Incomplete = rows exist but none have any of the core detail stats
  const hasDetail = rows.some(
    (r) =>
      r.disposals != null ||
      r.kicks != null ||
      r.marks != null ||
      r.tackles != null ||
      r.fantasy_points != null,
  );
  return hasDetail ? 'complete' : 'incomplete';
}

function completenessNotes(
  rows: StatRow[],
  completeness: FixtureCompleteness,
  imageCount: number,
  ocrStatus: string | undefined,
): string {
  if (completeness === 'missing') {
    const parts: string[] = ['No player stats rows found.'];
    if (imageCount > 0) parts.push(`${imageCount} submission image(s) available for OCR.`);
    else parts.push('No submission images found.');
    if (ocrStatus) parts.push(`Last OCR status: ${ocrStatus}.`);
    return parts.join(' ');
  }
  if (completeness === 'incomplete') {
    const goalCount = rows.filter((r) => r.goals != null).length;
    return (
      `${rows.length} player row(s) exist; goals present for ${goalCount} player(s) ` +
      `but disposals/kicks/marks/tackles/fantasy are all null. ` +
      (imageCount > 0 ? `${imageCount} image(s) available for re-OCR.` : 'No images found.')
    );
  }
  return '';
}

function summaryLine(
  playerName: string,
  opponentLabel: string,
  r: StatRow,
): string {
  const parts: string[] = [];
  if (r.disposals != null) parts.push(`${r.disposals} disposals`);
  if (r.tackles != null) parts.push(`${r.tackles} tackles`);
  if (r.marks != null) parts.push(`${r.marks} marks`);
  if (r.kicks != null) parts.push(`${r.kicks} kicks`);
  if (r.handballs != null) parts.push(`${r.handballs} handballs`);
  if (r.goals != null) parts.push(`${r.goals} goals`);
  if (r.fantasy_points != null) parts.push(`${r.fantasy_points} fantasy points`);
  if (!parts.length) return `${playerName} faced ${opponentLabel} (no detailed stats saved).`;
  return `Last time ${playerName} faced ${opponentLabel}, they had ${parts.join(', ')}.`;
}

async function queryWithFallback<T>(
  selectFn: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
  fallbackFn?: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await selectFn();
  if (error) {
    if (fallbackFn && (error.message.includes('column') || error.message.includes('does not exist'))) {
      const fb = await fallbackFn();
      if (fb.error) throw new Error(fb.error.message);
      return (fb.data || []) as T[];
    }
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }
  return (data || []) as T[];
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function headerStyle(sheet: ExcelJS.Worksheet, row: number, colCount: number) {
  const r = sheet.getRow(row);
  for (let c = 1; c <= colCount; c++) {
    const cell = r.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF4A90D9' } },
    };
  }
  r.height = 20;
}

function setColWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function freezeTopRow(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ─── Sheet builders ───────────────────────────────────────────────────────────

function buildSheet1Master(
  wb: ExcelJS.Workbook,
  fixtures: FixtureRow[],
  allStats: StatRow[],
  statsByFixture: Map<string, StatRow[]>,
  teamsById: Map<string, TeamRow>,
  playersById: Map<string, PlayerRow>,
  ocrByFixture: Map<string, string>,
  seasonName: string,
  includeReview: boolean,
  sheetName: string,
) {
  const sheet = wb.addWorksheet(sheetName);
  const cols = [
    'season', 'round', 'fixture_id', 'matchup',
    'team_name', 'team_slug', 'opponent_team_name', 'opponent_team_slug',
    'player_id', 'afl_player_id', 'player_name',
    'goals', 'behinds', 'kicks', 'handballs', 'disposals',
    'marks', 'tackles', 'fantasy_points',
    'source', 'needs_review', 'notes',
  ];

  sheet.addRow(cols);
  headerStyle(sheet, 1, cols.length);
  freezeTopRow(sheet);
  setColWidths(sheet, [
    14, 7, 38, 30,
    18, 16, 20, 18,
    38, 14, 24,
    7, 7, 7, 9, 9,
    7, 7, 13,
    10, 12, 40,
  ]);

  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  for (const stat of allStats) {
    const fixture = fixtureById.get(stat.fixture_id);
    if (!fixture) continue;

    const team = teamsById.get(stat.team_id);
    const player = playersById.get(stat.player_id);
    const isHome = stat.team_id === fixture.home_team_id;
    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
    const opponent = teamsById.get(opponentId || '');

    const needsReview = !team || !player;
    if (includeReview === false && needsReview) continue;

    const source = ocrByFixture.get(stat.fixture_id) === 'succeeded' ? 'ocr' : 'manual';
    const notes = needsReview
      ? [!player ? 'player_id not in eg_players' : '', !team ? 'team_id not in eg_teams' : '']
          .filter(Boolean)
          .join('; ')
      : '';

    sheet.addRow([
      seasonName,
      fixture.round,
      stat.fixture_id,
      matchup(fixture, teamsById),
      teamLabel(team),
      teamSlug(team),
      teamLabel(opponent),
      teamSlug(opponent),
      stat.player_id,
      player?.afl_player_id ?? null,
      playerLabel(player),
      stat.goals,
      stat.behinds,
      stat.kicks,
      stat.handballs,
      stat.disposals,
      stat.marks,
      stat.tackles,
      stat.fantasy_points,
      source,
      needsReview,
      notes,
    ]);
  }

  // Auto-row shading alternating per fixture
  let lastFixture = '';
  let shade = false;
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const fid = String(row.getCell(3).value || '');
    if (fid !== lastFixture) { shade = !shade; lastFixture = fid; }
    if (shade) {
      for (let c = 1; c <= cols.length; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } };
      }
    }
    // Flag review rows
    const reviewCell = row.getCell(cols.indexOf('needs_review') + 1);
    if (reviewCell.value === true) {
      row.getCell(cols.indexOf('player_name') + 1).fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' },
      };
    }
  }

  console.log(`  ✓ ${sheetName}: ${sheet.rowCount - 1} rows`);
}

function buildSheet2Missing(
  wb: ExcelJS.Workbook,
  fixtures: FixtureRow[],
  statsByFixture: Map<string, StatRow[]>,
  teamsById: Map<string, TeamRow>,
  imagesByFixture: Map<string, ImageRow[]>,
  ocrByFixture: Map<string, string>,
) {
  const sheet = wb.addWorksheet('Missing Fixtures');
  const cols = [
    'round', 'fixture_id', 'matchup', 'home_team', 'away_team',
    'status', 'player_stats_count', 'completeness',
    'submission_images', 'ocr_status', 'expected_status', 'notes',
  ];

  sheet.addRow(cols);
  headerStyle(sheet, 1, cols.length);
  freezeTopRow(sheet);
  setColWidths(sheet, [7, 38, 30, 18, 18, 14, 16, 14, 16, 14, 16, 60]);

  let missingCount = 0;
  let incompleteCount = 0;

  for (const f of fixtures) {
    const rows = statsByFixture.get(f.id) || [];
    const completeness = fixtureCompleteness(rows);
    if (completeness === 'complete') continue;

    const images = imagesByFixture.get(f.id) || [];
    const playerStatImages = images.filter((img) => img.image_type === 'player_stat');
    const ocrStatus = ocrByFixture.get(f.id);
    const homeTeam = teamsById.get(f.home_team_id || '');
    const awayTeam = teamsById.get(f.away_team_id || '');

    const expectedStatus =
      f.home_total != null && f.away_total != null
        ? 'FINAL (has score)'
        : f.status === 'FINAL'
          ? 'FINAL'
          : 'NOT FINAL';

    const notes = completenessNotes(rows, completeness, playerStatImages.length, ocrStatus);

    const dataRow = sheet.addRow([
      f.round,
      f.id,
      matchup(f, teamsById),
      teamLabel(homeTeam),
      teamLabel(awayTeam),
      f.status || '',
      rows.length,
      completeness,
      playerStatImages.length,
      ocrStatus || 'none',
      expectedStatus,
      notes,
    ]);

    // Colour by completeness
    const fillColor = completeness === 'missing' ? 'FFFDE8E8' : 'FFFFF8E1';
    for (let c = 1; c <= cols.length; c++) {
      dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    }

    if (completeness === 'missing') missingCount++;
    else incompleteCount++;
  }

  console.log(`  ✓ Missing Fixtures: ${missingCount} missing, ${incompleteCount} incomplete`);
}

function buildSheet3PlayerHistory(
  wb: ExcelJS.Workbook,
  fixtures: FixtureRow[],
  allStats: StatRow[],
  teamsById: Map<string, TeamRow>,
  playersById: Map<string, PlayerRow>,
) {
  const sheet = wb.addWorksheet('Player vs Team History');
  const cols = [
    'player_name', 'player_id',
    'team_name', 'team_slug',
    'opponent_team_name', 'opponent_team_slug',
    'last_played_round', 'fixture_id',
    'goals', 'behinds', 'kicks', 'handballs',
    'disposals', 'marks', 'tackles', 'fantasy_points',
    'summary_line',
  ];

  sheet.addRow(cols);
  headerStyle(sheet, 1, cols.length);
  freezeTopRow(sheet);
  setColWidths(sheet, [
    24, 38,
    18, 16,
    20, 18,
    14, 38,
    7, 7, 7, 9,
    9, 7, 7, 13,
    80,
  ]);

  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  // Sort stats by round so "last played" is the highest round seen
  const sorted = [...allStats].sort((a, b) => {
    const ra = fixtureById.get(a.fixture_id)?.round ?? 0;
    const rb = fixtureById.get(b.fixture_id)?.round ?? 0;
    return ra - rb;
  });

  for (const stat of sorted) {
    const fixture = fixtureById.get(stat.fixture_id);
    if (!fixture) continue;
    const player = playersById.get(stat.player_id);
    const team = teamsById.get(stat.team_id);
    const isHome = stat.team_id === fixture.home_team_id;
    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
    const opponent = teamsById.get(opponentId || '');
    const pName = playerLabel(player);
    const oppLabel = teamLabel(opponent);

    sheet.addRow([
      pName,
      stat.player_id,
      teamLabel(team),
      teamSlug(team),
      oppLabel,
      teamSlug(opponent),
      fixture.round,
      stat.fixture_id,
      stat.goals,
      stat.behinds,
      stat.kicks,
      stat.handballs,
      stat.disposals,
      stat.marks,
      stat.tackles,
      stat.fantasy_points,
      summaryLine(pName, oppLabel, stat),
    ]);
  }

  // Alternate row shading
  for (let i = 2; i <= sheet.rowCount; i++) {
    if (i % 2 === 0) {
      const row = sheet.getRow(i);
      for (let c = 1; c <= cols.length; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } };
      }
    }
  }

  console.log(`  ✓ Player vs Team History: ${sheet.rowCount - 1} rows`);
}

// ─── OCR Plan workbook ────────────────────────────────────────────────────────

async function buildOcrPlan(
  fixtures: FixtureRow[],
  statsByFixture: Map<string, StatRow[]>,
  imagesByFixture: Map<string, ImageRow[]>,
  teamsById: Map<string, TeamRow>,
) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('OCR Recovery Plan');
  const cols = [
    'round', 'fixture_id', 'matchup',
    'completeness', 'player_stats_count',
    'image_type', 'stat_key',
    'storage_bucket', 'storage_path',
    'public_url', 'ocr_status',
  ];

  sheet.addRow(cols);
  headerStyle(sheet, 1, cols.length);
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  setColWidths(sheet, [7, 38, 30, 14, 16, 14, 14, 14, 50, 90, 12]);

  let rowCount = 0;

  for (const f of fixtures) {
    const rows = statsByFixture.get(f.id) || [];
    const completeness = fixtureCompleteness(rows);
    if (completeness === 'complete') continue;

    const images = imagesByFixture.get(f.id) || [];
    const mx = matchup(f, teamsById);

    if (!images.length) {
      // Fixture needs OCR but has no images yet
      sheet.addRow([
        f.round, f.id, mx, completeness, rows.length,
        '—', '—', '—', '—', '—', 'no_images',
      ]);
      rowCount++;
      continue;
    }

    for (const img of images) {
      const url = img.storage_path
        ? publicUrl(img.storage_bucket || 'Assets', img.storage_path)
        : '';
      const dataRow = sheet.addRow([
        f.round, f.id, mx, completeness, rows.length,
        img.image_type, img.stat_key || '',
        img.storage_bucket, img.storage_path,
        url, img.ocr_status || 'pending',
      ]);

      // Highlight player_stat images that still need OCR
      if (img.image_type === 'player_stat' && img.ocr_status !== 'done') {
        for (let c = 1; c <= cols.length; c++) {
          dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0D0' } };
        }
      }
      rowCount++;
    }
  }

  await wb.xlsx.writeFile(OCR_PLAN_FILE);
  console.log(`  ✓ OCR Plan: ${rowCount} image rows → ${OCR_PLAN_FILE}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Season 1 Player Stats Export');
  console.log('  Season slug:', SEASON_SLUG);
  console.log('  Rounds:', MIN_ROUND, '–', MAX_ROUND);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // 1. Season
  const { data: seasonsData, error: seasonsErr } = await supabase
    .from('eg_seasons')
    .select('id, name, slug')
    .eq('slug', SEASON_SLUG)
    .limit(1);
  if (seasonsErr) throw new Error(`Season lookup: ${seasonsErr.message}`);
  const season = ((seasonsData || []) as SeasonRow[])[0];
  if (!season) throw new Error(`Season '${SEASON_SLUG}' not found in eg_seasons.`);
  console.log(`✓ Season: ${season.name || season.slug} [${season.id}]`);

  // 2. Fixtures
  const { data: fixturesData, error: fixturesErr } = await supabase
    .from('eg_fixtures')
    .select('id, season_id, round, status, home_team_id, away_team_id, home_total, away_total, start_time, venue')
    .eq('season_id', season.id)
    .gte('round', MIN_ROUND)
    .lte('round', MAX_ROUND)
    .order('round', { ascending: true })
    .order('start_time', { ascending: true });
  if (fixturesErr) throw new Error(`Fixtures lookup: ${fixturesErr.message}`);
  const fixtures = (fixturesData || []) as FixtureRow[];
  if (!fixtures.length) {
    console.warn(`⚠️  No fixtures found for season '${SEASON_SLUG}' rounds ${MIN_ROUND}–${MAX_ROUND}.`);
    console.warn('    Check that the season slug is correct and the database is populated.');
    process.exit(0);
  }
  console.log(`✓ Fixtures: ${fixtures.length} (rounds ${MIN_ROUND}–${MAX_ROUND})`);

  // 3. Teams
  const { data: teamsData, error: teamsErr } = await supabase
    .from('eg_teams')
    .select('id, name, short_name, slug');
  if (teamsErr) throw new Error(`Teams lookup: ${teamsErr.message}`);
  const teamsById = new Map<string, TeamRow>();
  for (const t of (teamsData || []) as TeamRow[]) teamsById.set(t.id, t);
  console.log(`✓ Teams: ${teamsById.size}`);

  // 4. Players
  const { data: playersData, error: playersErr } = await supabase
    .from('eg_players')
    .select('id, name, full_name, display_name, team_id, afl_player_id');
  if (playersErr) throw new Error(`Players lookup: ${playersErr.message}`);
  const playersById = new Map<string, PlayerRow>();
  for (const p of (playersData || []) as PlayerRow[]) playersById.set(p.id, p);
  console.log(`✓ Players: ${playersById.size}`);

  // 5. Player stats (with goals/behinds fallback if columns don't exist yet)
  const fixtureIds = fixtures.map((f) => f.id);
  const allStats: StatRow[] = [];
  const STAT_COLS_FULL = 'fixture_id,player_id,team_id,goals,behinds,kicks,handballs,disposals,marks,tackles,clearances,hitouts,fantasy_points';
  const STAT_COLS_BASE = 'fixture_id,player_id,team_id,kicks,handballs,disposals,marks,tackles,clearances,fantasy_points';

  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    let rows = await queryWithFallback<StatRow>(
      () => supabase.from('eg_fixture_player_stats').select(STAT_COLS_FULL).in('fixture_id', chunk),
      () => supabase.from('eg_fixture_player_stats').select(STAT_COLS_BASE).in('fixture_id', chunk),
    );
    allStats.push(...rows);
  }
  console.log(`✓ Player stat rows: ${allStats.length}`);

  // 6. OCR queue (latest status per fixture)
  const ocrByFixture = new Map<string, string>();
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    const { data: ocrData } = await supabase
      .from('eg_ocr_queue')
      .select('fixture_id, status, updated_at')
      .in('fixture_id', chunk)
      .order('updated_at', { ascending: false });
    for (const row of (ocrData || []) as OcrRow[]) {
      if (!ocrByFixture.has(row.fixture_id)) ocrByFixture.set(row.fixture_id, row.status);
    }
  }
  console.log(`✓ OCR queue entries: ${ocrByFixture.size} fixtures with OCR history`);

  // 7. Submission images
  const imagesByFixture = new Map<string, ImageRow[]>();
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    const { data: imgData } = await supabase
      .from('eg_fixture_submission_images')
      .select('fixture_id, image_type, stat_key, storage_bucket, storage_path, ocr_status')
      .in('fixture_id', chunk)
      .order('image_type', { ascending: true });
    for (const row of (imgData || []) as ImageRow[]) {
      if (!imagesByFixture.has(row.fixture_id)) imagesByFixture.set(row.fixture_id, []);
      imagesByFixture.get(row.fixture_id)!.push(row);
    }
  }

  // Group stats by fixture
  const statsByFixture = new Map<string, StatRow[]>();
  for (const s of allStats) {
    if (!statsByFixture.has(s.fixture_id)) statsByFixture.set(s.fixture_id, []);
    statsByFixture.get(s.fixture_id)!.push(s);
  }

  // Summary
  let completeCount = 0, incompleteCount = 0, missingCount = 0;
  for (const f of fixtures) {
    const c = fixtureCompleteness(statsByFixture.get(f.id) || []);
    if (c === 'complete') completeCount++;
    else if (c === 'incomplete') incompleteCount++;
    else missingCount++;
  }
  console.log('');
  console.log(`  Complete fixtures:   ${completeCount}`);
  console.log(`  Incomplete fixtures: ${incompleteCount}`);
  console.log(`  Missing fixtures:    ${missingCount}`);
  console.log('');

  // 8. Build main Excel workbook
  console.log('Building Excel workbook…');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elite Gaming App — Season 1 Export';
  wb.created = new Date();

  const seasonName = season.name || season.slug;

  // Sheet 1 — Full Master
  buildSheet1Master(wb, fixtures, allStats, statsByFixture, teamsById, playersById, ocrByFixture, seasonName, true, 'Full Season Master');

  // Sheet 2 — Missing Fixtures
  buildSheet2Missing(wb, fixtures, statsByFixture, teamsById, imagesByFixture, ocrByFixture);

  // Sheet 3 — Player vs Team History
  buildSheet3PlayerHistory(wb, fixtures, allStats, teamsById, playersById);

  // Sheet 4 — Fusion SG Import (review rows excluded)
  buildSheet1Master(wb, fixtures, allStats, statsByFixture, teamsById, playersById, ocrByFixture, seasonName, false, 'Fusion SG Import');

  await wb.xlsx.writeFile(EXPORT_FILE);
  console.log('');
  console.log(`✅  Saved → ${EXPORT_FILE}`);

  // 9. OCR Plan workbook
  console.log('Building OCR plan…');
  await buildOcrPlan(fixtures, statsByFixture, imagesByFixture, teamsById);
  console.log(`✅  Saved → ${OCR_PLAN_FILE}`);
  console.log('');
  console.log('Done.');
}

main().catch((err) => {
  console.error('');
  console.error('❌  Export failed:', err instanceof Error ? err.message : String(err));
  console.error('');
  process.exit(1);
});
