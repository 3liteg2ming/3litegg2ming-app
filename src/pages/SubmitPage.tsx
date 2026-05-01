import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Shield,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { updateFixtureScores } from '@/lib/adminApi';
import { requireSupabaseClient } from '../lib/supabaseClient';
import { fetchCoachProfile, updateCoachProfile } from '../lib/profileRepo';
import { TEAM_COLORS, TEAM_SHORT_NAMES } from '../data/teamColors';
import { invalidateAfl26Cache } from '../data/afl26Supabase';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { fetchSeasonFixturesBySeasonId, invalidateFixturesCache, type FixtureRow } from '../lib/fixturesRepo';
import { invalidateLadderCache } from '../lib/ladderRepo';
import { resolveSeasonId as resolveAppSeasonId } from '../lib/seasonResolver';
import { clearStatsCategoriesCache } from '../lib/statsRepo';
import { clearStatLeadersCache } from '../lib/stats-leaders-cache';
import { resolveTeamLogoUrl } from '@/lib/entityResolvers';
import { GoalKickerPicker } from '../components/submit/GoalKickerPicker';
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { FIXTURES_UNLOCK_LABEL, useFixtureVisibility } from '../lib/fixtureVisibility';
import {
  SUBMISSION_CLOSED_LABEL,
  SUBMISSION_DEADLINE_LABEL,
  SUBMISSION_DEADLINE_MS,
  useDeadlineCountdown,
} from '../hooks/useDeadlineCountdown';
import { getVisibleRounds } from '../lib/visibleRounds';
import {
  countPopulatedPlayerStatFields,
  mergeExtractedPlayerStats,
  normalisePlayerStatRows,
  type ExtractedPlayerStatRow,
} from '../lib/playerStatsExtraction';
import '../styles/submitPage.css';

const supabase = requireSupabaseClient();
const DATA_SYNC_EVENT = 'eg:data-sync';
const STEP_COUNT = 7;
const STEP_LABELS = ['Confirm', 'Score', 'Quarter', 'Stats', 'Kickers', 'Uploads', 'Review'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;
const QUARTER_LABELS: Record<string, string> = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' };
const FINAL_STATUSES = new Set(['FINAL', 'COMPLETED', 'COMPLETE']);

type NextFixturePayload = {
  fixture: {
    id: string;
    round: number;
    venue: string;
    status: string;
    seasonId?: string;
    startTime?: string;
    isFinals?: boolean;
    stageName?: string;
    bracketSlot?: string;
    allowLateSubmission?: boolean;
    lateSubmissionApprovedAt?: string;
  };
  homeTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
  awayTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
} | null;

type UploadedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  bucket?: string | null;
  path?: string | null;
  publicUrl?: string | null;
  imageType?: string;
  statKey?: string | null;
  pageNumber?: number | null;
  uploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'error';
  extractionStatus?: 'idle' | 'extracting' | 'done' | 'error';
  extractionMessage?: string | null;
  extractedRowCount?: number;
  extractedRows?: ExtractedPlayerStatRow[];
};

type UploadedEvidenceAsset = {
  bucket: string;
  path: string;
  publicUrl: string;
  name: string;
  size: number;
  mimeType: string | null;
  imageType: string;
  statKey: string | null;
  pageNumber: number | null;
};

type GoalKickerEntry = {
  id: string;
  playerId?: string;
  name: string;
  photoUrl?: string;
  goals: number;
};

type SubmitConflict = {
  message: string;
  detail?: string;
};

type QuarterRow = {
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
};

type QuarterScores = Record<(typeof QUARTERS)[number], QuarterRow>;

type ManualTeamStatKey =
  | 'disposals'
  | 'kicks'
  | 'handballs'
  | 'inside50s'
  | 'rebound50s'
  | 'freesFor'
  | 'fiftyMetrePenalties'
  | 'hitOuts'
  | 'clearances'
  | 'contestedPossessions'
  | 'uncontestedPossessions'
  | 'marks'
  | 'contestedMarks'
  | 'interceptMarks'
  | 'tackles'
  | 'spoils'
  | 'freesAgainst';

type ManualTeamStatInputs = Record<ManualTeamStatKey, { home: string; away: string }>;

type AdminTeamOption = {
  id: string;
  name: string;
};

type PlayerScreenshotStatKey =
  | 'goals'
  | 'behinds'
  | 'disposals'
  | 'kicks'
  | 'handballs'
  | 'marks'
  | 'tackles'
  | 'hitouts'
  | 'afl_fantasy';

type ExtractionType = 'final_score' | 'match_stats' | 'key_stats';

const MANUAL_TEAM_STAT_FIELDS: Array<{ key: ManualTeamStatKey; label: string }> = [
  { key: 'disposals', label: 'Disposals' },
  { key: 'kicks', label: 'Kicks' },
  { key: 'handballs', label: 'Handballs' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'marks', label: 'Marks' },
  { key: 'contestedMarks', label: 'Contested Marks' },
  { key: 'interceptMarks', label: 'Intercept Marks' },
  { key: 'spoils', label: 'Spoils' },
  { key: 'inside50s', label: 'Inside 50s' },
  { key: 'rebound50s', label: 'Rebound 50s' },
  { key: 'hitOuts', label: 'Hit Outs' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'contestedPossessions', label: 'Contested Possessions' },
  { key: 'uncontestedPossessions', label: 'Uncontested Possessions' },
  { key: 'freesFor', label: 'Frees For' },
  { key: 'freesAgainst', label: 'Frees Against' },
  { key: 'fiftyMetrePenalties', label: '50m Penalties' },
];

const RESULT_SCREENSHOT_SLOTS = [
  { key: 'score_worm', label: 'Final Score + Worm', imageType: 'match_summary', statKey: null as string | null, page: null as number | null },
  { key: 'team_stats_1', label: 'Team Stats Page 1', imageType: 'team_stats', statKey: null as string | null, page: 1 },
  { key: 'team_stats_2', label: 'Team Stats Page 2', imageType: 'team_stats', statKey: null as string | null, page: 2 },
] as const;

const PLAYER_STAT_KEY_OPTIONS: Array<{ value: PlayerScreenshotStatKey; label: string }> = [
  { value: 'goals', label: 'Goals' },
  { value: 'behinds', label: 'Behinds' },
  { value: 'disposals', label: 'Disposals' },
  { value: 'kicks', label: 'Kicks' },
  { value: 'handballs', label: 'Handballs' },
  { value: 'marks', label: 'Marks' },
  { value: 'tackles', label: 'Tackles' },
  { value: 'hitouts', label: 'Hit Outs' },
  { value: 'afl_fantasy', label: 'AFL Fantasy' },
] as const;

const ADMIN_QUICK_RESULT_PRESETS = {
  homeWin: { homeGoals: '1', homeBehinds: '0', awayGoals: '0', awayBehinds: '1' },
  awayWin: { homeGoals: '0', homeBehinds: '1', awayGoals: '1', awayBehinds: '0' },
  draw: { homeGoals: '1', homeBehinds: '0', awayGoals: '1', awayBehinds: '0' },
} as const;

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeNumericInput(value: string): string {
  return value.replace(/[^\d]/g, '').slice(0, 3);
}

/** Select all text on focus — lets users tap a number field and immediately type to replace */
const selectOnFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select();

function parseStatInput(value: unknown): number | null {
  const cleaned = String(value ?? '').replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function createEmptyQuarterScores(): QuarterScores {
  const empty = (): QuarterRow => ({ homeGoals: '', homeBehinds: '', awayGoals: '', awayBehinds: '' });
  return { q1: empty(), q2: empty(), q3: empty(), q4: empty() };
}

function createEmptyManualTeamStats(): ManualTeamStatInputs {
  const out = {} as ManualTeamStatInputs;
  for (const field of MANUAL_TEAM_STAT_FIELDS) out[field.key] = { home: '', away: '' };
  return out;
}

function hydrateQuarterScores(value: unknown): QuarterScores {
  const next = createEmptyQuarterScores();
  if (!value || typeof value !== 'object') return next;
  for (const q of QUARTERS) {
    const row = (value as any)[q];
    if (row && typeof row === 'object') {
      next[q] = {
        homeGoals: String(row.homeGoals ?? '').replace(/[^\d]/g, ''),
        homeBehinds: String(row.homeBehinds ?? '').replace(/[^\d]/g, ''),
        awayGoals: String(row.awayGoals ?? '').replace(/[^\d]/g, ''),
        awayBehinds: String(row.awayBehinds ?? '').replace(/[^\d]/g, ''),
      };
    }
  }
  return next;
}

function hydrateManualTeamStats(value: unknown): ManualTeamStatInputs {
  const next = createEmptyManualTeamStats();
  if (!value || typeof value !== 'object') return next;
  for (const field of MANUAL_TEAM_STAT_FIELDS) {
    const row = (value as any)[field.key];
    if (row && typeof row === 'object') {
      next[field.key] = {
        home: String(row.home ?? '').replace(/[^\d]/g, ''),
        away: String(row.away ?? '').replace(/[^\d]/g, ''),
      };
    }
  }
  return next;
}

function buildManualTeamStatsPayload(value: ManualTeamStatInputs) {
  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  for (const field of MANUAL_TEAM_STAT_FIELDS) {
    const h = parseStatInput(value[field.key]?.home);
    const a = parseStatInput(value[field.key]?.away);
    if (h !== null) home[field.key] = h;
    if (a !== null) away[field.key] = a;
  }
  return { home, away };
}

function buildQuarterScoresPayload(qs: QuarterScores) {
  return {
    quarterProgression: QUARTERS.map((q) => {
      const hg = safeNum(qs[q].homeGoals);
      const hb = safeNum(qs[q].homeBehinds);
      const ag = safeNum(qs[q].awayGoals);
      const ab = safeNum(qs[q].awayBehinds);
      return {
        q: q.toUpperCase(),
        home: hg * 6 + hb,
        away: ag * 6 + ab,
        homeGoals: hg,
        homeBehinds: hb,
        awayGoals: ag,
        awayBehinds: ab,
      };
    }),
  };
}

function resolveTeamLogo(teamName: string, logo?: string) {
  const fallback = TEAM_COLORS[teamName]?.logo || 'elite-gaming-logo.png';
  return resolveTeamLogoUrl({ logoUrl: logo, name: teamName, fallbackPath: fallback });
}

function formatKickoff(startTime?: string) {
  if (!startTime) return 'TBC';
  const d = new Date(startTime);
  if (!Number.isFinite(d.getTime())) return 'TBC';
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function deriveShortName(name: string, explicit?: string) {
  const short = String(explicit || '').trim();
  if (short) return short;
  const base = String(name || '').trim();
  if (!base) return 'Team';
  const firstWord = base.split(/\s+/)[0] || base;
  return firstWord.length <= 12 ? firstWord : `${firstWord.slice(0, 11)}…`;
}

function hasMeaningfulMeta(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return raw.toLowerCase() !== 'tbc' && raw.toLowerCase() !== 'venue tbc';
}

function isFixtureFinal(status: unknown): boolean {
  return FINAL_STATUSES.has(String(status || '').trim().toUpperCase());
}

function isFinalsFixtureMeta(value: {
  isFinals?: boolean;
  stageName?: string | null;
  bracketSlot?: string | null;
  roundLabel?: string | null;
} | null | undefined) {
  if (!value) return false;
  if (value.isFinals) return true;
  const source = [value.stageName, value.bracketSlot, value.roundLabel].join(' ').toLowerCase();
  return (
    source.includes('qualifying') ||
    source.includes('elimination') ||
    source.includes('semi') ||
    source.includes('prelim') ||
    source.includes('grand') ||
    source.includes('final')
  );
}

function buildPayloadFromFixture(f: FixtureRow): NonNullable<NextFixturePayload> {
  const homeName = String(f.home_team_name || 'unknown');
  const awayName = String(f.away_team_name || 'unknown');
  return {
    fixture: {
      id: String(f.id),
      round: safeNum(f.round),
      venue: String(f.venue || 'TBC'),
      status: String(f.status || 'SCHEDULED'),
      seasonId: f.season_id ? String(f.season_id) : undefined,
      startTime: f.start_time ? String(f.start_time) : undefined,
      isFinals: Boolean(f.is_finals),
      stageName: f.stage_name ? String(f.stage_name) : undefined,
      bracketSlot: f.bracket_slot ? String(f.bracket_slot) : undefined,
      allowLateSubmission: Boolean(f.allow_late_submission),
      lateSubmissionApprovedAt: f.late_submission_approved_at ? String(f.late_submission_approved_at) : undefined,
    },
    homeTeam: {
      id: String(f.home_team_id || ''),
      name: homeName,
      shortName: deriveShortName(homeName, f.home_team_short_name || TEAM_SHORT_NAMES[homeName]),
      logo: resolveTeamLogo(homeName, f.home_team_logo_url || undefined),
      teamKey: f.home_team_key || undefined,
    },
    awayTeam: {
      id: String(f.away_team_id || ''),
      name: awayName,
      shortName: deriveShortName(awayName, f.away_team_short_name || TEAM_SHORT_NAMES[awayName]),
      logo: resolveTeamLogo(awayName, f.away_team_logo_url || undefined),
      teamKey: f.away_team_key || undefined,
    },
  };
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `${file.name} exceeds 15 MB limit.`;
  if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
    return `${file.name} is not a supported image type.`;
  }
  return null;
}

function sanitizeFileName(name: string) {
  return String(name || 'screenshot')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'screenshot.jpg';
}

function buildEvidencePath(fixtureId: string, userId: string, slotKey: string, fileName: string) {
  return `submissions/${fixtureId}/${userId}/${slotKey}-${Date.now()}-${sanitizeFileName(fileName)}`;
}

function inferPlayerStatKey(fileName: string): PlayerScreenshotStatKey | null {
  const normalized = normalizeCompareValue(fileName);
  if (!normalized) return null;
  if (normalized.includes('fantasy') || normalized.includes('afl fantasy') || normalized === 'af') return 'afl_fantasy';
  if (normalized.includes('hit out') || normalized.includes('hitout')) return 'hitouts';
  if (normalized.includes('behind')) return 'behinds';
  if (normalized.includes('goal')) return 'goals';
  if (normalized.includes('disposal')) return 'disposals';
  if (normalized.includes('kick')) return 'kicks';
  if (normalized.includes('handball')) return 'handballs';
  if (normalized.includes('mark')) return 'marks';
  if (normalized.includes('tackle')) return 'tackles';
  return null;
}

function resultExtractionTypeForSlot(slotKey: string): ExtractionType {
  return slotKey === 'score_worm' ? 'final_score' : 'match_stats';
}

function uploadedFileReady(file: UploadedFile | null | undefined) {
  return Boolean(file?.bucket && file?.path && file?.publicUrl && file.uploadStatus === 'uploaded');
}

function playerStatsSavedOnlyGoals(fieldCounts: ReturnType<typeof countPopulatedPlayerStatFields> | {
  goals?: number;
  disposals?: number;
  kicks?: number;
  handballs?: number;
  marks?: number;
  tackles?: number;
  hitouts?: number;
  afl_fantasy?: number;
  fantasyPoints?: number;
  fantasy_points?: number;
}) {
  const detailedCount =
    Number(fieldCounts.disposals || 0) +
    Number(fieldCounts.kicks || 0) +
    Number(fieldCounts.handballs || 0) +
    Number(fieldCounts.marks || 0) +
    Number(fieldCounts.tackles || 0) +
    Number(fieldCounts.hitouts || 0) +
    Number(
      fieldCounts.afl_fantasy ||
        fieldCounts.fantasyPoints ||
        ('fantasy_points' in fieldCounts ? fieldCounts.fantasy_points : 0) ||
        0,
    );
  return Number(fieldCounts.goals || 0) > 0 && detailedCount === 0;
}

function bytesToKb(n: number) {
  return Math.max(1, Math.round((n || 0) / 1024));
}

function formatSubmitError(error: any): SubmitConflict {
  const message = String(error?.message || 'Submit failed.').trim() || 'Submit failed.';
  const details = [error?.details, error?.hint, error?.code ? `Code: ${error.code}` : null]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return details.length ? { message, detail: details.join('\n') } : { message };
}

function shouldTrySuperAdminSubmitFallback(error: unknown): boolean {
  const message = String((error as { message?: string } | null | undefined)?.message || '').toLowerCase();
  return (
    message.includes('admin write access is locked') ||
    message.includes('admin privileges required') ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('undefined function')
  );
}

async function resolveSeasonIdForSlug(slug: string): Promise<string> {
  return resolveAppSeasonId(supabase, slug, { preferFixtureRows: true });
}

function buildDraftKey(userId?: string | null, fixtureId?: string | null) {
  const comp = getStoredCompetitionKey();
  return `eg_submit_draft:${comp}:${userId || 'guest'}:${fixtureId || 'none'}`;
}

function collectAdminTeamOptions(fixtures: FixtureRow[]): AdminTeamOption[] {
  const map = new Map<string, string>();
  for (const fixture of fixtures) {
    const homeId = String(fixture.home_team_id || '').trim();
    const awayId = String(fixture.away_team_id || '').trim();
    const homeName = String(fixture.home_team_name || '').trim();
    const awayName = String(fixture.away_team_name || '').trim();
    if (homeId && homeName && !map.has(homeId)) map.set(homeId, homeName);
    if (awayId && awayName && !map.has(awayId)) map.set(awayId, awayName);
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getCompetitionLabel() {
  const key = getStoredCompetitionKey();
  return key === 'preseason' ? 'Preseason' : 'AFL26';
}

function findCurrentRound(allFixtures: FixtureRow[]): number | null {
  const byRound = new Map<number, FixtureRow[]>();
  for (const fixture of allFixtures) {
    const list = byRound.get(fixture.round) || [];
    list.push(fixture);
    byRound.set(fixture.round, list);
  }
  const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  for (const round of sortedRounds) {
    const roundFixtures = byRound.get(round) || [];
    if (!roundFixtures.every((fixture) => isFixtureFinal(fixture.status))) return round;
  }
  return null;
}

function normalizeCompareValue(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function playerMatchesTeam(player: AflPlayer, team: { id?: string; teamKey?: string; name?: string }) {
  const playerTeamId = String(player.teamId || '').trim();
  const teamId = String(team.id || '').trim();
  if (playerTeamId && teamId && playerTeamId === teamId) return true;

  const playerTeamKey = normalizeCompareValue(player.teamKey);
  const teamKey = normalizeCompareValue(team.teamKey);
  if (playerTeamKey && teamKey && playerTeamKey === teamKey) return true;

  const playerTeamName = normalizeCompareValue(player.teamName);
  const teamName = normalizeCompareValue(team.name);
  if (playerTeamName && teamName && playerTeamName === teamName) return true;

  return false;
}

export default function SubmitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resultFileInputRef = useRef<HTMLInputElement | null>(null);
  const playerFilesInputRef = useRef<HTMLInputElement | null>(null);
  const activeResultSlotRef = useRef<string | null>(null);
  const activeCompetitionKey = getStoredCompetitionKey();
  const requestedSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myCoachName, setMyCoachName] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [eligibleFixtures, setEligibleFixtures] = useState<Array<{ round: number; fixture: FixtureRow }>>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [adminCandidateFixtures, setAdminCandidateFixtures] = useState<Array<{ round: number; fixture: FixtureRow }>>([]);
  const [adminSelectedTeamId, setAdminSelectedTeamId] = useState('');
  const [adminSelectedFixtureId, setAdminSelectedFixtureId] = useState('');

  const [payload, setPayload] = useState<NextFixturePayload>(null);
  const [venue, setVenue] = useState('');

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');
  const [quarterScores, setQuarterScores] = useState<QuarterScores>(() => createEmptyQuarterScores());
  const [manualTeamStats, setManualTeamStats] = useState<ManualTeamStatInputs>(() => createEmptyManualTeamStats());

  const [resultScreenshots, setResultScreenshots] = useState<Record<string, UploadedFile | null>>(() => {
    const out: Record<string, UploadedFile | null> = {};
    for (const slot of RESULT_SCREENSHOT_SLOTS) out[slot.key] = null;
    return out;
  });
  const [playerScreenshotFiles, setPlayerScreenshotFiles] = useState<UploadedFile[]>([]);
  const [allAflPlayers, setAllAflPlayers] = useState<AflPlayer[]>([]);
  const [homeGoalKickers, setHomeGoalKickers] = useState<GoalKickerEntry[]>([]);
  const [awayGoalKickers, setAwayGoalKickers] = useState<GoalKickerEntry[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitStatsWarning, setSubmitStatsWarning] = useState<string | null>(null);
  const [submitSuccessDetail, setSubmitSuccessDetail] = useState(
    'Score, quarter-by-quarter, and team stats are now live across Fixtures, Match Centre, and Ladder.',
  );

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<SubmitConflict | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const fixturesVisible = useFixtureVisibility(myRole);
  const submissionDeadline = useDeadlineCountdown(SUBMISSION_DEADLINE_MS);

  const fixture = payload?.fixture || null;
  const homeTeam = payload?.homeTeam || null;
  const awayTeam = payload?.awayTeam || null;
  const adminTeamOptions = useMemo(
    () => collectAdminTeamOptions(adminCandidateFixtures.map((entry) => entry.fixture)),
    [adminCandidateFixtures],
  );
  const adminFixturesForSelectedTeam = useMemo(() => {
    if (!adminSelectedTeamId) return adminCandidateFixtures;
    return adminCandidateFixtures.filter(({ fixture: candidate }) => (
      String(candidate.home_team_id || '') === adminSelectedTeamId ||
      String(candidate.away_team_id || '') === adminSelectedTeamId
    ));
  }, [adminCandidateFixtures, adminSelectedTeamId]);
  const actingTeamName = useMemo(
    () => adminTeamOptions.find((team) => team.id === adminSelectedTeamId)?.name || 'Selected team',
    [adminSelectedTeamId, adminTeamOptions],
  );
  const adminSelectedSide = useMemo(() => {
    if (!fixture || !adminSelectedTeamId) return '';
    if (homeTeam?.id === adminSelectedTeamId) return 'home team';
    if (awayTeam?.id === adminSelectedTeamId) return 'away team';
    return 'selected team';
  }, [fixture, adminSelectedTeamId, homeTeam?.id, awayTeam?.id]);
  const homeDisplayName = useMemo(() => deriveShortName(homeTeam?.name || '', homeTeam?.shortName), [homeTeam?.name, homeTeam?.shortName]);
  const awayDisplayName = useMemo(() => deriveShortName(awayTeam?.name || '', awayTeam?.shortName), [awayTeam?.name, awayTeam?.shortName]);
  const homeStatsGuideLabel = homeTeam?.name || homeDisplayName || 'home team';
  const awayStatsGuideLabel = awayTeam?.name || awayDisplayName || 'opposition';
  const homeGoalsN = safeNum(homeGoals);
  const homeBehindsN = safeNum(homeBehinds);
  const awayGoalsN = safeNum(awayGoals);
  const awayBehindsN = safeNum(awayBehinds);
  const homeScore = homeGoalsN * 6 + homeBehindsN;
  const awayScore = awayGoalsN * 6 + awayBehindsN;
  const kickoffLabel = useMemo(() => formatKickoff(fixture?.startTime), [fixture?.startTime]);
  const competitionLabel = getCompetitionLabel();
  const lateSubmissionApproved = Boolean(fixture?.allowLateSubmission);
  const finalsSubmissionOpen = isFinalsFixtureMeta({
    isFinals: fixture?.isFinals,
    stageName: fixture?.stageName,
    bracketSlot: fixture?.bracketSlot,
  });
  const requiresAdminApproval = false;

  const mappedPlayers = useMemo(
    () => allAflPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      teamId: player.teamId || '',
      teamName: player.teamName,
      photoUrl: player.headshotUrl,
      seasonGoals: player.goals || 0,
    })),
    [allAflPlayers],
  );

  const homeTeamPlayers = useMemo(
    () => allAflPlayers.filter((player) => playerMatchesTeam(player, { id: homeTeam?.id, teamKey: homeTeam?.teamKey, name: homeTeam?.name })),
    [allAflPlayers, homeTeam?.id, homeTeam?.teamKey, homeTeam?.name],
  );
  const awayTeamPlayers = useMemo(
    () => allAflPlayers.filter((player) => playerMatchesTeam(player, { id: awayTeam?.id, teamKey: awayTeam?.teamKey, name: awayTeam?.name })),
    [allAflPlayers, awayTeam?.id, awayTeam?.teamKey, awayTeam?.name],
  );

  const competitionPlayerCount = homeTeamPlayers.length + awayTeamPlayers.length;
  const extractedPlayerStats = useMemo(
    () =>
      playerScreenshotFiles.reduce<ExtractedPlayerStatRow[]>(
        (rows, file) => mergeExtractedPlayerStats(rows, file.extractedRows || []),
        [],
      ),
    [playerScreenshotFiles],
  );
  const extractedPlayerStatFieldCounts = useMemo(
    () => countPopulatedPlayerStatFields(extractedPlayerStats),
    [extractedPlayerStats],
  );

  const homeGoalKickerTotal = useMemo(() => homeGoalKickers.reduce((sum, kicker) => sum + safeNum(kicker.goals), 0), [homeGoalKickers]);
  const awayGoalKickerTotal = useMemo(() => awayGoalKickers.reduce((sum, kicker) => sum + safeNum(kicker.goals), 0), [awayGoalKickers]);
  const goalKickersValid = useMemo(
    () => homeGoalKickerTotal === homeGoalsN && awayGoalKickerTotal === awayGoalsN,
    [homeGoalKickerTotal, awayGoalKickerTotal, homeGoalsN, awayGoalsN],
  );

  const homeUnassignedGoals = Math.max(0, homeGoalsN - homeGoalKickerTotal);
  const awayUnassignedGoals = Math.max(0, awayGoalsN - awayGoalKickerTotal);

  const homeGoalSummary = useMemo(() => homeGoalKickers.map((k) => `${k.name} ${k.goals}`).join(' • '), [homeGoalKickers]);
  const awayGoalSummary = useMemo(() => awayGoalKickers.map((k) => `${k.name} ${k.goals}`).join(' • '), [awayGoalKickers]);

  const homeTeamColors = useMemo(() => {
    if (!homeTeam?.name) return { r: '0', g: '0', b: '0' };
    const color = TEAM_COLORS[homeTeam.name];
    const match = color?.glow?.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [homeTeam?.name]);

  const awayTeamColors = useMemo(() => {
    if (!awayTeam?.name) return { r: '0', g: '0', b: '0' };
    const color = TEAM_COLORS[awayTeam.name];
    const match = color?.glow?.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [awayTeam?.name]);

  const scoreValid = homeGoals !== '' && homeBehinds !== '' && awayGoals !== '' && awayBehinds !== '';
  const quartersFilled = useMemo(
    () => QUARTERS.every((q) => quarterScores[q].homeGoals !== '' && quarterScores[q].homeBehinds !== '' && quarterScores[q].awayGoals !== '' && quarterScores[q].awayBehinds !== ''),
    [quarterScores],
  );
  const quartersMatchFinal = useMemo(() => {
    if (!scoreValid || !quartersFilled) return true;
    const q4 = quarterScores.q4;
    return safeNum(q4.homeGoals) === homeGoalsN && safeNum(q4.homeBehinds) === homeBehindsN && safeNum(q4.awayGoals) === awayGoalsN && safeNum(q4.awayBehinds) === awayBehindsN;
  }, [scoreValid, quartersFilled, quarterScores, homeGoalsN, homeBehindsN, awayGoalsN, awayBehindsN]);
  const quartersProgressive = useMemo(() => {
    if (!quartersFilled) return true;
    for (let i = 1; i < QUARTERS.length; i += 1) {
      const prev = quarterScores[QUARTERS[i - 1]];
      const curr = quarterScores[QUARTERS[i]];
      if (safeNum(curr.homeGoals) < safeNum(prev.homeGoals)) return false;
      if (safeNum(curr.homeBehinds) < safeNum(prev.homeBehinds)) return false;
      if (safeNum(curr.awayGoals) < safeNum(prev.awayGoals)) return false;
      if (safeNum(curr.awayBehinds) < safeNum(prev.awayBehinds)) return false;
    }
    return true;
  }, [quarterScores, quartersFilled]);
  const quartersValid = quartersFilled && quartersMatchFinal && quartersProgressive;

  const allTeamStatsFilled = useMemo(
    () => MANUAL_TEAM_STAT_FIELDS.every((field) => manualTeamStats[field.key].home !== '' && manualTeamStats[field.key].away !== ''),
    [manualTeamStats],
  );
  const teamStatsFilledCount = useMemo(
    () => MANUAL_TEAM_STAT_FIELDS.filter((field) => manualTeamStats[field.key].home !== '' && manualTeamStats[field.key].away !== '').length,
    [manualTeamStats],
  );

  const resultScreenshotsFilled = useMemo(
    () => RESULT_SCREENSHOT_SLOTS.every((slot) => resultScreenshots[slot.key] !== null),
    [resultScreenshots],
  );
  const resultScreenshotsUploaded = useMemo(
    () => RESULT_SCREENSHOT_SLOTS.every((slot) => uploadedFileReady(resultScreenshots[slot.key])),
    [resultScreenshots],
  );
  const resultScreenshotsCount = useMemo(
    () => RESULT_SCREENSHOT_SLOTS.filter((slot) => resultScreenshots[slot.key] !== null).length,
    [resultScreenshots],
  );
  const playerScreenshotCount = playerScreenshotFiles.length;
  const totalUploadsCount = resultScreenshotsCount + playerScreenshotCount;
  // Allow coaches to submit with only scores (no screenshot requirement)
  const isCoach = myRole === 'coach';
  const playerScreenshotsValid = isCoach ? true : playerScreenshotCount > 0;
  const playerScreenshotsUploaded = useMemo(
    () => playerScreenshotFiles.length > 0 && playerScreenshotFiles.every((file) => uploadedFileReady(file)),
    [playerScreenshotFiles],
  );
  const allScreenshotsValid = isCoach
    ? true
    : (resultScreenshotsFilled && playerScreenshotsValid && resultScreenshotsUploaded && playerScreenshotsUploaded);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (!scoreValid) messages.push('Enter final score for both teams');
    if (!quartersFilled) messages.push('Enter all quarter-by-quarter scores');
    if (quartersFilled && !quartersMatchFinal) messages.push('Q4 scores must match the final score');
    if (quartersFilled && !quartersProgressive) messages.push('Quarter scores must be progressive (each quarter >= previous)');
    if (!allTeamStatsFilled) messages.push('Enter all team stats for both teams');
    if (!goalKickersValid) messages.push('Assign goal kickers (Step 5) so tagged goals match the final score for both teams');
    if (!isCoach && !resultScreenshotsFilled) messages.push(`Upload the 3 required match screenshots (${resultScreenshotsCount} of 3 uploaded)`);
    if (!isCoach && !playerScreenshotsValid) messages.push('Upload all player stats screenshots for all players, including goals, behinds, disposals, kicks, handballs, marks, tackles, hit outs, and AFL Fantasy.');
    if (!isCoach && resultScreenshotsFilled && !resultScreenshotsUploaded) messages.push('Wait for the 3 match screenshots to finish uploading.');
    if (!isCoach && playerScreenshotsValid && !playerScreenshotsUploaded) messages.push('Wait for the player stat screenshots to finish uploading and extraction to start.');
    if (requiresAdminApproval) messages.push(`${SUBMISSION_CLOSED_LABEL} Admin approval must be switched on for this fixture first.`);
    return messages;
  }, [scoreValid, quartersFilled, quartersMatchFinal, quartersProgressive, allTeamStatsFilled, goalKickersValid, resultScreenshotsFilled, resultScreenshotsCount, resultScreenshotsUploaded, playerScreenshotsValid, playerScreenshotsUploaded, requiresAdminApproval, isCoach]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId || isSubmitting) return false;
    if (requiresAdminApproval) return false;
    if (isCoach) {
      // Only require scores for coaches
      return scoreValid;
    }
    return scoreValid && quartersValid && allTeamStatsFilled && goalKickersValid && allScreenshotsValid;
  }, [fixture, myTeamId, isSubmitting, requiresAdminApproval, scoreValid, quartersValid, allTeamStatsFilled, goalKickersValid, allScreenshotsValid, isCoach]);

  const stepComplete = useMemo(
    () => ({
      1: true,
      2: scoreValid,
      3: true,
      4: true,
      5: true,
      6: true,
      7: canSubmit,
    }),
    [scoreValid, canSubmit],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw authErr;
        const uid = authData.session?.user?.id || null;
        const email = authData.session?.user?.email || null;
        if (!uid) throw new Error('You must sign in to submit results.');
        if (!alive) return;
        setSessionUserId(uid);
        setSessionEmail(email);

        const profile = await fetchCoachProfile(uid);
        if (!profile) throw new Error('Profile not found. Contact an admin.');
        if (!profile.team_id) throw new Error('No team is linked to this account. Contact an admin.');
        if (!alive) return;
        setMyTeamId(profile.team_id);
        setMyCoachName(profile.display_name || profile.psn || 'Coach');
        setMyRole(profile.role || null);

        const activeSeasonId = await resolveSeasonIdForSlug(requestedSeasonSlug);
        if (!alive) return;

        const { fixtures: allFixtures } = await fetchSeasonFixturesBySeasonId(activeSeasonId, { limit: 1000, offset: 0 });

        const visibleRounds = getVisibleRounds(allFixtures.map((f) => f.round));
        const sortedVisible = Array.from(new Set(visibleRounds)).sort((a, b) => a - b);

        const teamId = String(profile.team_id || '');
        const eligible: Array<{ round: number; fixture: typeof allFixtures[number] }> = [];

        const fixtureIsEligible = (f: typeof allFixtures[number]) => {
          if (isFixtureFinal(f.status)) return false;
          const isFinalsFixture = isFinalsFixtureMeta({
            isFinals: f.is_finals,
            stageName: f.stage_name,
            bracketSlot: f.bracket_slot,
            roundLabel: f.round_label,
          });
          const homeTeamId = String(f.home_team_id || '');
          const awayTeamId = String(f.away_team_id || '');
          return isFinalsFixture
            ? homeTeamId === teamId
            : homeTeamId === teamId || awayTeamId === teamId;
        };

        const visibleEligible = allFixtures
          .filter((f) => sortedVisible.includes(f.round) && fixtureIsEligible(f))
          .sort((a, b) => {
            const roundDiff = (a.round || 0) - (b.round || 0);
            if (roundDiff !== 0) return roundDiff;
            const stageDiff = (a.stage_index || 0) - (b.stage_index || 0);
            if (stageDiff !== 0) return stageDiff;
            const at = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            const bt = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            return at - bt;
          });

        for (const candidate of visibleEligible) {
          const { data: existingSubs } = await supabase
            .from('submissions')
            .select('id, team_id')
            .eq('fixture_id', candidate.id)
            .limit(1);

          if (existingSubs && existingSubs.length > 0) continue;

          eligible.push({ round: candidate.round, fixture: candidate });
        }

        if (!alive) return;
        setEligibleFixtures(eligible);
        setAdminCandidateFixtures([]);

        if (!eligible.length) {
          const hasAwayFinalOnly = allFixtures.some((f) => {
            const isFinalsFixture = isFinalsFixtureMeta({
              isFinals: f.is_finals,
              stageName: f.stage_name,
              bracketSlot: f.bracket_slot,
              roundLabel: f.round_label,
            });
            return isFinalsFixture && String(f.away_team_id || '') === teamId && String(f.home_team_id || '') !== teamId;
          });
          const allFixturesFinal = sortedVisible.every((round) => {
            const teamFixture = allFixtures.find(
              (f) => {
                if (f.round !== round) return false;
                const isFinalsFixture = isFinalsFixtureMeta({
                  isFinals: f.is_finals,
                  stageName: f.stage_name,
                  bracketSlot: f.bracket_slot,
                  roundLabel: f.round_label,
                });
                const homeTeamId = String(f.home_team_id || '');
                const awayTeamId = String(f.away_team_id || '');
                return isFinalsFixture
                  ? homeTeamId === teamId
                  : homeTeamId === teamId || awayTeamId === teamId;
              },
            );
            return !teamFixture || isFixtureFinal(teamFixture.status);
          });

          setPayload(null);
          if (allFixturesFinal) {
            setLoadError('All your fixtures in the current rounds are already finalised. Nothing to submit.');
          } else if (hasAwayFinalOnly) {
            setLoadError('Your finals fixture is locked to the home coach. Only the home side can submit finals results.');
          } else {
            setLoadError('No eligible fixture found for your team in the current rounds.');
          }
          return;
        }

        const first = eligible[0];
        setSelectedRound(first.round);
        setPayload(buildPayloadFromFixture(first.fixture));
        setVenue(String(first.fixture.venue || ''));
      } catch (error: any) {
        console.error('[Submit] load failed:', error);
        if (alive) setLoadError(error?.message || 'Failed to load submit page.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestedSeasonSlug]);

  const handleRoundChange = (round: number) => {
    const match = eligibleFixtures.find((e) => e.round === round);
    if (!match) return;
    setSelectedRound(round);
    setPayload(buildPayloadFromFixture(match.fixture));
    setVenue(String(match.fixture.venue || ''));
  };

  const handleAdminTeamChange = (teamId: string) => {
    setAdminSelectedTeamId(teamId);
    const nextFixture = adminCandidateFixtures.find(({ fixture: candidate }) => (
      String(candidate.home_team_id || '') === teamId || String(candidate.away_team_id || '') === teamId
    ));
    if (!nextFixture) {
      setAdminSelectedFixtureId('');
      setPayload(null);
      return;
    }
    setAdminSelectedFixtureId(String(nextFixture.fixture.id));
    setPayload(buildPayloadFromFixture(nextFixture.fixture));
    setVenue(String(nextFixture.fixture.venue || ''));
  };

  const handleAdminFixtureChange = (fixtureId: string) => {
    setAdminSelectedFixtureId(fixtureId);
    const nextFixture = adminFixturesForSelectedTeam.find(({ fixture: candidate }) => String(candidate.id) === fixtureId);
    if (!nextFixture) return;
    setPayload(buildPayloadFromFixture(nextFixture.fixture));
    setVenue(String(nextFixture.fixture.venue || ''));
  };

  const applyAdminScorePreset = (preset: (typeof ADMIN_QUICK_RESULT_PRESETS)[keyof typeof ADMIN_QUICK_RESULT_PRESETS]) => {
    setHomeGoals(preset.homeGoals);
    setHomeBehinds(preset.homeBehinds);
    setAwayGoals(preset.awayGoals);
    setAwayBehinds(preset.awayBehinds);
  };

  useEffect(() => {
    let alive = true;
    if (!homeTeam?.name || !awayTeam?.name) return () => { alive = false; };
    fetchAflPlayers({ includeAllTeams: true })
      .then((players) => {
        if (!alive) return;
        setAllAflPlayers(Array.isArray(players) ? players : []);
      })
      .catch(() => {
        if (!alive) return;
        setAllAflPlayers([]);
      });
    return () => {
      alive = false;
    };
  }, [homeTeam?.id, homeTeam?.teamKey, homeTeam?.name, awayTeam?.id, awayTeam?.teamKey, awayTeam?.name]);

  useEffect(() => {
    if (!fixture?.id) return;
    setVenue(fixture.venue || '');
    setHomeGoals('');
    setHomeBehinds('');
    setAwayGoals('');
    setAwayBehinds('');
    setQuarterScores(createEmptyQuarterScores());
    setManualTeamStats(createEmptyManualTeamStats());
    setNotes('');
    setHomeGoalKickers([]);
    setAwayGoalKickers([]);
    setSubmitSuccess(false);
    setSubmitStatsWarning(null);
    setSubmitSuccessDetail('Score, quarter-by-quarter, and team stats are now live across Fixtures, Match Centre, and Ladder.');
    setConflict(null);
    setDraftSavedAt(null);
    setFileError(null);
    setCurrentStep(1);
    Object.values(resultScreenshots).forEach((file) => {
      if (file?.previewUrl) {
        try {
          URL.revokeObjectURL(file.previewUrl);
        } catch {}
      }
    });
    playerScreenshotFiles.forEach((file) => {
      if (file.previewUrl) {
        try {
          URL.revokeObjectURL(file.previewUrl);
        } catch {}
      }
    });
    const empty: Record<string, UploadedFile | null> = {};
    for (const slot of RESULT_SCREENSHOT_SLOTS) empty[slot.key] = null;
    setResultScreenshots(empty);
    setPlayerScreenshotFiles([]);
  }, [fixture?.id]);

  useEffect(() => {
    if (!sessionUserId || !fixture?.id) return;
    const draftKey = buildDraftKey(sessionUserId, fixture.id);
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      setVenue(String(draft.venue || fixture.venue || ''));
      setHomeGoals(String(draft.homeGoals || ''));
      setHomeBehinds(String(draft.homeBehinds || ''));
      setAwayGoals(String(draft.awayGoals || ''));
      setAwayBehinds(String(draft.awayBehinds || ''));
      setQuarterScores(hydrateQuarterScores(draft.quarterScores));
      setManualTeamStats(hydrateManualTeamStats(draft.manualTeamStats));
      setHomeGoalKickers(Array.isArray(draft.homeGoalKickers) ? draft.homeGoalKickers : []);
      setAwayGoalKickers(Array.isArray(draft.awayGoalKickers) ? draft.awayGoalKickers : []);
      setNotes(String(draft.notes || ''));
      setDraftSavedAt(Number(draft.savedAt) || null);
    } catch {}
  }, [sessionUserId, fixture?.id]);

  useEffect(() => {
    if (!sessionUserId || !fixture?.id) return;
    const draftKey = buildDraftKey(sessionUserId, fixture.id);
    const timer = window.setTimeout(() => {
      const draft = {
        venue,
        homeGoals,
        homeBehinds,
        awayGoals,
        awayBehinds,
        quarterScores,
        manualTeamStats,
        homeGoalKickers,
        awayGoalKickers,
        notes,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      setDraftSavedAt(draft.savedAt);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sessionUserId, fixture?.id, venue, homeGoals, homeBehinds, awayGoals, awayBehinds, quarterScores, manualTeamStats, homeGoalKickers, awayGoalKickers, notes]);

  const triggerResultUpload = (slotKey: string) => {
    activeResultSlotRef.current = slotKey;
    setFileError(null);
    resultFileInputRef.current?.click();
  };

  const triggerPlayerUpload = () => {
    setFileError(null);
    playerFilesInputRef.current?.click();
  };

  const updateResultScreenshotState = (slotKey: string, updater: (current: UploadedFile | null) => UploadedFile | null) => {
    setResultScreenshots((prev) => ({
      ...prev,
      [slotKey]: updater(prev[slotKey]),
    }));
  };

  const updatePlayerScreenshotState = (id: string, updater: (current: UploadedFile) => UploadedFile) => {
    setPlayerScreenshotFiles((prev) => prev.map((file) => (file.id === id ? updater(file) : file)));
  };

  const removeUploadedAssetFromStorage = async (file: UploadedFile | null | undefined) => {
    if (!file?.bucket || !file?.path) return;
    try {
      await supabase.storage.from(file.bucket).remove([file.path]);
    } catch {
      // Best effort only.
    }
  };

  const uploadScreenshotAsset = async (args: {
    file: UploadedFile;
    slotKey: string;
    imageType: string;
    statKey: string | null;
    pageNumber: number | null;
  }) => {
    if (!fixture?.id || !sessionUserId) {
      throw new Error('Fixture context is missing for screenshot upload.');
    }

    const path = buildEvidencePath(fixture.id, sessionUserId, args.slotKey, args.file.name);
    const { error } = await supabase.storage.from('Assets').upload(path, args.file.file, {
      upsert: false,
      contentType: args.file.file.type || undefined,
    });
    if (error) {
      throw new Error(error.message || `Failed to upload ${args.file.name}`);
    }

    const publicUrl = supabase.storage.from('Assets').getPublicUrl(path).data.publicUrl;
    return {
      bucket: 'Assets',
      path,
      publicUrl,
      imageType: args.imageType,
      statKey: args.statKey,
      pageNumber: args.pageNumber,
      uploadStatus: 'uploaded' as const,
    };
  };

  const invokeScorecardExtraction = async (args: {
    imageUrl: string;
    extractionType: ExtractionType;
    sectionName: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('extract-scorecard', {
      body: {
        imageUrl: args.imageUrl,
        extractionType: args.extractionType,
      },
    });

    if (error) {
      throw new Error(error.message || `AI extraction failed for ${args.sectionName}`);
    }

    const payload = (data || {}) as Record<string, unknown>;
    if (payload.error) {
      throw new Error(String(payload.error));
    }

    return payload;
  };

  const processResultScreenshot = async (slotKey: string, file: UploadedFile) => {
    const slot = RESULT_SCREENSHOT_SLOTS.find((entry) => entry.key === slotKey);
    if (!slot) return;

    updateResultScreenshotState(slotKey, (current) => (
      current && current.id === file.id
        ? { ...current, uploadStatus: 'uploading', extractionStatus: 'idle', extractionMessage: 'Uploading…' }
        : current
    ));

    try {
      const uploaded = await uploadScreenshotAsset({
        file,
        slotKey,
        imageType: slot.imageType,
        statKey: slot.statKey,
        pageNumber: slot.page,
      });

      updateResultScreenshotState(slotKey, (current) => (
        current && current.id === file.id
          ? { ...current, ...uploaded, extractionStatus: 'extracting', extractionMessage: 'Running AI extraction…' }
          : current
      ));

      const extractionType = resultExtractionTypeForSlot(slotKey);
      const payload = await invokeScorecardExtraction({
        imageUrl: uploaded.publicUrl,
        extractionType,
        sectionName: slot.label,
      });
      const confidence = String(payload.confidence || '').trim().toUpperCase() || 'DONE';

      if (import.meta.env.DEV) {
        console.log(`[AI section: ${slot.label}]`, payload);
      }

      updateResultScreenshotState(slotKey, (current) => (
        current && current.id === file.id
          ? {
              ...current,
              extractionStatus: 'done',
              extractionMessage: `${confidence} confidence`,
            }
          : current
      ));
    } catch (error: any) {
      const message = String(error?.message || `Failed to process ${slot.label}`);
      updateResultScreenshotState(slotKey, (current) => (
        current && current.id === file.id
          ? {
              ...current,
              uploadStatus: current.uploadStatus === 'uploaded' ? current.uploadStatus : 'error',
              extractionStatus: 'error',
              extractionMessage: message,
            }
          : current
      ));
      setFileError(message);
    }
  };

  const processPlayerScreenshot = async (file: UploadedFile) => {
    const statKey = file.statKey || inferPlayerStatKey(file.name);
    const sectionName = statKey || file.name;

    updatePlayerScreenshotState(file.id, (current) => ({
      ...current,
      statKey,
      uploadStatus: 'uploading',
      extractionStatus: 'idle',
      extractionMessage: 'Uploading…',
    }));

    try {
      const uploaded = await uploadScreenshotAsset({
        file,
        slotKey: `player-pack-${file.pageNumber || file.id}`,
        imageType: 'player_stat',
        statKey,
        pageNumber: file.pageNumber || null,
      });

      updatePlayerScreenshotState(file.id, (current) => ({
        ...current,
        ...uploaded,
        statKey,
        extractionStatus: 'extracting',
        extractionMessage: 'Running AI extraction…',
      }));

      const payload = await invokeScorecardExtraction({
        imageUrl: uploaded.publicUrl,
        extractionType: 'key_stats',
        sectionName,
      });
      const extractedRows = normalisePlayerStatRows(payload.player_stats || []);
      const fieldCounts = countPopulatedPlayerStatFields(extractedRows);

      if (import.meta.env.DEV) {
        console.log(`[AI section: ${sectionName}] returned ${extractedRows.length} rows`, {
          disposals: fieldCounts.disposals,
          kicks: fieldCounts.kicks,
          handballs: fieldCounts.handballs,
          marks: fieldCounts.marks,
          tackles: fieldCounts.tackles,
          afl_fantasy: fieldCounts.afl_fantasy,
          fantasyPoints: fieldCounts.fantasyPoints,
        });
      }

      updatePlayerScreenshotState(file.id, (current) => ({
        ...current,
        statKey,
        extractionStatus: 'done',
        extractionMessage: `${String(payload.confidence || 'medium').toUpperCase()} confidence`,
        extractedRowCount: extractedRows.length,
        extractedRows,
      }));
    } catch (error: any) {
      const message = String(error?.message || `Failed to process ${file.name}`);
      updatePlayerScreenshotState(file.id, (current) => ({
        ...current,
        statKey,
        uploadStatus: current.uploadStatus === 'uploaded' ? current.uploadStatus : 'error',
        extractionStatus: 'error',
        extractionMessage: message,
        extractedRowCount: 0,
        extractedRows: [],
      }));
      setFileError(message);
    }
  };

  const onResultFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const slotKey = activeResultSlotRef.current;
    const file = event.target.files?.[0];
    if (!slotKey || !file) return;
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      event.target.value = '';
      return;
    }
    const old = resultScreenshots[slotKey];
    if (old?.previewUrl) {
      try {
        URL.revokeObjectURL(old.previewUrl);
      } catch {}
    }
    void removeUploadedAssetFromStorage(old);
    const nextFile: UploadedFile = {
      id: uuid(),
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      imageType: RESULT_SCREENSHOT_SLOTS.find((slot) => slot.key === slotKey)?.imageType || 'match_summary',
      statKey: RESULT_SCREENSHOT_SLOTS.find((slot) => slot.key === slotKey)?.statKey || null,
      pageNumber: RESULT_SCREENSHOT_SLOTS.find((slot) => slot.key === slotKey)?.page || null,
      uploadStatus: 'pending',
      extractionStatus: 'idle',
      extractionMessage: 'Queued for upload',
      extractedRowCount: 0,
      extractedRows: [],
    };
    setResultScreenshots((prev) => ({
      ...prev,
      [slotKey]: nextFile,
    }));
    window.setTimeout(() => {
      void processResultScreenshot(slotKey, nextFile);
    }, 0);
    setFileError(null);
    activeResultSlotRef.current = null;
    event.target.value = '';
  };

  const onPlayerFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const next: UploadedFile[] = [];
    let firstError: string | null = null;
    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        firstError = firstError || err;
        continue;
      }
      next.push({
        id: uuid(),
        file,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        imageType: 'player_stat',
        statKey: inferPlayerStatKey(file.name),
        pageNumber: playerScreenshotFiles.length + next.length + 1,
        uploadStatus: 'pending',
        extractionStatus: 'idle',
        extractionMessage: 'Queued for upload',
        extractedRowCount: 0,
        extractedRows: [],
      });
    }
    if (next.length) {
      setPlayerScreenshotFiles((prev) => [...prev, ...next]);
      window.setTimeout(() => {
        next.forEach((entry) => {
          void processPlayerScreenshot(entry);
        });
      }, 0);
    }
    if (firstError) setFileError(firstError);
    else setFileError(null);
    event.target.value = '';
  };

  const removeResultScreenshot = (slotKey: string) => {
    const old = resultScreenshots[slotKey];
    void removeUploadedAssetFromStorage(old);
    if (old?.previewUrl) {
      try {
        URL.revokeObjectURL(old.previewUrl);
      } catch {}
    }
    setResultScreenshots((prev) => ({ ...prev, [slotKey]: null }));
  };

  const removePlayerScreenshot = (id: string) => {
    setPlayerScreenshotFiles((prev) => {
      const found = prev.find((file) => file.id === id);
      void removeUploadedAssetFromStorage(found);
      if (found?.previewUrl) {
        try {
          URL.revokeObjectURL(found.previewUrl);
        } catch {}
      }
      return prev.filter((file) => file.id !== id);
    });
  };

  const setPlayerScreenshotStatKey = (id: string, statKey: PlayerScreenshotStatKey | null) => {
    setPlayerScreenshotFiles((prev) => prev.map((file) => (
      file.id === id ? { ...file, statKey } : file
    )));
  };

  const setManualTeamStatValue = (key: ManualTeamStatKey, side: 'home' | 'away', rawValue: string) => {
    const nextValue = rawValue.replace(/[^\d]/g, '').slice(0, 4);
    setManualTeamStats((prev) => ({ ...prev, [key]: { ...prev[key], [side]: nextValue } }));
  };

  const setQuarterValue = (quarter: (typeof QUARTERS)[number], field: keyof QuarterRow, rawValue: string) => {
    setQuarterScores((prev) => ({ ...prev, [quarter]: { ...prev[quarter], [field]: sanitizeNumericInput(rawValue) } }));
  };

  const addGoalKicker = (side: 'home' | 'away', player: { id?: string; name: string; photoUrl?: string }) => {
    const setter = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    const playerId = String(player.id || '').trim() || undefined;
    const nextName = String(player.name || '').trim();
    if (!nextName) return;
    setter((prev) => {
      const existingIndex = prev.findIndex((entry) => (playerId && entry.playerId === playerId) || normalizeCompareValue(entry.name) === normalizeCompareValue(nextName));
      if (existingIndex >= 0) {
        return prev.map((entry, index) => (index === existingIndex ? { ...entry, goals: entry.goals + 1 } : entry));
      }
      return [...prev, { id: uuid(), playerId, name: nextName, photoUrl: player.photoUrl, goals: 1 }];
    });
  };

  const incGoalKicker = (side: 'home' | 'away', kickerId: string) => {
    const setter = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setter((prev) => prev.map((entry) => (entry.id === kickerId ? { ...entry, goals: entry.goals + 1 } : entry)));
  };

  const decGoalKicker = (side: 'home' | 'away', kickerId: string) => {
    const setter = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setter((prev) => prev.flatMap((entry) => {
      if (entry.id !== kickerId) return [entry];
      if (entry.goals <= 1) return [];
      return [{ ...entry, goals: entry.goals - 1 }];
    }));
  };

  const removeGoalKicker = (side: 'home' | 'away', kickerId: string) => {
    const setter = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setter((prev) => prev.filter((entry) => entry.id !== kickerId));
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const goNext = () => { setCurrentStep((step) => Math.min(step + 1, STEP_COUNT)); scrollToTop(); };
  const goBack = () => { setCurrentStep((step) => Math.max(step - 1, 1)); scrollToTop(); };
  const goToStep = (step: number) => { setCurrentStep(step); scrollToTop(); };

  const submitAdminQuickResult = async () => {
    if (!fixture?.id || !adminSelectedTeamId || !scoreValid) return;

    setIsSubmitting(true);
    setConflict(null);
    setSubmitStatsWarning(null);
    setSubmitSuccessDetail('Score is now live across Fixtures, Match Centre, and Ladder.');

    try {
      await updateFixtureScores({
        fixtureId: fixture.id,
        homeGoals: homeGoalsN,
        homeBehinds: homeBehindsN,
        awayGoals: awayGoalsN,
        awayBehinds: awayBehindsN,
        status: 'FINAL',
      });

      const activeSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);
      invalidateAfl26Cache();
      invalidateFixturesCache({ fixtureId: fixture.id, seasonId: fixture.seasonId || null });
      invalidateLadderCache({ seasonSlug: activeSeasonSlug, seasonId: fixture.seasonId || null });
      clearStatsCategoriesCache();
      clearStatLeadersCache();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['fixtures', 'season', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['fixture', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['submissions', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre'] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder'] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DATA_SYNC_EVENT, {
          detail: { fixtureId: fixture.id, seasonId: fixture.seasonId || null, adminQuickSubmit: true },
        }));
      }

      setSubmitSuccess(true);
    } catch (error: any) {
      if (!shouldTrySuperAdminSubmitFallback(error) || !sessionUserId) {
        setConflict(formatSubmitError(error));
        return;
      }

      const originalTeamId = myTeamId;
      let restoreError: unknown = null;
      let fallbackSucceeded = false;

      try {
        if (originalTeamId !== adminSelectedTeamId) {
          await updateCoachProfile(sessionUserId, { team_id: adminSelectedTeamId });
        }

        const fallbackPayload = {
          screenshots: [{ imageType: 'match_summary', note: 'super_admin_manual_submit' }],
          teamStats: {},
          quarterScores: null,
        };

        const { data: fallbackData, error: fallbackError } = await supabase.rpc('eg_submit_result_v2', {
          p_fixture_id: fixture.id,
          p_home_goals: homeGoalsN,
          p_home_behinds: homeBehindsN,
          p_away_goals: awayGoalsN,
          p_away_behinds: awayBehindsN,
          p_venue: venue || null,
          p_goal_kickers_home: [],
          p_goal_kickers_away: [],
          p_ocr: fallbackPayload,
          p_notes: 'Super admin manual result submitted from /submit fallback',
        });

        if (fallbackError) throw fallbackError;

        const activeSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);
        invalidateAfl26Cache();
        invalidateFixturesCache({ fixtureId: fixture.id, seasonId: fixture.seasonId || null });
        invalidateLadderCache({ seasonSlug: activeSeasonSlug, seasonId: fixture.seasonId || null });
        clearStatsCategoriesCache();
        clearStatLeadersCache();

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
          queryClient.invalidateQueries({ queryKey: ['fixtures', 'season', activeSeasonSlug] }),
          queryClient.invalidateQueries({ queryKey: ['fixture', fixture.id] }),
          queryClient.invalidateQueries({ queryKey: ['submissions', fixture.id] }),
          queryClient.invalidateQueries({ queryKey: ['match-centre'] }),
          queryClient.invalidateQueries({ queryKey: ['match-centre', fixture.id] }),
          queryClient.invalidateQueries({ queryKey: ['eg_ladder'] }),
          queryClient.invalidateQueries({ queryKey: ['eg_ladder', activeSeasonSlug] }),
          queryClient.invalidateQueries({ queryKey: ['stats'] }),
        ]);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(DATA_SYNC_EVENT, {
            detail: {
              fixtureId: fixture.id,
              seasonId: fixture.seasonId || null,
              adminQuickSubmit: true,
              fallbackSubmission: fallbackData || null,
            },
          }));
        }

        fallbackSucceeded = true;
        setSubmitSuccess(true);
      } catch (fallbackError: any) {
        const primaryMessage = String(error?.message || 'Admin save failed.');
        const secondaryMessage = String(fallbackError?.message || 'Fallback submit failed.');
        const detail = restoreError
          ? `${primaryMessage}\nFallback: ${secondaryMessage}\nProfile restore: ${String((restoreError as any)?.message || restoreError)}`
          : `${primaryMessage}\nFallback: ${secondaryMessage}`;
        setConflict({
          message: 'Super admin save failed.',
          detail,
        });
      } finally {
        if (originalTeamId !== adminSelectedTeamId) {
          try {
            await updateCoachProfile(sessionUserId, { team_id: originalTeamId ?? null });
          } catch (nextRestoreError) {
            restoreError = nextRestoreError;
            if (fallbackSucceeded) {
              setSubmitSuccess(false);
            }
            if (!fallbackSucceeded) {
              setConflict((prev) => prev ? {
                ...prev,
                detail: `${prev.detail ? `${prev.detail}\n` : ''}Profile restore: ${String((nextRestoreError as any)?.message || nextRestoreError)}`,
              } : {
                message: 'Super admin save failed.',
                detail: `Profile restore: ${String((nextRestoreError as any)?.message || nextRestoreError)}`,
              });
            } else {
              setConflict({
                message: 'Result saved, but profile restore failed.',
                detail: `Your super admin account team assignment could not be restored automatically: ${String((nextRestoreError as any)?.message || nextRestoreError)}`,
              });
            }
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId || !canSubmit || !sessionUserId) return;
    if (requiresAdminApproval) {
      setConflict({
        message: SUBMISSION_CLOSED_LABEL,
        detail: `Admin approval is required for Round ${fixture.round} before this result can be submitted.`,
      });
      return;
    }
    setIsSubmitting(true);
    setConflict(null);
    setSubmitStatsWarning(null);
    setSubmitSuccessDetail('Score, quarter-by-quarter, and team stats are now live across Fixtures, Match Centre, and Ladder.');

    try {
      const uploadedAssets: UploadedEvidenceAsset[] = [];
      for (const slot of RESULT_SCREENSHOT_SLOTS) {
        const file = resultScreenshots[slot.key];
        if (!file || !uploadedFileReady(file)) throw new Error(`Missing uploaded screenshot: ${slot.label}`);
        uploadedAssets.push({
          bucket: file.bucket || 'Assets',
          path: file.path || '',
          publicUrl: file.publicUrl || '',
          name: file.name,
          size: file.size,
          mimeType: file.file.type || null,
          imageType: file.imageType || slot.imageType,
          statKey: file.statKey ?? slot.statKey,
          pageNumber: file.pageNumber ?? slot.page,
        });
      }

      for (const [index, file] of playerScreenshotFiles.entries()) {
        if (!uploadedFileReady(file)) throw new Error(`Player screenshot is still uploading: ${file.name}`);
        uploadedAssets.push({
          bucket: file.bucket || 'Assets',
          path: file.path || '',
          publicUrl: file.publicUrl || '',
          name: file.name,
          size: file.size,
          mimeType: file.file.type || null,
          imageType: 'player_stat',
          statKey: file.statKey ?? null,
          pageNumber: index + 1,
        });
      }

      const builtTeamStats = buildManualTeamStatsPayload(manualTeamStats);
      const builtQuarterScores = buildQuarterScoresPayload(quarterScores);

      const submitPayload = {
        screenshots: uploadedAssets,
        teamStats: builtTeamStats,
        quarterScores: builtQuarterScores,
      };

      console.info('[Submit] p_ocr payload →', JSON.stringify({ teamStats: builtTeamStats, quarterScores: builtQuarterScores }));

      const { data: rpcData, error: rpcErr } = await supabase.rpc('eg_submit_result_v2', {
        p_fixture_id: fixture.id,
        p_home_goals: homeGoalsN,
        p_home_behinds: homeBehindsN,
        p_away_goals: awayGoalsN,
        p_away_behinds: awayBehindsN,
        p_venue: venue || null,
        p_goal_kickers_home: homeGoalKickers.map((entry) => ({ id: entry.playerId || null, name: entry.name, goals: entry.goals })),
        p_goal_kickers_away: awayGoalKickers.map((entry) => ({ id: entry.playerId || null, name: entry.name, goals: entry.goals })),
        p_ocr: submitPayload,
        p_notes: notes || null,
      });

      if (rpcErr) {
        setConflict(formatSubmitError(rpcErr));
        return;
      }

      let statsWarning: string | null = null;
      try {
        if (extractedPlayerStats.length > 0) {
          const { data: saveStatsData, error: saveStatsError } = await supabase.functions.invoke('save-player-stats', {
            body: {
              fixture_id: fixture.id,
              player_stats: extractedPlayerStats.map((row) => ({
                name: row.name,
                team: row.team,
                goals: row.goals,
                behinds: row.behinds,
                disposals: row.disposals,
                kicks: row.kicks,
                handballs: row.handballs,
                marks: row.marks,
                tackles: row.tackles,
                hitouts: row.hitouts,
                afl_fantasy: row.afl_fantasy ?? row.fantasyPoints,
                fantasyPoints: row.fantasyPoints ?? row.afl_fantasy,
              })),
            },
          });

          if (saveStatsError) {
            throw saveStatsError;
          }

          const saveStatsPayload = (saveStatsData || {}) as {
            success?: boolean;
            diagnostics?: {
              unmatched?: unknown[];
              fieldCounts?: Record<string, number>;
            };
          };

          if (!saveStatsPayload.success) {
            statsWarning = 'Result submitted, but player stat saving needs admin review.';
          } else {
            const unmatchedCount = Array.isArray(saveStatsPayload.diagnostics?.unmatched)
              ? saveStatsPayload.diagnostics?.unmatched?.length || 0
              : 0;
            const savedFieldCounts = saveStatsPayload.diagnostics?.fieldCounts || extractedPlayerStatFieldCounts;

            if (playerStatsSavedOnlyGoals(savedFieldCounts)) {
              statsWarning = 'Result submitted, but only goals were saved from the screenshots. Admin review is recommended for disposals and fantasy stats.';
            } else if (unmatchedCount > 0) {
              statsWarning = `Result submitted, but ${unmatchedCount} extracted player row(s) still need admin review.`;
            }
          }
        } else {
          statsWarning = 'Result submitted, but no player stat rows were extracted from the uploaded screenshots. Admin review is recommended.';
        }
      } catch (error: any) {
        statsWarning = `Result submitted, but player stat saving needs admin review: ${String(error?.message || 'Unknown error')}`;
      }

      window.localStorage.removeItem(buildDraftKey(sessionUserId, fixture.id));
      const activeSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);
      invalidateAfl26Cache();
      invalidateFixturesCache({ fixtureId: fixture.id, seasonId: fixture.seasonId || null });
      invalidateLadderCache({ seasonSlug: activeSeasonSlug, seasonId: fixture.seasonId || null });
      clearStatsCategoriesCache();
      clearStatLeadersCache();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['fixtures', 'season', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['fixture', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['submissions', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre'] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder'] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DATA_SYNC_EVENT, {
          detail: { fixtureId: fixture.id, seasonId: fixture.seasonId || null, submission: rpcData || null },
        }));
      }

      if (statsWarning) {
        setSubmitStatsWarning(statsWarning);
        setSubmitSuccessDetail('Score, quarter-by-quarter, and team stats are now live. Player stat extraction finished with an admin-review warning.');
      } else {
        setSubmitSuccessDetail('Score, quarter-by-quarter, team stats, and player stats are now live across Fixtures, Match Centre, Ladder, and season leaders.');
      }
      setSubmitSuccess(true);
    } catch (error: any) {
      setConflict(formatSubmitError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const heroMetaItems = useMemo(() => {
    const items = [fixture ? `Round ${fixture.round}` : null, competitionLabel].filter(Boolean) as string[];
    if (hasMeaningfulMeta(kickoffLabel)) items.push(kickoffLabel);
    if (hasMeaningfulMeta(venue)) items.push(venue);
    return items;
  }, [competitionLabel, fixture, kickoffLabel, venue]);

  const heroCoachLabel = useMemo(() => String(sessionEmail || myCoachName || 'coach').trim() || 'coach', [myCoachName, sessionEmail]);

  const renderStepper = () => (
    <div className="mdcStepper">
      {Array.from({ length: STEP_COUNT }, (_, index) => {
        const step = index + 1;
        const active = step === currentStep;
        const past = step < currentStep;
        return (
          <button
            key={step}
            type="button"
            className={`mdcStepper__step ${active ? 'is-active' : ''} ${past ? 'is-done' : ''} ${stepComplete[step as keyof typeof stepComplete] && !active ? 'is-complete' : ''}`}
            onClick={() => goToStep(step)}
          >
            <span className="mdcStepper__dot">{past ? <Check size={12} /> : step}</span>
            <span className="mdcStepper__label">{STEP_LABELS[index]}</span>
          </button>
        );
      })}
      <div className="mdcStepper__track">
        <div className="mdcStepper__fill" style={{ width: `${((currentStep - 1) / (STEP_COUNT - 1)) * 100}%` }} />
      </div>
    </div>
  );

  const renderStepNav = (showSubmit?: boolean) => (
    <div className="mdcStepNav">
      {currentStep > 1 ? (
        <button type="button" className="mdcBtn mdcStepNav__back" onClick={goBack}>
          <ChevronLeft size={16} /> Back
        </button>
      ) : (
        <button type="button" className="mdcBtn mdcStepNav__back" onClick={() => navigate('/fixtures')}>
          Cancel
        </button>
      )}
      {showSubmit ? (
        <button type="button" className="mdcBtn mdcBtn--primary" disabled={!canSubmit || isSubmitting} onClick={submit}>
          {isSubmitting ? 'Submitting…' : 'Confirm & Submit'}
        </button>
      ) : (
        <button type="button" className="mdcBtn mdcBtn--primary mdcStepNav__next" onClick={goNext}>
          Next <ChevronRight size={16} />
        </button>
      )}
    </div>
  );

  if (!fixturesVisible) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">{FIXTURES_UNLOCK_LABEL}</div>
              <div className="mdcLoading__sub">Submissions will open once fixtures are revealed.</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">Loading Submit Results…</div>
              <div className="mdcLoading__sub">Checking your fixture</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !fixture || !homeTeam || !awayTeam) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">Nothing to submit right now</div>
              <div className="mdcLoading__sub">{loadError || 'No eligible fixture was found for your assigned team.'}</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Both early returns above cover every null case; this guard narrows the
  // types for the JSX below so it type-checks cleanly.
  if (!fixture || !homeTeam || !awayTeam) return null;

  const activeFixture = fixture!;
  const activeHomeTeam = homeTeam!;
  const activeAwayTeam = awayTeam!;

  return (
    <div className="egSubmitPage">
      <main className="egSubmitPage__main">
        <div className="egSubmitPage__wrap">
          <section
            className="mdcHero"
            style={{
              '--homeR': homeTeamColors.r,
              '--homeG': homeTeamColors.g,
              '--homeB': homeTeamColors.b,
              '--awayR': awayTeamColors.r,
              '--awayG': awayTeamColors.g,
              '--awayB': awayTeamColors.b,
            } as React.CSSProperties}
          >
            <div className="mdcHero__top">
              <div className="mdcHero__titleWrap">
                <div className="mdcHero__eyebrow">Submit Results</div>
                <div className="mdcHero__titleRow">
                  {eligibleFixtures.length > 1 ? (
                    <div className="mdcRoundSelect">
                      <select
                        value={selectedRound ?? activeFixture.round}
                        onChange={(e) => handleRoundChange(Number(e.target.value))}
                        className="mdcRoundSelect__dropdown"
                      >
                        {eligibleFixtures.map((ef) => (
                          <option key={ef.round} value={ef.round}>Round {ef.round}</option>
                        ))}
                      </select>
                      <ChevronRight size={14} className="mdcRoundSelect__chevron" />
                    </div>
                  ) : (
                    <div className="mdcHero__title">Round {activeFixture.round}</div>
                  )}
                  <span className={`mdcChip ${submitSuccess ? 'mdcChip--success' : draftSavedAt ? 'mdcChip--muted' : 'mdcChip--warning'}`}>
                    {submitSuccess ? 'Submitted' : draftSavedAt ? 'Draft saved' : 'In progress'}
                  </span>
                </div>
              </div>
              <div className="mdcCoachPill">
                <Shield size={13} />
                <span>{heroCoachLabel}</span>
              </div>
            </div>

            <div className="mdcHero__match">
              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">{activeHomeTeam.logo ? <img src={activeHomeTeam.logo} alt={activeHomeTeam.name} /> : <span>{activeHomeTeam.name.slice(0, 1)}</span>}</div>
                <div className="mdcTeamBlock__name" title={activeHomeTeam.name}>{homeDisplayName}</div>
              </div>
              <div className="mdcHero__center"><div className="mdcHero__divider" aria-hidden="true" /></div>
              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">{activeAwayTeam.logo ? <img src={activeAwayTeam.logo} alt={activeAwayTeam.name} /> : <span>{activeAwayTeam.name.slice(0, 1)}</span>}</div>
                <div className="mdcTeamBlock__name" title={activeAwayTeam.name}>{awayDisplayName}</div>
              </div>
            </div>

            {currentStep > 2 && scoreValid && (
              <div className="mdcHero__scoreBanner">
                <span>{homeDisplayName} <strong>{homeScore}</strong></span>
                <span className="mdcHero__scoreDash">—</span>
                <span><strong>{awayScore}</strong> {awayDisplayName}</span>
              </div>
            )}

            <div className="mdcHero__bottom">
              <div className="mdcHero__bottomMeta">
                <div className="mdcProgressMeta">{totalUploadsCount} uploads</div>
                <div className="mdcHero__bottomSub">
                  Round {activeFixture.round}
                  {submissionDeadline.expired && !finalsSubmissionOpen
                    ? lateSubmissionApproved
                      ? ' — Admin late-submit approval active'
                      : ' — Season closed'
                    : finalsSubmissionOpen
                      ? ' — Finals submission open for home team'
                    : eligibleFixtures.length > 1
                      ? ` — ${eligibleFixtures.length} rounds available`
                      : ' — Fixture locked in'}
                </div>
              </div>
              <button type="button" className="mdcHeroCta" onClick={() => navigate(`/match-centre/${activeFixture.id}`)}>
                Match Centre <ChevronRight size={14} />
              </button>
            </div>
          </section>

          {conflict?.message && (
            <div className="mdcStatus mdcStatus--danger">
              <AlertTriangle size={14} />
              <div style={{ minWidth: 0 }}>
                <div>{conflict.message}</div>
                {conflict.detail && <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.45, color: 'rgba(255, 220, 220, 0.9)' }}>{conflict.detail}</pre>}
              </div>
            </div>
          )}

          {submissionDeadline.expired ? (
            <div className={`mdcStatus ${lateSubmissionApproved ? '' : 'mdcStatus--danger'}`}>
              {lateSubmissionApproved || finalsSubmissionOpen ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <div style={{ minWidth: 0 }}>
                <div>
                  {finalsSubmissionOpen
                    ? 'Finals are still open. The home team coach can submit this result once the match is complete.'
                    : lateSubmissionApproved
                    ? `Admin approval active. This fixture can still be submitted after ${SUBMISSION_DEADLINE_LABEL}.`
                    : SUBMISSION_CLOSED_LABEL}
                </div>
                {!lateSubmissionApproved && !finalsSubmissionOpen ? (
                  <div style={{ marginTop: 4, color: 'rgba(255, 220, 220, 0.9)' }}>
                    Ask admin to approve this fixture before uploading and submitting the result.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {renderStepper()}

          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {currentStep === 1 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Confirm &amp; Begin</div>
                  <div className="mdcCard__body">
                    <div className="mdcConfirmMatch__meta">
                      {heroMetaItems.map((item) => <span key={item} className="mdcConfirmMatch__metaItem">{item}</span>)}
                    </div>

                    <div className="mdcInstructions" style={{ marginTop: 10 }}>
                      <div className="mdcCard__hint" style={{ marginBottom: 8, fontWeight: 800, color: 'rgba(255,255,255,0.78)' }}>You will need:</div>
                      <div className="mdcInstructions__list">
                        <div className="mdcInstructions__item"><CheckCircle2 size={14} /><span>Final score &amp; quarter-by-quarter scores</span></div>
                        <div className="mdcInstructions__item"><CheckCircle2 size={14} /><span>All 17 team stats for both teams</span></div>
                        <div className="mdcInstructions__item"><CheckCircle2 size={14} /><span>Goal kickers for both teams</span></div>
                        <div className="mdcInstructions__item"><Camera size={14} /><span>3 match screenshots + player stats screenshots</span></div>
                      </div>
                    </div>

                    <div className="mdcIntegrity" style={{ marginTop: 8 }}>
                      <Shield size={13} />
                      <span>
                        Submitting for Round {activeFixture.round}.
                        {eligibleFixtures.length > 1 ? ' Use the round selector above to change.' : ''}
                        {submissionDeadline.expired && !finalsSubmissionOpen
                          ? lateSubmissionApproved
                            ? ' This fixture has admin late-submit approval.'
                            : ' Submission is locked until admin approval is switched on for this fixture.'
                          : finalsSubmissionOpen
                            ? ' Finals submissions stay open for the home coach.'
                          : ' All submissions are reviewed by admin and AI.'}
                      </span>
                    </div>

                    {renderStepNav()}
                  </div>
                </section>
              )}

              {currentStep === 2 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Final Score</div>
                  <div className="mdcCard__body">
                    <div className="mdcScorePanel">
                      {[{ label: homeDisplayName, goals: homeGoals, behinds: homeBehinds, setGoals: setHomeGoals, setBehinds: setHomeBehinds, total: homeScore, goalsNum: homeGoalsN, behindsNum: homeBehindsN }, { label: awayDisplayName, goals: awayGoals, behinds: awayBehinds, setGoals: setAwayGoals, setBehinds: setAwayBehinds, total: awayScore, goalsNum: awayGoalsN, behindsNum: awayBehindsN }].map((team) => (
                        <div className="mdcScoreTeam" key={team.label}>
                          <div className="mdcScoreTeam__head">{team.label}</div>
                          <div className="mdcScoreInputs">
                            <label>Goals<input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={team.goals} onChange={(e) => team.setGoals(sanitizeNumericInput(e.target.value))} placeholder="0" /></label>
                            <label>Behinds<input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={team.behinds} onChange={(e) => team.setBehinds(sanitizeNumericInput(e.target.value))} placeholder="0" /></label>
                          </div>
                          <div className="mdcScoreTotal">{team.goalsNum}.{team.behindsNum} <span>({team.total})</span></div>
                        </div>
                      ))}
                    </div>
                    {scoreValid && (
                      <div className="mdcLivePreview">
                        <div className="mdcLivePreview__title">Final Score Preview</div>
                        <div className="mdcLivePreview__row">
                          <span>{homeDisplayName}</span>
                          <strong>{homeScore}</strong>
                          <span>—</span>
                          <strong>{awayScore}</strong>
                          <span>{awayDisplayName}</span>
                        </div>
                      </div>
                    )}
                    {renderStepNav()}
                  </div>
                </section>
              )}

              {currentStep === 3 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Quarter Scores</div>
                  <div className="mdcCard__body">
                    <p className="mdcCard__hint">Progressive cumulative scores. Q4 must match final score.</p>
                    <div className="mdcQuarterGrid">
                      <div className="mdcQuarterGrid__header">
                        <div className="mdcQuarterGrid__headerCell" />
                        <div className="mdcQuarterGrid__headerTeam">{homeDisplayName}</div>
                        <div className="mdcQuarterGrid__headerTeam">{awayDisplayName}</div>
                      </div>
                      <div className="mdcQuarterGrid__subHeader">
                        <div />
                        <div className="mdcQuarterGrid__subRow"><span>G</span><span>B</span><span>Ttl</span></div>
                        <div className="mdcQuarterGrid__subRow"><span>G</span><span>B</span><span>Ttl</span></div>
                      </div>
                      {QUARTERS.map((q) => {
                        const row = quarterScores[q];
                        const hg = safeNum(row.homeGoals);
                        const hb = safeNum(row.homeBehinds);
                        const ag = safeNum(row.awayGoals);
                        const ab = safeNum(row.awayBehinds);
                        return (
                          <div key={q} className="mdcQuarterGrid__row">
                            <div className="mdcQuarterGrid__label">{QUARTER_LABELS[q]}</div>
                            <div className="mdcQuarterGrid__inputs">
                              <input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={row.homeGoals} onChange={(e) => setQuarterValue(q, 'homeGoals', e.target.value)} placeholder="0" />
                              <input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={row.homeBehinds} onChange={(e) => setQuarterValue(q, 'homeBehinds', e.target.value)} placeholder="0" />
                              <div className="mdcQuarterGrid__total">{hg * 6 + hb}</div>
                            </div>
                            <div className="mdcQuarterGrid__inputs">
                              <input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={row.awayGoals} onChange={(e) => setQuarterValue(q, 'awayGoals', e.target.value)} placeholder="0" />
                              <input inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={row.awayBehinds} onChange={(e) => setQuarterValue(q, 'awayBehinds', e.target.value)} placeholder="0" />
                              <div className="mdcQuarterGrid__total">{ag * 6 + ab}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {quartersFilled && !quartersMatchFinal && <div className="mdcStatus mdcStatus--danger mdcStatus--inline"><AlertTriangle size={14} /> Q4 scores must match the final score entered above.</div>}
                    {quartersFilled && !quartersProgressive && <div className="mdcStatus mdcStatus--danger mdcStatus--inline"><AlertTriangle size={14} /> Each quarter must be equal to or higher than the previous quarter.</div>}
                    {renderStepNav()}
                  </div>
                </section>
              )}

              {currentStep === 4 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Team Stats</div>
                  <div className="mdcCard__body">
                    <div className="mdcStepProgress"><span>{teamStatsFilledCount} / {MANUAL_TEAM_STAT_FIELDS.length}</span> stats entered</div>
                    <div className="mdcTeamStatsGrid">
                      <div className="mdcTeamStatsGrid__headerCell">Stat</div>
                      <div className="mdcTeamStatsGrid__headerCell mdcTeamStatsGrid__headerCell--center">{homeDisplayName}</div>
                      <div className="mdcTeamStatsGrid__headerCell mdcTeamStatsGrid__headerCell--center">{awayDisplayName}</div>
                      {MANUAL_TEAM_STAT_FIELDS.map((field) => (
                        <React.Fragment key={field.key}>
                          <div className="mdcTeamStatsGrid__label">{field.label}</div>
                          <input className="mdcTeamStatsGrid__input" inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={manualTeamStats[field.key].home} onChange={(e) => setManualTeamStatValue(field.key, 'home', e.target.value)} placeholder="0" />
                          <input className="mdcTeamStatsGrid__input" inputMode="numeric" autoComplete="off" autoCorrect="off" onFocus={selectOnFocus} value={manualTeamStats[field.key].away} onChange={(e) => setManualTeamStatValue(field.key, 'away', e.target.value)} placeholder="0" />
                        </React.Fragment>
                      ))}
                    </div>
                    {renderStepNav()}
                  </div>
                </section>
              )}

              {currentStep === 5 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Goal Kickers</div>
                  <div className="mdcCard__body">
                    <div className="mdcGoalKickerSection__head">
                      <div>
                        <div className="mdcGoalKickerSection__sub">Tap a player or search by name. Use +/- to adjust goals.</div>
                      </div>
                      <div className={`mdcGoalKickerSection__status ${goalKickersValid && (homeGoalsN > 0 || awayGoalsN > 0) ? 'is-valid' : homeGoalsN === 0 && awayGoalsN === 0 ? '' : 'is-warn'}`}>
                        {homeGoalsN === 0 && awayGoalsN === 0
                          ? 'Enter score first'
                          : goalKickersValid
                            ? 'All goals assigned'
                            : `${homeUnassignedGoals + awayUnassignedGoals} unassigned`}
                      </div>
                    </div>

                    <GoalKickerPicker
                      homeTeamId={homeTeam?.id}
                      homeTeamName={homeTeam?.name || homeDisplayName}
                      awayTeamId={awayTeam?.id}
                      awayTeamName={awayTeam?.name || awayDisplayName}
                      allPlayers={mappedPlayers as any}
                      homeKickers={homeGoalKickers.map((entry) => ({ id: entry.id, name: entry.name, photoUrl: entry.photoUrl, goals: entry.goals }))}
                      awayKickers={awayGoalKickers.map((entry) => ({ id: entry.id, name: entry.name, photoUrl: entry.photoUrl, goals: entry.goals }))}
                      homeTaggedGoals={homeGoalKickerTotal}
                      awayTaggedGoals={awayGoalKickerTotal}
                      homeScoredGoals={homeGoalsN}
                      awayScoredGoals={awayGoalsN}
                      onAddKicker={addGoalKicker}
                      onIncGoal={incGoalKicker}
                      onDecGoal={decGoalKicker}
                      onRemoveKicker={removeGoalKicker}
                    />
                    {renderStepNav()}
                  </div>
                </section>
              )}

              {currentStep === 6 && (
                <>
                  <input ref={resultFileInputRef} type="file" accept="image/*" onChange={onResultFileSelected} hidden />
                  <input ref={playerFilesInputRef} type="file" accept="image/*" multiple onChange={onPlayerFilesSelected} hidden />
                  <section className="mdcCard">
                    <div className="mdcCard__head">Screenshots</div>
                    <div className="mdcCard__body">
                      <div className="mdcStepProgress"><span>{resultScreenshotsCount}/3</span> match • <span>{playerScreenshotCount}</span> player</div>
                      {fileError && <div className="mdcStatus mdcStatus--danger mdcStatus--inline" style={{ marginBottom: 8 }}><AlertTriangle size={14} /> {fileError}</div>}

                      <div className="mdcScreenshotGroup">
                        <div className="mdcScreenshotGroup__title">Match Screenshots (3 required)</div>
                        <div className="mdcSlotGrid">
                          {RESULT_SCREENSHOT_SLOTS.map((slot) => {
                            const file = resultScreenshots[slot.key];
                            return (
                              <div key={slot.key} className={`mdcSlot ${file ? 'mdcSlot--filled' : ''}`}>
                                <div className="mdcSlot__label">{slot.label}</div>
                                {file ? (
                                  <div className="mdcSlot__preview">
                                    <img src={file.previewUrl} alt={slot.label} />
                                    <div className="mdcSlot__meta">
                                      <div className="mdcSlot__fileName">{file.name}</div>
                                      <div className="mdcSlot__fileSize">{bytesToKb(file.size)} KB</div>
                                      <div className="mdcCard__hint" style={{ marginTop: 4 }}>
                                        {file.extractionMessage || (uploadedFileReady(file) ? 'Uploaded' : 'Waiting')}
                                      </div>
                                    </div>
                                    <div className="mdcSlot__actions">
                                      <button type="button" className="mdcSlot__replace" onClick={() => triggerResultUpload(slot.key)}>Replace</button>
                                      <button type="button" className="mdcSlot__remove" onClick={() => removeResultScreenshot(slot.key)}><X size={14} /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <button type="button" className="mdcSlot__upload" onClick={() => triggerResultUpload(slot.key)}>
                                    <Upload size={16} />
                                    <span>Upload</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mdcScreenshotGroup">
                        <div className="mdcScreenshotGroup__title">Player Stats Screenshots</div>
                        <p className="mdcCard__hint">Both teams, all players — goals, behinds, disposals, kicks, handballs, marks, tackles, hit outs, and AFL Fantasy.</p>
                        <div className={`mdcBulkUpload ${playerScreenshotsValid ? 'is-valid' : ''}`}>
                          <div className="mdcBulkUpload__top">
                            <div>
                              <div className="mdcBulkUpload__title">{playerScreenshotCount} uploaded</div>
                              <div className="mdcCard__hint">{extractedPlayerStats.length} merged player row(s) extracted so far</div>
                            </div>
                            <button type="button" className="mdcBtn mdcBulkUpload__button" onClick={triggerPlayerUpload}>
                              <Upload size={14} /> Add
                            </button>
                          </div>

                          {playerScreenshotCount > 0 ? (
                            <div className="mdcBulkUpload__grid">
                              {playerScreenshotFiles.map((file, index) => (
                                <div key={file.id} className="mdcBulkUpload__tile">
                                  <img src={file.previewUrl} alt={file.name} />
                                  <div className="mdcBulkUpload__meta">
                                    <div className="mdcBulkUpload__index">#{index + 1}</div>
                                    <div className="mdcBulkUpload__name">{file.name}</div>
                                    <select
                                      value={file.statKey || ''}
                                      onChange={(event) => setPlayerScreenshotStatKey(file.id, (event.target.value || null) as PlayerScreenshotStatKey | null)}
                                      style={{ marginTop: 6, width: '100%' }}
                                    >
                                      <option value="">Choose stat type</option>
                                      {PLAYER_STAT_KEY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                    <div className="mdcCard__hint" style={{ marginTop: 6 }}>
                                      {file.extractionMessage || 'Queued for upload'}
                                    </div>
                                    {typeof file.extractedRowCount === 'number' && file.extractionStatus === 'done' ? (
                                      <div className="mdcCard__hint">{file.extractedRowCount} extracted row(s)</div>
                                    ) : null}
                                  </div>
                                  <button type="button" className="mdcSlot__remove mdcBulkUpload__remove" onClick={() => removePlayerScreenshot(file.id)}><X size={14} /></button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button type="button" className="mdcBulkUpload__empty" onClick={triggerPlayerUpload}>
                              <FileImage size={16} />
                              <span>Tap to upload</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {renderStepNav()}
                    </div>
                  </section>
                </>
              )}

              {currentStep === 7 && (
                <section className="mdcCard">
                  <div className="mdcCard__head">Review &amp; Submit</div>
                  <div className="mdcCard__body">
                    <div className="mdcReviewScore">
                      <div className="mdcReviewScore__value">{homeScore}</div>
                      <div className="mdcReviewScore__teams">{homeDisplayName} <span>vs</span> {awayDisplayName}</div>
                      <div className="mdcReviewScore__value">{awayScore}</div>
                    </div>

                    <div className="mdcChecklist">
                      <button type="button" className={`mdcChecklist__row ${scoreValid ? 'is-ok' : ''}`} onClick={() => goToStep(2)}><Check size={13} /> Score {!scoreValid && <ChevronRight size={13} className="mdcChecklist__go" />}</button>
                      <button type="button" className={`mdcChecklist__row ${quartersValid ? 'is-ok' : ''}`} onClick={() => goToStep(3)}><Check size={13} /> Quarters {!quartersValid && <ChevronRight size={13} className="mdcChecklist__go" />}</button>
                      <button type="button" className={`mdcChecklist__row ${allTeamStatsFilled ? 'is-ok' : ''}`} onClick={() => goToStep(4)}><Check size={13} /> Stats ({teamStatsFilledCount}/{MANUAL_TEAM_STAT_FIELDS.length}) {!allTeamStatsFilled && <ChevronRight size={13} className="mdcChecklist__go" />}</button>
                      <button type="button" className={`mdcChecklist__row ${goalKickersValid ? 'is-ok' : ''}`} onClick={() => goToStep(5)}><Check size={13} /> Kickers ({homeGoalKickerTotal + awayGoalKickerTotal}) {!goalKickersValid && <ChevronRight size={13} className="mdcChecklist__go" />}</button>
                      <button type="button" className={`mdcChecklist__row ${allScreenshotsValid ? 'is-ok' : ''}`} onClick={() => goToStep(6)}><Check size={13} /> Screenshots ({resultScreenshotsCount}/3 + {playerScreenshotCount}) {!allScreenshotsValid && <ChevronRight size={13} className="mdcChecklist__go" />}</button>
                    </div>

                    <div className="mdcReviewNotes">
                      <div className="mdcReviewNotes__label">Notes (optional)</div>
                      <textarea className="mdcNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any issues or corrections…" rows={2} />
                    </div>

                    {validationMessages.length > 0 && (
                      <div className="mdcValidation">
                        <div className="mdcValidation__title">Required:</div>
                        {validationMessages.map((msg) => <div key={msg} className="mdcValidation__item"><AlertTriangle size={12} /> {msg}</div>)}
                      </div>
                    )}

                    {renderStepNav(true)}
                  </div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {submitSuccess && (
          <motion.div className="mdcSuccessOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="mdcSuccessCard" initial={{ y: 10, scale: 0.97 }} animate={{ y: 0, scale: 1 }}>
              <div className="mdcSuccessCard__icon"><Check size={24} /></div>
              <div className="mdcSuccessCard__title">Result Submitted</div>
              <div className="mdcSuccessCard__sub">{submitSuccessDetail}</div>
              {submitStatsWarning ? (
                <div className="mdcValidation" style={{ marginTop: 12 }}>
                  <div className="mdcValidation__item"><AlertTriangle size={12} /> {submitStatsWarning}</div>
                </div>
              ) : null}
              <div className="mdcSuccessCard__score">{homeScore} — {awayScore}</div>
              <div className="mdcSuccessCard__actions">
                <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => navigate(`/match-centre/${activeFixture.id}`)}>Open Match Centre</button>
                <button type="button" className="mdcBtn" onClick={() => navigate('/fixtures')}>Back to Fixtures</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
