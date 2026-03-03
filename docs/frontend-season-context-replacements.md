# Frontend Season Context Fixes - Full Replacement Files

## src/data/afl26Supabase.ts
```tsx
import { supabase } from '../lib/supabaseClient';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';

export type ScoreLine = { total: number; goals: number; behinds: number };

export type AflMatch = {
  id: string;
  venue?: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';

  home: string;
  away: string;

  homeCoachName?: string;
  awayCoachName?: string;

  homePsn?: string;
  awayPsn?: string;

  homeScore?: ScoreLine;
  awayScore?: ScoreLine;
};

export type AflRound = {
  round: number;
  matches: AflMatch[];
};

const SEASON_SLUG_ALIASES: Record<string, string> = {
  afl26: 'afl26-season-two',
  'afl-26': 'afl26-season-two',
};

// small cache so Home + Fixtures don’t refetch back-to-back
let cache = new Map<string, { at: number; rounds: AflRound[] }>();
const seasonIdCache = new Map<string, string>();
const TTL_MS = 60_000;

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getActiveSeasonSlug() {
  const activeCompetition = getStoredCompetitionKey();
  return getDataSeasonSlugForCompetition(activeCompetition);
}

async function resolveSeasonIdForSlug(inputSlug?: string): Promise<string> {
  const requested = normalizeSlug(inputSlug || getActiveSeasonSlug());
  if (!requested) throw new Error('Missing season slug for active competition');

  const cached = seasonIdCache.get(requested);
  if (cached) return cached;

  const alias = SEASON_SLUG_ALIASES[requested];
  const attempts = [requested, alias].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

  for (const attempt of attempts) {
    const exact = await supabase.from('eg_seasons').select('id, slug').eq('slug', attempt).maybeSingle();
    if (!exact.error && exact.data?.id) {
      const id = String(exact.data.id);
      seasonIdCache.set(requested, id);
      seasonIdCache.set(normalizeSlug((exact.data as any).slug || attempt), id);
      return id;
    }
  }

  const fuzzy = await supabase
    .from('eg_seasons')
    .select('id, slug')
    .ilike('slug', `%${requested}%`)
    .limit(1);

  if (!fuzzy.error && Array.isArray(fuzzy.data) && fuzzy.data[0]?.id) {
    const id = String(fuzzy.data[0].id);
    seasonIdCache.set(requested, id);
    seasonIdCache.set(normalizeSlug((fuzzy.data[0] as any).slug || requested), id);
    return id;
  }

  throw new Error(`Season not found for slug "${requested}"`);
}

function toNum(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceStatus(v: any): 'SCHEDULED' | 'LIVE' | 'FINAL' {
  const s = String(v || '').toUpperCase();
  if (s === 'LIVE') return 'LIVE';
  if (s === 'FINAL' || s === 'FULL_TIME' || s === 'FULLTIME') return 'FINAL';
  return 'SCHEDULED';
}

export function invalidateAfl26Cache() {
  cache.clear();
}

export function peekAfl26RoundsCache(seasonSlug?: string): AflRound[] | null {
  const key = normalizeSlug(seasonSlug || getActiveSeasonSlug());
  if (!key) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= TTL_MS) return null;
  return hit.rounds;
}

export async function getAfl26RoundsFromSupabase(opts?: { force?: boolean; seasonSlug?: string }): Promise<AflRound[]> {
  const now = Date.now();
  const requestedSlug = normalizeSlug(opts?.seasonSlug || getActiveSeasonSlug());
  const cacheKey = requestedSlug;
  const cached = cache.get(cacheKey);
  if (!opts?.force && cached && now - cached.at < TTL_MS) return cached.rounds;
  const seasonId = await resolveSeasonIdForSlug(requestedSlug);

  // The eg_fixture_cards view has changed a few times during the build.
  // Try a few select shapes (and finally fallback to eg_fixtures) so the page never hard-crashes
  // just because a column or view was renamed.
  const attempts: Array<{ table: 'eg_fixture_cards' | 'eg_fixtures'; select: string }> = [
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
        'home_coach_name',
        'away_coach_name',
        'home_psn',
        'away_psn',
      ].join(','),
    },
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
        'home_coach_name',
        'away_coach_name',
      ].join(','),
    },
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
      ].join(','),
    },
    {
      table: 'eg_fixtures',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
      ].join(','),
    },
  ];

  let data: any[] | null = null;
  let lastError: any = null;

  for (const a of attempts) {
    const res = await supabase
      .from(a.table)
      .select(a.select)
      .eq('season_id', seasonId)
      .order('round', { ascending: true });

    if (!res.error) {
      data = (res.data as any[]) || [];
      lastError = null;
      break;
    }

    lastError = res.error;
  }

  if (lastError) throw lastError;


  const rows = (data || []) as any[];
  const byRound = new Map<number, AflRound>();

  for (const r of rows) {
    const roundNo = Number(r.round);
    if (!Number.isFinite(roundNo)) continue;

    if (!byRound.has(roundNo)) byRound.set(roundNo, { round: roundNo, matches: [] });

    const hg = toNum(r.home_goals);
    const hb = toNum(r.home_behinds);
    const ag = toNum(r.away_goals);
    const ab = toNum(r.away_behinds);

    const ht = toNum(r.home_total) ?? (hg != null && hb != null ? hg * 6 + hb : null);
    const at = toNum(r.away_total) ?? (ag != null && ab != null ? ag * 6 + ab : null);

    const hasScores = hg != null && hb != null && ag != null && ab != null && ht != null && at != null;

    byRound.get(roundNo)!.matches.push({
      id: String(r.id),
      venue: r.venue ? String(r.venue) : undefined,
      status: coerceStatus(r.status),

      home: String(r.home_team_slug),
      away: String(r.away_team_slug),

      // ✅ coach names from eg_coaches via view
      homeCoachName: r.home_coach_name ? String(r.home_coach_name) : undefined,
      awayCoachName: r.away_coach_name ? String(r.away_coach_name) : undefined,

      // ✅ psn from eg_coaches via view
      homePsn: r.home_psn ? String(r.home_psn) : undefined,
      awayPsn: r.away_psn ? String(r.away_psn) : undefined,

      homeScore: hasScores ? { goals: hg!, behinds: hb!, total: ht! } : undefined,
      awayScore: hasScores ? { goals: ag!, behinds: ab!, total: at! } : undefined,
    });
  }

  const out = Array.from(byRound.values()).sort((a, b) => a.round - b.round);
  cache.set(cacheKey, { at: now, rounds: out });
  return out;
}
```

## src/lib/matchCentreRepo.ts
```tsx
import { supabase } from '@/lib/supabaseClient';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '@/lib/competitionRegistry';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import {
  resolvePlayerDisplayName,
  resolvePlayerPhotoUrl,
  resolveTeamKey,
  resolveTeamLogoUrl,
  resolveTeamName,
} from '@/lib/entityResolvers';

type FixtureRow = {
  id: string;
  round: number;

  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team_slug?: string | null;
  away_team_slug?: string | null;

  venue: string;
  start_time: string | null;

  status: string;

  home_total: number | null;
  away_total: number | null;
  home_goals: number | null;
  home_behinds: number | null;
  away_goals: number | null;
  away_behinds: number | null;
  submitted_at?: string | null;
  verified_at?: string | null;
  disputed_at?: string | null;
  corrected_at?: string | null;
  updated_at?: string | null;
};

type TeamRow = {
  id?: string;
  team_key?: string;
  slug?: string;
  name?: string;
  short_name?: string;
  abbreviation?: string;
  logo_url?: string;
  primary_color?: string | null;
  colour?: string | null;
};

type FixturePlayerStatDbRow = {
  fixture_id: string;
  player_id: string;
  team_id: string;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
};

type DbPlayerRow = {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  number?: number | null;
  headshot_url?: string | null;
  photo_url?: string | null;
  team_id?: string | null;
};

const SEASON_SLUG_ALIASES: Record<string, string> = {
  afl26: 'afl26-season-two',
  'afl-26': 'afl26-season-two',
};

const seasonIdCache = new Map<string, string>();

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

async function resolveActiveSeasonId(): Promise<string> {
  const requestedSlug = normalizeSlug(getDataSeasonSlugForCompetition(getStoredCompetitionKey()));
  if (!requestedSlug) throw new Error('Missing active competition season slug.');

  const cached = seasonIdCache.get(requestedSlug);
  if (cached) return cached;

  const alias = SEASON_SLUG_ALIASES[requestedSlug];
  const attempts = [requestedSlug, alias].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

  for (const attempt of attempts) {
    const exact = await supabase.from('eg_seasons').select('id, slug').eq('slug', attempt).maybeSingle();
    if (!exact.error && exact.data?.id) {
      const id = String(exact.data.id);
      seasonIdCache.set(requestedSlug, id);
      seasonIdCache.set(normalizeSlug((exact.data as any).slug || attempt), id);
      return id;
    }
  }

  const fuzzy = await supabase
    .from('eg_seasons')
    .select('id, slug')
    .ilike('slug', `%${requestedSlug}%`)
    .limit(1);

  if (!fuzzy.error && Array.isArray(fuzzy.data) && fuzzy.data[0]?.id) {
    const id = String(fuzzy.data[0].id);
    seasonIdCache.set(requestedSlug, id);
    seasonIdCache.set(normalizeSlug((fuzzy.data[0] as any).slug || requestedSlug), id);
    return id;
  }

  throw new Error(`Season not found for active competition slug "${requestedSlug}"`);
}

async function fetchFixturePlayerStats(fixtureId: string): Promise<FixturePlayerStatDbRow[]> {
  const { data, error } = await supabase
    .from('eg_fixture_player_stats')
    .select('fixture_id,player_id,team_id,disposals,kicks,handballs,marks,tackles,clearances')
    .eq('fixture_id', fixtureId);

  if (error) throw new Error(error.message);
  return (data || []) as unknown as FixturePlayerStatDbRow[];
}

async function fetchPlayersByTeamIds(teamIds: string[]): Promise<DbPlayerRow[]> {
  if (!teamIds.length) return [];

  const attempts = [
    'id,team_id,name,first_name,last_name,position,number,headshot_url,photo_url',
    'id,team_id,name,position,number,headshot_url,photo_url',
    'id,team_id,first_name,last_name,position,number,headshot_url,photo_url',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase
      .from('eg_players')
      .select(selectCols)
      .in('team_id', teamIds)
      .limit(600);

    if (!error) {
      return (data || []) as unknown as DbPlayerRow[];
    }
  }

  return [];
}

async function fetchPlayersByIds(playerIds: string[]): Promise<DbPlayerRow[]> {
  const ids = Array.from(new Set(playerIds.map((v) => String(v || '').trim()).filter(Boolean)));
  if (!ids.length) return [];

  const attempts = [
    'id,team_id,name,first_name,last_name,position,number,headshot_url,photo_url',
    'id,team_id,name,position,number,headshot_url,photo_url',
    'id,team_id,first_name,last_name,position,number,headshot_url,photo_url',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase
      .from('eg_players')
      .select(selectCols)
      .in('id', ids)
      .limit(2000);

    if (!error) {
      return (data || []) as unknown as DbPlayerRow[];
    }
  }

  return [];
}

async function fetchPlayersByTeamNames(teamNames: string[]): Promise<DbPlayerRow[]> {
  const names = teamNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (!names.length) return [];

  const attempts = [
    'id,team_id,team_name,name,first_name,last_name,position,number,headshot_url,photo_url',
    'id,team_id,team_name,name,position,number,headshot_url,photo_url',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase
      .from('eg_players')
      .select(selectCols)
      .in('team_name', names)
      .limit(600);

    if (!error) {
      return (data || []) as unknown as DbPlayerRow[];
    }
  }

  return [];
}

async function fetchPlayersByTeamSlugs(slugs: string[]): Promise<DbPlayerRow[]> {
  const clean = slugs.map((s) => String(s || '').trim()).filter(Boolean);
  if (!clean.length) return [];

  const { data: teamsBySlug, error: slugErr } = await supabase
    .from('eg_teams')
    .select('id,slug,team_key,name')
    .in('slug', clean);

  if (slugErr) {
    return [];
  }

  const directIds = ((teamsBySlug || []) as TeamRow[])
    .map((t) => String(t.id || '').trim())
    .filter(Boolean);

  if (directIds.length) {
    const playersById = await fetchPlayersByTeamIds(directIds);
    if (playersById.length) return playersById;
  }

  const targetNormalized = new Set(clean.map((s) => normalizeToken(s)));
  const { data: allTeams, error: allTeamsErr } = await supabase
    .from('eg_teams')
    .select('id,slug,team_key,name');

  if (allTeamsErr) return [];

  const matchedIds = ((allTeams || []) as TeamRow[])
    .filter((t) => {
      const candidates = [
        normalizeToken(String(t.slug || '')),
        normalizeToken(String(t.team_key || '')),
        normalizeToken(String(t.name || '')),
      ].filter(Boolean);
      return candidates.some((c) => targetNormalized.has(c));
    })
    .map((t) => String(t.id || '').trim())
    .filter(Boolean);

  if (!matchedIds.length) return [];
  return fetchPlayersByTeamIds(Array.from(new Set(matchedIds)));
}

function mergePlayerName(p: DbPlayerRow): string {
  return resolvePlayerDisplayName({
    name: p.name,
    firstName: p.first_name,
    lastName: p.last_name,
  });
}

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

export type MatchCentreTeam = {
  id?: string;
  slug: string;
  key: TeamKey;
  name: string;
  fullName: string;
  shortName: string;
  abbreviation: string;
  colour: string;
  color: string;
  logoUrl: string;

  goals: number;
  behinds: number;
  score: number;
};

export type MatchLeaderCard = {
  stat: string;
  home: {
    value: number;
    player: string;
    team: string;
    photoUrl?: string;
    seasonAvg?: number | null;
  };
  away: {
    value: number;
    player: string;
    team: string;
    photoUrl?: string;
    seasonAvg?: number | null;
  };
};

export type PlayerStatRow = {
  playerId: string;
  name: string;
  teamId: string;
  team: string;
  number: number;
  position: string;
  photoUrl?: string;

  D: number | null;
  K: number | null;
  H: number | null;
  M: number | null;
  T: number | null;
  CLR: number | null;
};

export type TeamStatRow = {
  label: string;
  isDivider?: boolean;
  homeMatch: number;
  awayMatch: number;
  homeValue?: number | string;
  awayValue?: number | string;
  homePct?: number;
  awayPct?: number;
};

export type MatchMoment = {
  id: string;
  time: string;
  timeLabel: string;
  title: string;
  subtitle?: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  team?: 'home' | 'away';
  type?: 'goal' | 'behind' | 'milestone' | 'injury' | 'moment';
  scoreHome?: number;
  scoreAway?: number;
};

export type MatchTrustInfo = {
  state: 'Scheduled' | 'Submitted' | 'Verified' | 'Disputed' | 'Corrected';
  label: string;
  summary: string;
  submittedBy: string;
  evidenceCount: number;
  lastUpdated: string;
  isSubmitted: boolean;
  isVerified: boolean;
  isDisputed: boolean;
  isCorrected: boolean;
  badgeLabel?: string;
  badgeTone?: 'good' | 'warn' | 'bad' | 'neutral';
};

export type MatchCentreModel = {
  fixtureId: string;
  round: number;

  dateText: string;
  venue: string;
  attendanceText?: string;
  statusLabel: string;
  dataConfidence?: { tone: 'high' | 'medium' | 'low' | 'neutral'; label: string };
  trust: MatchTrustInfo;
  margin: number;

  home: MatchCentreTeam;
  away: MatchCentreTeam;

  leaders: MatchLeaderCard[];
  teamStats: TeamStatRow[];
  playerStats: PlayerStatRow[];
  moments: MatchMoment[];
  hasSubmissionData: boolean;
  quarterProgression?: Array<{
    q: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    home: number;
    away: number;
  }>;
};

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim());
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function statusToLabel(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'final') return 'FINAL';
  if (s === 'live') return 'LIVE';
  if (s === 'scheduled') return 'UPCOMING';
  return (status || '').toUpperCase();
}

function teamColour(team: TeamRow | null | undefined, teamKey: TeamKey) {
  return String(team?.primary_color || team?.colour || TEAM_ASSETS[teamKey]?.colour || '#111827');
}

function teamLogo(team: TeamRow | null | undefined, teamKey: TeamKey) {
  return resolveTeamLogoUrl({
    logoUrl: team?.logo_url,
    slug: team?.slug,
    teamKey: team?.team_key || teamKey,
    name: team?.name,
    fallbackPath: TEAM_ASSETS[teamKey]?.logoFile || TEAM_ASSETS[teamKey]?.logoPath || 'elite-gaming-logo.png',
  });
}

function inferDataConfidence(status: string, submissions: any[]) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'final') return { tone: 'high' as const, label: 'Official' };
  if ((submissions || []).length > 0) return { tone: 'medium' as const, label: 'Submitted' };
  return { tone: 'low' as const, label: 'Scheduled' };
}

function computeMatchStatus({ fixture, submissions }: { fixture: FixtureRow; submissions: any[] }): MatchTrustInfo {
  const status = String(fixture.status || '').toLowerCase();
  const isSubmitted = Boolean(fixture.submitted_at) || (submissions || []).length > 0 || status === 'completed' || status === 'final';
  const isVerified = Boolean(fixture.verified_at);
  const isDisputed = Boolean(fixture.disputed_at);
  const isCorrected = Boolean(fixture.corrected_at);
  const latest = (submissions || [])[0] || null;
  const submittedBy =
    String(latest?.submitted_by_email || latest?.submitted_by || latest?.coach_name || '').trim() || 'Coach';
  const evidenceCount = Number(latest?.evidence_count ?? 0) || 0;
  const lastUpdated =
    String(fixture.updated_at || fixture.corrected_at || fixture.verified_at || fixture.submitted_at || latest?.created_at || '');

  if (isCorrected) {
    return {
      state: 'Corrected',
      label: 'Corrected',
      summary: 'Result corrected after review',
      submittedBy,
      evidenceCount,
      lastUpdated,
      isSubmitted,
      isVerified,
      isDisputed,
      isCorrected,
      badgeLabel: 'CORRECTED',
      badgeTone: 'warn',
    };
  }
  if (isDisputed) {
    return {
      state: 'Disputed',
      label: 'Disputed',
      summary: 'Submission is currently under review',
      submittedBy,
      evidenceCount,
      lastUpdated,
      isSubmitted,
      isVerified,
      isDisputed,
      isCorrected,
      badgeLabel: 'DISPUTED',
      badgeTone: 'bad',
    };
  }
  if (isVerified) {
    return {
      state: 'Verified',
      label: 'Verified',
      summary: 'Submission has been verified',
      submittedBy,
      evidenceCount,
      lastUpdated,
      isSubmitted,
      isVerified,
      isDisputed,
      isCorrected,
      badgeLabel: 'VERIFIED',
      badgeTone: 'good',
    };
  }
  if (isSubmitted) {
    return {
      state: 'Submitted',
      label: 'Submitted',
      summary: 'Awaiting verification',
      submittedBy,
      evidenceCount,
      lastUpdated,
      isSubmitted,
      isVerified,
      isDisputed,
      isCorrected,
      badgeLabel: 'SUBMITTED',
      badgeTone: 'neutral',
    };
  }
  return {
    state: 'Scheduled',
    label: 'Scheduled',
    summary: 'Awaiting coach submission',
    submittedBy: '—',
    evidenceCount: 0,
    lastUpdated,
    isSubmitted,
    isVerified,
    isDisputed,
    isCorrected,
    badgeLabel: 'PENDING',
    badgeTone: 'neutral',
  };
}

function fallbackQuarterProgression(homeTotal: number, awayTotal: number) {
  const h = Math.max(0, homeTotal);
  const a = Math.max(0, awayTotal);
  return [
    { q: 'Q1' as const, home: Math.round(h * 0.2), away: Math.round(a * 0.2) },
    { q: 'Q2' as const, home: Math.round(h * 0.45), away: Math.round(a * 0.45) },
    { q: 'Q3' as const, home: Math.round(h * 0.75), away: Math.round(a * 0.75) },
    { q: 'Q4' as const, home: h, away: a },
  ];
}

function parseQuarterProgressionFromOcrRaw(_raw: string) {
  return undefined;
}

function buildMoments(_fixture: FixtureRow, _submissions: any[], _trust: MatchTrustInfo): MatchMoment[] {
  return [];
}

async function resolveFixtureTeamIds(fixture: FixtureRow, homeTeamRow: TeamRow | null, awayTeamRow: TeamRow | null) {
  let homeTeamId = String(fixture.home_team_id || homeTeamRow?.id || '').trim();
  let awayTeamId = String(fixture.away_team_id || awayTeamRow?.id || '').trim();

  const missingSlugs: string[] = [];
  if (!homeTeamId && fixture.home_team_slug) missingSlugs.push(String(fixture.home_team_slug));
  if (!awayTeamId && fixture.away_team_slug) missingSlugs.push(String(fixture.away_team_slug));

  if (missingSlugs.length) {
    const { data, error } = await supabase
      .from('eg_teams')
      .select('id,slug')
      .in('slug', missingSlugs);

    if (!error) {
      const bySlug = new Map((data || []).map((r: any) => [String(r.slug), String(r.id)]));
      if (!homeTeamId && fixture.home_team_slug) homeTeamId = bySlug.get(String(fixture.home_team_slug)) || '';
      if (!awayTeamId && fixture.away_team_slug) awayTeamId = bySlug.get(String(fixture.away_team_slug)) || '';
    }
  }

  if ((!homeTeamId || !awayTeamId) && (fixture.home_team_slug || fixture.away_team_slug)) {
    const homeSlugN = normalizeToken(String(fixture.home_team_slug || ''));
    const awaySlugN = normalizeToken(String(fixture.away_team_slug || ''));

    const { data: allTeams, error: allTeamsErr } = await supabase
      .from('eg_teams')
      .select('id,slug,team_key,name');

    if (!allTeamsErr) {
      for (const team of (allTeams || []) as TeamRow[]) {
        const candidates = [
          normalizeToken(String(team.slug || '')),
          normalizeToken(String(team.team_key || '')),
          normalizeToken(String(team.name || '')),
        ].filter(Boolean);

        if (!homeTeamId && homeSlugN && candidates.includes(homeSlugN)) {
          homeTeamId = String(team.id || '');
        }
        if (!awayTeamId && awaySlugN && candidates.includes(awaySlugN)) {
          awayTeamId = String(team.id || '');
        }
      }
    }
  }

  return { homeTeamId, awayTeamId };
}

async function fetchFixtureTeamPlayers(args: {
  fixture: FixtureRow;
  home: MatchCentreTeam;
  away: MatchCentreTeam;
  homeTeamRow: TeamRow | null;
  awayTeamRow: TeamRow | null;
}): Promise<PlayerStatRow[]> {
  const { fixture, home, away, homeTeamRow, awayTeamRow } = args;
  const { homeTeamId, awayTeamId } = await resolveFixtureTeamIds(fixture, homeTeamRow, awayTeamRow);

  const orderedTeamIds = [homeTeamId, awayTeamId].filter(Boolean);
  let players = await fetchPlayersByTeamIds(orderedTeamIds);
  if (!players.length) {
    players = await fetchPlayersByTeamSlugs([
      String(fixture.home_team_slug || ''),
      String(fixture.away_team_slug || ''),
    ]);
  }
  if (!players.length) {
    players = await fetchPlayersByTeamNames([home.fullName, away.fullName]);
  }

  const teamOrder = new Map<string, number>();
  if (homeTeamId) teamOrder.set(homeTeamId, 0);
  if (awayTeamId) teamOrder.set(awayTeamId, 1);

  const rows = players.map((p) => {
    const teamId = String(p.team_id || '').trim();
    const rawTeamName = String((p as any).team_name || '').trim();
    const teamName =
      (teamId && teamId === homeTeamId ? home.fullName : '') ||
      (teamId && teamId === awayTeamId ? away.fullName : '') ||
      (rawTeamName && rawTeamName.toLowerCase() === home.fullName.toLowerCase() ? home.fullName : '') ||
      (rawTeamName && rawTeamName.toLowerCase() === away.fullName.toLowerCase() ? away.fullName : '') ||
      rawTeamName;

    const resolvedTeamName =
      teamName ||
      (teamId && teamId === String(homeTeamId || '') ? home.fullName : '') ||
      (teamId && teamId === String(awayTeamId || '') ? away.fullName : '');

    return {
      playerId: String(p.id),
      name: mergePlayerName(p),
      teamId,
      team: resolvedTeamName || home.fullName,
      number: safeNum(p.number),
      position: String(p.position || '').trim(),
      photoUrl: String(p.photo_url || p.headshot_url || '').trim() || undefined,
      D: null,
      K: null,
      H: null,
      M: null,
      T: null,
      CLR: null,
    } as PlayerStatRow;
  });

  rows.sort((a, b) => {
    const ao = teamOrder.has(a.teamId) ? safeNum(teamOrder.get(a.teamId)) : 999;
    const bo = teamOrder.has(b.teamId) ? safeNum(teamOrder.get(b.teamId)) : 999;
    if (ao !== bo) return ao - bo;
    if (a.number !== b.number) return a.number - b.number;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export async function fetchMatchCentre(matchId: string): Promise<MatchCentreModel> {
  if (!isUuidLike(matchId)) {
    throw new Error(`Unsupported match id: ${matchId}`);
  }

  const activeSeasonId = await resolveActiveSeasonId();

  const { data: fx, error: fxErr } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('id', matchId)
    .eq('season_id', activeSeasonId)
    .maybeSingle();

  if (fxErr) throw new Error(fxErr.message);
  if (!fx) throw new Error('Match not found.');

  const fixture = fx as unknown as FixtureRow;

  let homeTeamRow: TeamRow | null = null;
  let awayTeamRow: TeamRow | null = null;
  const teamIds = [fixture.home_team_id, fixture.away_team_id].filter(Boolean) as string[];
  if (teamIds.length > 0) {
    const { data: teamsById, error: teamsByIdErr } = await supabase
      .from('eg_teams')
      .select('id,team_key,slug,name,short_name,abbreviation,logo_url,primary_color,colour')
      .in('id', teamIds);

    if (teamsByIdErr) {
      console.warn('[matchCentreRepo] eg_teams by id failed:', teamsByIdErr.message);
    } else {
      const list = (teamsById || []) as unknown as TeamRow[];
      homeTeamRow = list.find((t) => String(t.id) === String(fixture.home_team_id)) ?? null;
      awayTeamRow = list.find((t) => String(t.id) === String(fixture.away_team_id)) ?? null;
    }
  }

  if (!homeTeamRow && fixture.home_team_slug) {
    const { data, error } = await supabase
      .from('eg_teams')
      .select('id,team_key,slug,name,short_name,abbreviation,logo_url,primary_color,colour')
      .eq('slug', fixture.home_team_slug)
      .maybeSingle();
    if (!error) homeTeamRow = (data as any) ?? null;
  }

  if (!awayTeamRow && fixture.away_team_slug) {
    const { data, error } = await supabase
      .from('eg_teams')
      .select('id,team_key,slug,name,short_name,abbreviation,logo_url,primary_color,colour')
      .eq('slug', fixture.away_team_slug)
      .maybeSingle();
    if (!error) awayTeamRow = (data as any) ?? null;
  }

  const homeSlug = String(homeTeamRow?.slug || fixture.home_team_slug || '').trim();
  const awaySlug = String(awayTeamRow?.slug || fixture.away_team_slug || '').trim();

  const homeKey = resolveTeamKey({ slug: homeSlug, teamKey: homeTeamRow?.team_key, name: homeTeamRow?.name });
  const awayKey = resolveTeamKey({ slug: awaySlug, teamKey: awayTeamRow?.team_key, name: awayTeamRow?.name });

  const homeName = resolveTeamName({ name: homeTeamRow?.name, shortName: homeTeamRow?.short_name, slug: homeSlug, teamKey: homeTeamRow?.team_key || homeKey });
  const awayName = resolveTeamName({ name: awayTeamRow?.name, shortName: awayTeamRow?.short_name, slug: awaySlug, teamKey: awayTeamRow?.team_key || awayKey });

  const homeShort = String(homeTeamRow?.short_name || homeTeamRow?.abbreviation || TEAM_ASSETS[homeKey]?.shortName || homeName);
  const awayShort = String(awayTeamRow?.short_name || awayTeamRow?.abbreviation || TEAM_ASSETS[awayKey]?.shortName || awayName);

  const hG = safeNum(fixture.home_goals);
  const hB = safeNum(fixture.home_behinds);
  const aG = safeNum(fixture.away_goals);
  const aB = safeNum(fixture.away_behinds);

  const hT = fixture.home_total ?? (hG * 6 + hB);
  const aT = fixture.away_total ?? (aG * 6 + aB);
  const margin = Math.abs(safeNum(hT) - safeNum(aT));

  const home: MatchCentreTeam = {
    id: homeTeamRow?.id || fixture.home_team_id || undefined,
    slug: homeSlug,
    key: homeKey,
    name: homeName,
    fullName: homeName,
    shortName: homeShort,
    abbreviation: String(homeShort || homeName).slice(0, 3).toUpperCase(),
    colour: teamColour(homeTeamRow, homeKey),
    color: teamColour(homeTeamRow, homeKey),
    logoUrl: teamLogo(homeTeamRow, homeKey),
    goals: hG,
    behinds: hB,
    score: safeNum(hT),
  };

  const away: MatchCentreTeam = {
    id: awayTeamRow?.id || fixture.away_team_id || undefined,
    slug: awaySlug,
    key: awayKey,
    name: awayName,
    fullName: awayName,
    shortName: awayShort,
    abbreviation: String(awayShort || awayName).slice(0, 3).toUpperCase(),
    colour: teamColour(awayTeamRow, awayKey),
    color: teamColour(awayTeamRow, awayKey),
    logoUrl: teamLogo(awayTeamRow, awayKey),
    goals: aG,
    behinds: aB,
    score: safeNum(aT),
  };

  const { data: submissions, error: subErr } = await supabase
    .from('submissions')
    .select('*')
    .eq('fixture_id', fixture.id)
    .order('created_at', { ascending: false });

  if (subErr) {
    console.warn('[matchCentreRepo] submissions fetch failed:', subErr.message);
  }

  const hasSubmissionData = (submissions || []).length > 0;

  let playerStats = await fetchFixtureTeamPlayers({
    fixture,
    home,
    away,
    homeTeamRow,
    awayTeamRow,
  });

  try {
    const statRows = await fetchFixturePlayerStats(fixture.id);
    if (statRows.length > 0) {
      const statPlayerIds = Array.from(new Set(statRows.map((r) => String(r.player_id || '').trim()).filter(Boolean)));
      const playersByIdRows = await fetchPlayersByIds(statPlayerIds);
      const playersById = new Map(playersByIdRows.map((p) => [String(p.id), p]));

      const playerById = new Map(playerStats.map((r) => [String(r.playerId), r]));

      for (const row of statRows) {
        const id = String(row.player_id || '').trim();
        if (!id) continue;

        const linkedPlayer = playersById.get(id);

        let target = playerById.get(id);
        if (!target) {
          const teamId = String(row.team_id || '').trim();
          target = {
            playerId: id,
            name: resolvePlayerDisplayName({
              name: linkedPlayer?.name,
              firstName: linkedPlayer?.first_name,
              lastName: linkedPlayer?.last_name,
            }),
            teamId,
            team:
              teamId === String(home.id || '') ? home.fullName :
              teamId === String(away.id || '') ? away.fullName :
              home.fullName,
            number: safeNum(linkedPlayer?.number),
            position: String(linkedPlayer?.position || '').trim(),
            photoUrl: linkedPlayer
              ? resolvePlayerPhotoUrl({
                  photoUrl: linkedPlayer.photo_url,
                  headshotUrl: linkedPlayer.headshot_url,
                  fallbackPath: 'elite-gaming-logo.png',
                })
              : undefined,
            D: null,
            K: null,
            H: null,
            M: null,
            T: null,
            CLR: null,
          };
          playerById.set(id, target);
          playerStats.push(target);
        } else if (linkedPlayer) {
          target.name = resolvePlayerDisplayName({
            name: linkedPlayer.name,
            firstName: linkedPlayer.first_name,
            lastName: linkedPlayer.last_name,
          });
          target.number = target.number || safeNum(linkedPlayer.number);
          target.position = target.position || String(linkedPlayer.position || '').trim();
          if (!target.photoUrl) {
            target.photoUrl = resolvePlayerPhotoUrl({
              photoUrl: linkedPlayer.photo_url,
              headshotUrl: linkedPlayer.headshot_url,
              fallbackPath: 'elite-gaming-logo.png',
            });
          }
          if (!target.teamId && linkedPlayer.team_id) {
            target.teamId = String(linkedPlayer.team_id || '');
          }
        }

        target.teamId = target.teamId || String(row.team_id || '');
        if (!target.team) {
          target.team = target.teamId === String(home.id || '') ? home.fullName : target.teamId === String(away.id || '') ? away.fullName : '';
        }

        target.D = row.disposals ?? target.D;
        target.K = row.kicks ?? target.K;
        target.H = row.handballs ?? target.H;
        target.M = row.marks ?? target.M;
        target.T = row.tackles ?? target.T;
        target.CLR = row.clearances ?? target.CLR;
      }
    }
  } catch (e) {
    console.warn('[matchCentreRepo] fetchFixturePlayerStats failed:', (e as any)?.message || e);
  }

  const teamOrder = new Map<string, number>([
    [String(home.id || fixture.home_team_id || ''), 0],
    [String(away.id || fixture.away_team_id || ''), 1],
  ]);

  playerStats.sort((a, b) => {
    const ao = teamOrder.has(a.teamId) ? safeNum(teamOrder.get(a.teamId)) : 999;
    const bo = teamOrder.has(b.teamId) ? safeNum(teamOrder.get(b.teamId)) : 999;
    if (ao !== bo) return ao - bo;
    if (a.number !== b.number) return a.number - b.number;
    return a.name.localeCompare(b.name);
  });

  const pickLeader = (teamName: string, key: 'D' | 'T' | 'CLR' | 'M') => {
    const list = playerStats.filter((p) => p.team === teamName);
    let best: PlayerStatRow | null = null;
    let bestVal = -1;
    for (const p of list) {
      const v = Number((p as any)[key] ?? 0);
      if (v > bestVal) {
        bestVal = v;
        best = p;
      }
    }
    return {
      value: Math.max(0, bestVal),
      player: best?.name || '—',
      team: teamName,
      photoUrl: best?.photoUrl,
      seasonAvg: null,
    };
  };

  const leaders: MatchLeaderCard[] = [
    { stat: 'DISPOSALS', home: pickLeader(home.fullName, 'D'), away: pickLeader(away.fullName, 'D') },
    { stat: 'TACKLES', home: pickLeader(home.fullName, 'T'), away: pickLeader(away.fullName, 'T') },
    { stat: 'CLEARANCES', home: pickLeader(home.fullName, 'CLR'), away: pickLeader(away.fullName, 'CLR') },
    { stat: 'MARKS', home: pickLeader(home.fullName, 'M'), away: pickLeader(away.fullName, 'M') },
  ];

  const teamStats: TeamStatRow[] = [
    {
      label: 'Disposals',
      homeMatch: playerStats.filter((p) => p.team === home.fullName).reduce((acc, p) => acc + safeNum(p.D), 0),
      awayMatch: playerStats.filter((p) => p.team === away.fullName).reduce((acc, p) => acc + safeNum(p.D), 0),
    },
    {
      label: 'Marks',
      homeMatch: playerStats.filter((p) => p.team === home.fullName).reduce((acc, p) => acc + safeNum(p.M), 0),
      awayMatch: playerStats.filter((p) => p.team === away.fullName).reduce((acc, p) => acc + safeNum(p.M), 0),
    },
    {
      label: 'Tackles',
      homeMatch: playerStats.filter((p) => p.team === home.fullName).reduce((acc, p) => acc + safeNum(p.T), 0),
      awayMatch: playerStats.filter((p) => p.team === away.fullName).reduce((acc, p) => acc + safeNum(p.T), 0),
    },
    {
      label: 'Clearances',
      homeMatch: playerStats.filter((p) => p.team === home.fullName).reduce((acc, p) => acc + safeNum(p.CLR), 0),
      awayMatch: playerStats.filter((p) => p.team === away.fullName).reduce((acc, p) => acc + safeNum(p.CLR), 0),
    },
  ].map((row) => ({ ...row, homeValue: row.homeMatch, awayValue: row.awayMatch }));

  const primarySubmission = (submissions || [])[0];
  const quarterProgression =
    parseQuarterProgressionFromOcrRaw(String((primarySubmission as any)?.ocr_raw_text || '')) ||
    ((hT > 0 || aT > 0) ? fallbackQuarterProgression(hT, aT) : undefined);

  const trust = computeMatchStatus({ fixture, submissions: submissions || [] });
  const moments = buildMoments(fixture, submissions || [], trust);

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    dateText: fmtDate(fixture.start_time),
    venue: fixture.venue || 'TBC',
    attendanceText: undefined,
    statusLabel: statusToLabel(fixture.status),
    dataConfidence: inferDataConfidence(fixture.status, submissions || []),
    trust,
    margin,

    home,
    away,

    leaders,
    teamStats,
    playerStats,
    moments,
    hasSubmissionData,
    quarterProgression,
  };
}

export async function fetchLatestMatchCentre(): Promise<MatchCentreModel> {
  const activeSeasonId = await resolveActiveSeasonId();
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('id,status,start_time,round')
    .eq('season_id', activeSeasonId)
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No fixtures found.');
  return fetchMatchCentre(String((data as any).id));
}
```

## src/pages/HomePage.tsx
```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Trophy } from 'lucide-react';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import SmartImg from '../components/SmartImg';
import { afl26LocalRounds } from '../data/afl26LocalRounds';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { supabase } from '../lib/supabaseClient';
import { TEAM_ASSETS, assetUrl, getTeamAssets, type TeamKey } from '../lib/teamAssets';
import type { AflMatch, AflRound } from '../data/afl26Supabase';
import type { StatLeaderCategory } from '../lib/stats-leaders-cache';

import '../styles/ladder.css';
import '../styles/stats-home.css';
import '../styles/home.css';

type HeroSource = 'coach' | 'fallback';
type HomeHero = {
  round: number;
  match: AflMatch;
  source: HeroSource;
  teamSlug?: string;
  teamLabel?: string;
};

type HomeState = {
  rounds: AflRound[];
  hero: HomeHero | null;
  featured: { round: number; match: AflMatch } | null;
  loadError: string | null;
};

type LadderPreviewRow = {
  id: TeamKey;
  pos: number;
  teamKey: TeamKey;
  teamName: string;
  played: number;
  points: number;
  percentage: number;
};

function normalizeSlug(s: string) {
  return String(s || '').trim().toLowerCase();
}

function prettifySlug(slug: string) {
  const s = normalizeSlug(slug);
  if (!s) return 'Your Team';
  const compact = s.replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    collingwoodmagpies: 'Collingwood',
    carltonblues: 'Carlton',
    adelaidecrows: 'Adelaide',
    brisbanelions: 'Brisbane',
    gwsgiants: 'GWS Giants',
    stkildasaints: 'St Kilda',
    westernbulldogs: 'Western Bulldogs',
    westcoasteagles: 'West Coast',
    portadelaidepower: 'Port Adelaide',
    northmelbournekangaroos: 'North Melbourne',
    goldcoastsuns: 'Gold Coast',
    geelongcats: 'Geelong',
    hawthornhawks: 'Hawthorn',
    richmondtigers: 'Richmond',
    sydneyswans: 'Sydney',
    melbournedemons: 'Melbourne',
    essendonbombers: 'Essendon',
    fremantledockers: 'Fremantle',
  };
  if (aliases[compact]) return aliases[compact];
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function slugToTeamKey(slug: string): TeamKey {
  const s = normalizeSlug(slug);
  const compact = s.replace(/[^a-z0-9]/g, '');
  const direct = s as TeamKey;
  if ((TEAM_ASSETS as any)[direct]) return direct;
  const aliases: Record<string, TeamKey> = {
    collingwoodmagpies: 'collingwood',
    carltonblues: 'carlton',
    adelaidecrows: 'adelaide',
    brisbanelions: 'brisbane',
    gwsgiants: 'gws',
    stkildasaints: 'stkilda',
    westernbulldogs: 'westernbulldogs',
    westcoasteagles: 'westcoast',
    portadelaidepower: 'portadelaide',
    northmelbournekangaroos: 'northmelbourne',
    goldcoastsuns: 'goldcoast',
    geelongcats: 'geelong',
    hawthornhawks: 'hawthorn',
    richmondtigers: 'richmond',
    sydneyswans: 'sydney',
    melbournedemons: 'melbourne',
    essendonbombers: 'essendon',
    fremantledockers: 'fremantle',
  };
  return aliases[compact] || ('unknown' as TeamKey);
}

function pickRoundOneTop(rounds: AflRound[]) {
  const r1 = rounds.find((r) => r.round === 1);
  const chosenRound = r1 || rounds[0];
  const match = chosenRound?.matches?.[0];
  if (!chosenRound || !match) return null;
  return { round: chosenRound.round, match };
}

function teamSlugCandidates(teamSlug: string) {
  const raw = normalizeSlug(teamSlug);
  const compact = raw.replace(/[^a-z0-9]/g, '');
  const first = raw.split(/[-_\\s]+/).filter(Boolean)[0] || raw;
  const candidates = new Set<string>([
    raw,
    compact,
    first,
    first.replace(/[^a-z0-9]/g, ''),
  ]);
  const aliasMap: Record<string, string[]> = {
    collingwoodmagpies: ['collingwood'],
    carltonblues: ['carlton'],
    adelaidecrows: ['adelaide'],
    brisbanelions: ['brisbane'],
    gwsgiants: ['gws'],
    stkildasaints: ['stkilda', 'stkilda-saints'],
    westcoasteagles: ['westcoast'],
    westernbulldogs: ['westernbulldogs', 'bulldogs'],
    portadelaidepower: ['portadelaide'],
    northmelbournekangaroos: ['northmelbourne'],
    goldcoastsuns: ['goldcoast'],
    geelongcats: ['geelong'],
    hawthornhawks: ['hawthorn'],
    sydneyswans: ['sydney'],
    melbournedemons: ['melbourne'],
    essendonbombers: ['essendon'],
    fremantledockers: ['fremantle'],
    richmondtigers: ['richmond'],
  };
  for (const v of aliasMap[compact] || []) {
    candidates.add(normalizeSlug(v));
    candidates.add(normalizeSlug(v).replace(/[^a-z0-9]/g, ''));
  }
  return Array.from(candidates).filter(Boolean);
}

function fixtureSlugMatchesTeam(fixtureSlug: string, candidates: string[]) {
  const a = normalizeSlug(fixtureSlug);
  const ac = a.replace(/[^a-z0-9]/g, '');
  return candidates.some((c) => {
    const cc = normalizeSlug(c).replace(/[^a-z0-9]/g, '');
    return a === c || ac === cc || a.startsWith(`${c}-`) || c.startsWith(`${a}-`);
  });
}

function findNextScheduledForTeam(rounds: AflRound[], teamSlug: string) {
  const candidates = teamSlugCandidates(teamSlug);
  for (const round of rounds) {
    for (const match of round.matches || []) {
      if (String(match.status).toUpperCase() !== 'SCHEDULED') continue;
      if (fixtureSlugMatchesTeam(match.home, candidates) || fixtureSlugMatchesTeam(match.away, candidates)) {
        return { round: round.round, match };
      }
    }
  }
  return null;
}

async function findNextScheduledForTeamDb(teamRef: string, seasonId: string): Promise<{ round: number; match: AflMatch } | null> {
  const candidates = teamSlugCandidates(teamRef);
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select([
      'id',
      'round',
      'status',
      'venue',
      'home_team_slug',
      'away_team_slug',
      'home_goals',
      'home_behinds',
      'home_total',
      'away_goals',
      'away_behinds',
      'away_total',
      'start_time',
    ].join(','))
    .eq('season_id', seasonId)
    .order('round', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) return null;
  const rows = (data || []) as any[];
  const row = rows.find((r) => {
    const status = String(r?.status || '').toUpperCase();
    if (status !== 'SCHEDULED') return false;
    return fixtureSlugMatchesTeam(String(r?.home_team_slug || ''), candidates) ||
      fixtureSlugMatchesTeam(String(r?.away_team_slug || ''), candidates);
  });
  if (!row) return null;

  const hg = Number(row.home_goals);
  const hb = Number(row.home_behinds);
  const ag = Number(row.away_goals);
  const ab = Number(row.away_behinds);
  const ht = Number.isFinite(Number(row.home_total)) ? Number(row.home_total) : (Number.isFinite(hg) && Number.isFinite(hb) ? hg * 6 + hb : undefined);
  const at = Number.isFinite(Number(row.away_total)) ? Number(row.away_total) : (Number.isFinite(ag) && Number.isFinite(ab) ? ag * 6 + ab : undefined);

  return {
    round: Number(row.round) || 1,
    match: {
      id: String(row.id),
      venue: row.venue ? String(row.venue) : undefined,
      status: String(row.status || 'SCHEDULED').toUpperCase() === 'FINAL' ? 'FINAL' : String(row.status || '').toUpperCase() === 'LIVE' ? 'LIVE' : 'SCHEDULED',
      home: String(row.home_team_slug || ''),
      away: String(row.away_team_slug || ''),
      homeScore: Number.isFinite(ht as number) ? { total: ht as number, goals: Number.isFinite(hg) ? hg : 0, behinds: Number.isFinite(hb) ? hb : 0 } : undefined,
      awayScore: Number.isFinite(at as number) ? { total: at as number, goals: Number.isFinite(ag) ? ag : 0, behinds: Number.isFinite(ab) ? ab : 0 } : undefined,
    },
  };
}

function toFixturePosterMatch(round: number, m: AflMatch, navigate: ReturnType<typeof useNavigate>): FixturePosterMatch {
  return {
    id: m.id,
    round,
    status: m.status,
    venue: m.venue,
    home: m.home as any,
    away: m.away as any,
    homeCoachName: m.homeCoachName,
    awayCoachName: m.awayCoachName,
    homePsn: m.homePsn,
    awayPsn: m.awayPsn,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    onMatchCentreClick: () => navigate(`/match-centre/${m.id}`),
  } as FixturePosterMatch;
}

function HomeCoachHeroCard({
  round,
  match,
  teamSlug,
}: {
  round: number;
  match: AflMatch;
  teamSlug?: string;
}) {
  const homeKey = slugToTeamKey(match.home);
  const awayKey = slugToTeamKey(match.away);
  const homeAsset = TEAM_ASSETS[homeKey];
  const awayAsset = TEAM_ASSETS[awayKey];
  const homeLogo = assetUrl(homeAsset.logoFile || homeAsset.logoPath);
  const awayLogo = assetUrl(awayAsset.logoFile || awayAsset.logoPath);

  const teamCandidates = teamSlug ? teamSlugCandidates(teamSlug) : [];
  const isMyHome = teamSlug ? fixtureSlugMatchesTeam(match.home, teamCandidates) : false;
  const isMyAway = teamSlug ? fixtureSlugMatchesTeam(match.away, teamCandidates) : false;
  const mySide = isMyHome ? 'HOME' : isMyAway ? 'AWAY' : null;
  const myTeamName = isMyHome ? homeAsset.name : isMyAway ? awayAsset.name : null;
  const oppTeamName = isMyHome ? awayAsset.name : isMyAway ? homeAsset.name : null;

  return (
    <div className="homeCoachCard" aria-label="Next match summary">
      <div className="homeCoachCard__top">
        <div className="homeCoachCard__chips">
          <span className="homeCoachChip">{`Round ${round}`}</span>
          <span className={`homeCoachChip homeCoachChip--status is-${String(match.status || 'SCHEDULED').toLowerCase()}`}>
            {String(match.status || 'SCHEDULED').replace('_', ' ')}
          </span>
          {mySide ? (
            <span className="homeCoachChip homeCoachChip--role">
              <Shield size={12} /> You are {mySide} coach
            </span>
          ) : null}
        </div>
      </div>

      <div className="homeCoachCard__matchup">
        <div className="homeCoachTeam">
          <div className="homeCoachTeam__logoWrap">
            <SmartImg className="homeCoachTeam__logo" src={homeLogo} alt={homeAsset.name} fallbackText={homeAsset.shortName?.slice(0,2) || 'H'} />
          </div>
          <div className="homeCoachTeam__name">{homeAsset.name}</div>
          <div className="homeCoachTeam__sub">{homeAsset.shortName}</div>
        </div>

        <div className="homeCoachMid">
          <div className="homeCoachMid__vs">VS</div>
          <div className="homeCoachMid__venue">{match.venue || 'Venue TBC'}</div>
          {myTeamName && oppTeamName ? (
            <div className="homeCoachMid__coachLine">{myTeamName} vs {oppTeamName}</div>
          ) : null}
        </div>

        <div className="homeCoachTeam">
          <div className="homeCoachTeam__logoWrap">
            <SmartImg className="homeCoachTeam__logo" src={awayLogo} alt={awayAsset.name} fallbackText={awayAsset.shortName?.slice(0,2) || 'A'} />
          </div>
          <div className="homeCoachTeam__name">{awayAsset.name}</div>
          <div className="homeCoachTeam__sub">{awayAsset.shortName}</div>
        </div>
      </div>

      <div className="homeCoachCard__bottom">
        <div className="homeCoachCard__coachTag">
          {mySide ? `${mySide} coach match` : 'Coach fixture preview'}
        </div>
      </div>
    </div>
  );
}

function totalOf(score?: { total: number; goals: number; behinds: number }) {
  return Number.isFinite(score?.total as number) ? Number(score!.total) : 0;
}

function buildLadderPreview(rounds: AflRound[]): LadderPreviewRow[] {
  const teams = new Map<TeamKey, { played: number; points: number; pf: number; pa: number }>();
  (Object.keys(TEAM_ASSETS) as TeamKey[]).forEach((k) => teams.set(k, { played: 0, points: 0, pf: 0, pa: 0 }));

  for (const round of rounds) {
    for (const m of round.matches || []) {
      if (String(m.status).toUpperCase() !== 'FINAL') continue;
      const hKey = slugToTeamKey(m.home);
      const aKey = slugToTeamKey(m.away);
      const home = teams.get(hKey)!;
      const away = teams.get(aKey)!;
      const hs = totalOf(m.homeScore);
      const as = totalOf(m.awayScore);

      home.played += 1;
      away.played += 1;
      home.pf += hs; home.pa += as;
      away.pf += as; away.pa += hs;

      if (hs > as) home.points += 4;
      else if (as > hs) away.points += 4;
      else { home.points += 2; away.points += 2; }
    }
  }

  return (Object.keys(TEAM_ASSETS) as TeamKey[])
    .map((key) => {
      const row = teams.get(key)!;
      const pct = row.pa > 0 ? (row.pf / row.pa) * 100 : 0;
      return {
        id: key,
        pos: 0,
        teamKey: key,
        teamName: TEAM_ASSETS[key].shortName || TEAM_ASSETS[key].name,
        played: row.played,
        points: row.points,
        percentage: pct,
      };
    })
    .sort((a, b) => (b.points - a.points) || (b.percentage - a.percentage) || a.teamName.localeCompare(b.teamName))
    .map((r, i) => ({ ...r, pos: i + 1 }))
    .slice(0, 4);
}

function hexToRgb(hex: string) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return { r: 245, g: 196, b: 0 };
  return { r, g, b };
}

function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function HomeLadderPreview({ rows, onOpen }: { rows: LadderPreviewRow[]; onOpen: () => void }) {
  return (
    <section className="homePanel homePanel--ladder" aria-label="Ladder preview">
      <div className="homePanel__head">
        <div className="homePanel__title">Ladder</div>
        <button type="button" className="homePanel__link" onClick={onOpen}>View All</button>
      </div>

      <div className="aflTable" data-mode="SUMMARY">
        <div className="aflHead">
          <div className="hPos">Pos</div>
          <div className="hClub">Club</div>
          <div className="hCols hCols--homePreview" data-mode="SUMMARY">
            <div className="h">P</div>
            <div className="h">Pts</div>
          </div>
        </div>

        <div className="aflList">
          {rows.map((entry) => {
            const t = TEAM_ASSETS[entry.teamKey] || {
              name: 'Unassigned',
              shortName: 'EG',
              colour: '#2a2f38',
              primary: '#2a2f38',
              logoPath: '',
              logoFile: '',
            };
            const logo = assetUrl(t.logoFile || t.logoPath);
            const cssVars = {
              ['--team' as any]: t.primary || t.colour,
              ['--teamA' as any]: rgba(t.primary || t.colour, 0.42),
              ['--teamB' as any]: rgba(t.primary || t.colour, 0.16),
              ['--teamLine' as any]: rgba(t.primary || t.colour, 0.34),
            } as React.CSSProperties;

            return (
              <div key={entry.id} className="egAflRow" style={cssVars}>
                <div className="cPos">{entry.pos}</div>
                <div className="cClub">
                  <div className="clubTint" aria-hidden="true" />
                  <div className="clubLogo">
                    <SmartImg className="logoImg" src={logo} alt={entry.teamName} />
                  </div>
                  <div className="clubName" title={entry.teamName}>{entry.teamName}</div>
                </div>
                <div className="cCols cCols--homePreview" data-mode="SUMMARY">
                  <div className="cell"><div className="k">P</div><div className="v">{entry.played}</div></div>
                  <div className="cell"><div className="k">Pts</div><div className="v vPts">{entry.points}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getInitials(name: string) {
  return String(name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function HomeGoalsPreview({ category, onOpen }: { category: StatLeaderCategory | null; onOpen: () => void }) {
  const leader = category?.top || null;
  const runners = (category?.others || []).slice(0, 3);

  const leaderTeamRef = leader?.teamResolved === false ? '' : (leader?.teamKey || leader?.teamName || '');
  const leaderTeamName = leader?.teamName || '';
  const teamAsset = leaderTeamRef
    ? getTeamAssets(leaderTeamRef)
    : {
        key: 'unknown',
        name: leaderTeamName || 'Unknown Team',
        primary: '#1f2937',
        primaryHex: '#1f2937',
        dark: '#111827',
        logo: '',
      };

  const leaderName = String(leader?.name || '—');
  const firstName = leaderName.split(' ')[0] || '';
  const lastName = leaderName.split(' ').slice(1).join(' ');
  const leaderValue = Number.isFinite(leader?.valueTotal as number) ? Number(leader!.valueTotal) : 0;

  return (
    <section className="homePanel homePanel--leaders" aria-label="Goals leaders preview">
      <div className="homePanel__head">
        <div className="homePanel__title">Player Stats</div>
        <button type="button" className="homePanel__link" onClick={onOpen}>View All</button>
      </div>

      <div className="eg-leader-card homeLeadersCard">
        <div
          className="eg-leader-hero"
          style={{ background: `linear-gradient(180deg, ${teamAsset.primary} 0%, ${teamAsset.dark} 100%)` }}
        >
          <div className="eg-leader-hero-overlay" />
          <div
            className="eg-leader-hero-glow"
            style={{ background: `radial-gradient(ellipse at 30% 90%, ${teamAsset.primaryHex}aa 0%, transparent 65%)` }}
          />
          {teamAsset.logo ? (
            <div className="eg-leader-team-logo"><img src={teamAsset.logo} alt={leaderTeamName || 'Team'} /></div>
          ) : null}

          <div className="eg-leader-stat-chip">GOALS</div>
          <div className="eg-leader-value"><span className="big-num">{leaderValue}</span></div>

          <div className="eg-leader-name">
            <div className="first">{firstName}</div>
            <div className="last">{lastName || firstName}</div>
            <div className="team-sub">{leaderTeamName || '—'}</div>
          </div>

          <div className="eg-leader-headshot">
            {leader?.photoUrl ? (
              <SmartImg src={leader.photoUrl} alt={leaderName} fallbackText={getInitials(leaderName)} />
            ) : (
              <div className="initials-fallback">{getInitials(leaderName)}</div>
            )}
          </div>
        </div>

        <div className="eg-runners">
          {runners.map((entry, idx) => (
            <div key={`${entry.id}-${idx}`} className="eg-runner-row">
              <span className="eg-runner-rank">{idx + 2}</span>
              <div className="eg-runner-avatar">
                {entry.photoUrl ? (
                  <SmartImg src={entry.photoUrl} alt={entry.name} fallbackText={getInitials(entry.name)} />
                ) : (
                  <span className="mini-initials">{getInitials(entry.name)}</span>
                )}
              </div>
              <div className="eg-runner-info">
                <span className="eg-runner-name">{entry.name}</span>
                {entry.teamName ? <span className="eg-runner-team">{entry.teamName}</span> : null}
              </div>
              <span className="eg-runner-val">{entry.valueTotal}</span>
            </div>
          ))}
        </div>

        <button className="eg-card-cta" onClick={onOpen}>
          Full Table <ArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  const [state, setState] = useState<HomeState>({
    rounds: afl26LocalRounds,
    hero: null,
    featured: pickRoundOneTop(afl26LocalRounds),
    loadError: null,
  });
  const [loadingHero, setLoadingHero] = useState(true);
  const [goalsCategory, setGoalsCategory] = useState<StatLeaderCategory | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHome() {
      try {
        const competitionKey = getStoredCompetitionKey();
        const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);
        const { data: seasonRow, error: seasonErr } = await supabase
          .from('eg_seasons')
          .select('id')
          .eq('slug', seasonSlug)
          .maybeSingle();
        if (seasonErr || !seasonRow?.id) {
          throw new Error(`Active season not found for slug "${seasonSlug}"`);
        }
        const activeSeasonId = String(seasonRow.id);

        const supabaseRoundsMod = await import('../data/afl26Supabase');
        const cachedRounds = supabaseRoundsMod.peekAfl26RoundsCache(seasonSlug);
        const roundsFetched = cachedRounds && cachedRounds.length
          ? cachedRounds
          : await supabaseRoundsMod.getAfl26RoundsFromSupabase({ seasonSlug });
        const rounds = roundsFetched && roundsFetched.length ? roundsFetched : afl26LocalRounds;

        let source: HeroSource = 'fallback';
        let teamSlug: string | undefined;
        let teamLabel: string | undefined;

        try {
          const sessionRes = await supabase.auth.getSession();
          const user = sessionRes.data.session?.user;

          if (user?.id) {
            let teamId: string | undefined;
            const profileById = await supabase
              .from('profiles')
              .select('team_id')
              .eq('id', user.id)
              .maybeSingle();
            teamId = (profileById.data as any)?.team_id as string | undefined;

            if (!teamId) {
              const profileByUserId = await supabase
                .from('profiles')
                .select('team_id')
                .eq('user_id', user.id)
                .maybeSingle();
              teamId = (profileByUserId.data as any)?.team_id as string | undefined;
            }

            if (teamId) {
              let slug: string | null = null;
              let teamKey: string | null = null;
              let teamName: string | null = null;

              const byId = await supabase
                .from('eg_teams')
                .select('id, slug, team_key, name')
                .eq('id', teamId)
                .maybeSingle();
              slug = (byId.data as any)?.slug || null;
              teamKey = (byId.data as any)?.team_key || null;
              teamName = (byId.data as any)?.name || null;

              if (!slug) {
                const bySlug = await supabase
                  .from('eg_teams')
                  .select('id, slug, team_key, name')
                  .eq('slug', teamId)
                  .maybeSingle();
                slug = (bySlug.data as any)?.slug || null;
                teamKey = teamKey || (bySlug.data as any)?.team_key || null;
                teamName = teamName || (bySlug.data as any)?.name || null;
              }

              const resolvedTeamRef = slug || teamKey || teamName;
              if (resolvedTeamRef) {
                teamSlug = resolvedTeamRef;
                teamLabel = prettifySlug(teamName || slug || teamKey || '');
                source = 'coach';
              }
            }
          }
        } catch {
          // stay on fallback hero
        }

        let heroPick =
          source === 'coach' && teamSlug
            ? findNextScheduledForTeam(rounds, teamSlug)
            : pickRoundOneTop(rounds);

        if (!heroPick && source === 'coach' && teamSlug) {
          heroPick = await findNextScheduledForTeamDb(teamSlug, activeSeasonId);
        }

        if (!heroPick) heroPick = pickRoundOneTop(rounds);

        const roundOneTop = pickRoundOneTop(rounds);
        const roundOne = rounds.find((r) => r.round === 1) || rounds[0];
        const matchOfRound =
          roundOne?.matches?.find((m) => String(m.status).toUpperCase() === 'LIVE') ||
          roundOne?.matches?.find((m) => String(m.status).toUpperCase() === 'FINAL') ||
          roundOne?.matches?.[0];
        const featured =
          matchOfRound && roundOne
            ? { round: roundOne.round, match: matchOfRound }
            : (roundOneTop || heroPick);

        if (!cancelled) {
          setState({
            rounds,
            hero: heroPick ? { round: heroPick.round, match: heroPick.match, source, teamSlug, teamLabel } : null,
            featured,
            loadError: null,
          });
        }
      } catch (e: any) {
        const rounds = afl26LocalRounds;
        const fallback = pickRoundOneTop(rounds);
        if (!cancelled) {
          setState({
            rounds,
            hero: fallback ? { round: fallback.round, match: fallback.match, source: 'fallback' } : null,
            featured: fallback,
            loadError: e?.message || 'Using local fixtures (Supabase unavailable).',
          });
        }
      } finally {
        if (!cancelled) setLoadingHero(false);
      }
    }

    loadHome();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leadersMod = await import('../lib/stats-leaders-cache');
      const cached = leadersMod.peekLeaderCategoriesCache('players') || [];
      const cachedGoals = cached.find((c) => c.statKey === 'goals') || null;
      if (!cancelled && cachedGoals) setGoalsCategory(cachedGoals);
      return leadersMod.fetchLeaderCategories('players');
    })()
      .then((categories) => {
        if (cancelled) return;
        const next = categories.find((c) => c.statKey === 'goals') || null;
        if (next) setGoalsCategory(next);
      })
      .catch(() => {
        // keep last good data on transient errors
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const heroPoster = useMemo(() => {
    if (!state.hero) return null;
    return toFixturePosterMatch(state.hero.round, state.hero.match, navigate);
  }, [state.hero, navigate]);

  const featuredPoster = useMemo(() => {
    if (!state.featured) return null;
    return toFixturePosterMatch(state.featured.round, state.featured.match, navigate);
  }, [state.featured, navigate]);

  const ladderRows = useMemo(() => buildLadderPreview(state.rounds || []), [state.rounds]);

  const heroTitle = state.hero?.source === 'coach' ? 'Your Next Match' : 'Next Match';
  const heroSub = state.hero?.source === 'coach'
    ? `Coach Portal • ${state.hero.teamLabel || 'Assigned Team'}`
    : 'Season One • AFL 26';

  const heroVenue = state.hero?.match?.venue || 'Venue TBC';
  const heroStatus = state.hero?.match?.status || 'SCHEDULED';
  const heroRoute = state.hero?.match?.id ? `/match-centre/${state.hero.match.id}` : '/fixtures';

  return (
    <div className="homePage">
      <div className="homeShell">
        <section className="homeSection">
          <div className="homeSection__head">
            <div>
              <div className="homeSection__kicker">Competitions</div>
              <div className="homeSection__title">Seasons</div>
            </div>
          </div>

          <div className="homeSeasonRail" aria-label="Seasons">
            <button type="button" className="homeSeasonCard homeSeasonCard--preseason" onClick={() => navigate('/preseason/register')}>
              <div className="homeSeasonCard__row">
                <div className="homeSeasonCard__tag homeSeasonCard__tag--green">REGISTRATION OPEN</div>
                <div className="homeSeasonCard__state">New</div>
              </div>
              <div className="homeSeasonCard__body">
                <div className="homeSeasonCard__iconWrap"><Trophy size={26} /></div>
                <div>
                  <div className="homeSeasonCard__title">Knockout Preseason Cup</div>
                  <div className="homeSeasonCard__sub">10 teams • Fast knockout format</div>
                </div>
              </div>
              <div className="homeSeasonCard__foot">Open preseason registration <ArrowRight size={15} /></div>
            </button>

            <button type="button" className="homeSeasonCard homeSeasonCard--afl" onClick={() => navigate('/fixtures')}>
              <div className="homeSeasonCard__row">
                <div className="homeSeasonCard__tag">AFL 26</div>
                <div className="homeSeasonCard__state">Coming Soon</div>
              </div>
              <div className="homeSeasonCard__body">
                <SmartImg className="homeSeasonCard__logo" src={assetUrl('afl26-logo.png')} alt="AFL 26" fallbackText="AFL" />
                <div>
                  <div className="homeSeasonCard__title">AFL 26</div>
                  <div className="homeSeasonCard__sub">Season Two • Coming Soon</div>
                </div>
              </div>
              <div className="homeSeasonCard__foot">Elite Gaming major season <ArrowRight size={15} /></div>
            </button>
          </div>
        </section>

        <section className="homeHero" aria-label="Your next match">
          <div className="homeHero__bgGlow" aria-hidden="true" />
          <div className="homeHero__content">
            <div className="homeHero__eyebrow">{heroSub}</div>
            <h1 className="homeHero__title">{heroTitle}</h1>
            <p className="homeHero__meta">
              {state.hero ? `Round ${state.hero.round} • ${heroStatus} • ${heroVenue}` : 'Loading match details…'}
            </p>

            {state.loadError ? <div className="homeNotice">{state.loadError}</div> : null}

            {state.hero ? (
              <div className="homeHero__fixtureWrap">
                <HomeCoachHeroCard round={state.hero.round} match={state.hero.match} teamSlug={state.hero.teamSlug} />
              </div>
            ) : (
              <div className="homeHero__placeholder">{loadingHero ? 'Loading your next match…' : 'No fixture available yet.'}</div>
            )}

            <div className="homeHero__actions">
              <button type="button" className="homeBtn homeBtn--primary" onClick={() => navigate(heroRoute)}>
                Match Centre <ArrowRight size={16} />
              </button>
              <button type="button" className="homeBtn homeBtn--ghost" onClick={() => navigate('/fixtures')}>
                View all fixtures
              </button>
            </div>
          </div>
        </section>

        <section className="homeSection">
          <div className="homeSection__head">
            <div>
              <div className="homeSection__kicker">Match of the Round</div>
              <div className="homeSection__title">Fixture Preview</div>
            </div>
          </div>
          {featuredPoster ? (
            <div className="homeFeaturedCard">
              <FixturePosterCard m={featuredPoster} />
            </div>
          ) : (
            <div className="homeEmpty">No fixture available.</div>
          )}
        </section>

        <section className="homeSection">
          <div className="homeSection__head">
            <div>
              <div className="homeSection__kicker">Season Snapshots</div>
              <div className="homeSection__title">Ladder + Player Stats</div>
            </div>
          </div>

          <div className="homePreviewGrid">
            <HomeLadderPreview rows={ladderRows} onOpen={() => navigate('/ladder')} />
            <HomeGoalsPreview
              category={goalsCategory}
              onOpen={() => navigate('/stats3/leaders?mode=players&stat=goals&scope=total')}
            />
          </div>
        </section>

        <div className="homeBottomSpace" />
      </div>
    </div>
  );
}
```

## src/pages/SubmitPage.tsx
```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Shield,
  Trophy,
  Upload,
  User,
  Wand2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabaseClient';
import { TEAM_COLORS, TEAM_SHORT_NAMES } from '../data/teamColors';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { resolvePlayerDisplayName, resolvePlayerPhotoUrl, resolveTeamLogoUrl, resolveTeamName } from '@/lib/entityResolvers';
import '../styles/submitPage.css';

type NextFixturePayload = {
  fixture: {
    id: string;
    round: number;
    venue: string;
    status: string;
    seasonId?: string;
    startTime?: string;
  };
  homeTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
  awayTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
} | null;

type OcrState =
  | { status: 'idle' }
  | { status: 'ocr_running'; step: string; progress01: number }
  | { status: 'done'; rawText: string; teamStats: Record<string, number>; playerLines: string[] }
  | { status: 'timeout'; error: string }
  | { status: 'error'; message: string };

type Step = 1 | 2 | 3 | 4 | 5;

type PlayerLite = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  number?: number;
  position?: string;
  photoUrl?: string;
};

type DraftPayload = {
  venue: string;
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
  homeGoalMap: Record<string, number>;
  awayGoalMap: Record<string, number>;
  notes: string;
  currentStep: Step;
  ocrConfirm: boolean;
  uploadedMeta: Array<{ name: string; size: number }>;
  savedAt: number;
};

const STEP_LABELS: Record<Step, string> = {
  1: 'Fixture',
  2: 'Score',
  3: 'Kickers',
  4: 'Upload',
  5: 'Review',
};

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(v: any) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bytesToKb(n: number) {
  return Math.max(1, Math.round((n || 0) / 1024));
}

function parseTeamStatsFromText(raw: string) {
  const keys = [
    'DISPOSALS',
    'KICKS',
    'HANDBALLS',
    'MARKS',
    'TACKLES',
    'INSIDE 50',
    'CLEARANCES',
    'HITOUTS',
    'CONTESTED POSSESSIONS',
    'UNCONTESTED POSSESSIONS',
    'CLANGERS',
    'TURNOVERS',
  ];

  const out: Record<string, number> = {};
  const text = raw.toUpperCase();

  for (const k of keys) {
    const re = new RegExp(`${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\\\$&')}\\s*[:\\-]?\\s*(\\d{1,3})`, 'i');
    const m = text.match(re);
    if (m?.[1]) out[k] = safeNum(m[1]);
  }

  return out;
}

function parsePlayerLinesFromText(raw: string) {
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const l of lines) {
    if (/^[A-Z][A-Z '\-.]{2,}\s+\d{1,3}$/i.test(l)) out.push(l);
    else if (/^[A-Z][A-Z '\-.]{2,}.*\s\d{1,3}$/i.test(l) && /\d{1,3}$/.test(l)) out.push(l);
  }

  return out.slice(0, 50);
}

async function runTesseract(files: File[], onProgress: (step: string, progress01: number) => void) {
  const GLOBAL_TIMEOUT_MS = 20000;

  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string) => {
    return await new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      p.then(
        (v) => {
          window.clearTimeout(t);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(t);
          reject(e);
        },
      );
    });
  };

  return await withTimeout(
    (async () => {
      const mod: any = await import('tesseract.js');
      const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
      if (!createWorker) throw new Error('tesseract.js not available');

      const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
      const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
      const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

      const logger = (m: any) => {
        if (!m?.status) return;
        const status = String(m.status);
        const p = typeof m.progress === 'number' ? clamp(m.progress, 0, 1) : 0;
        if (status.includes('loading')) onProgress('Preparing OCR…', Math.max(0.05, p));
        else if (status.includes('initializ')) onProgress('Reading screenshot…', Math.max(0.1, p));
        else if (status.includes('recogniz')) onProgress('Extracting team stats…', Math.max(0.2, p));
        else onProgress(status, p);
      };

      onProgress('Preparing OCR…', 0.01);

      let worker: any;
      try {
        worker = await createWorker({ logger, workerPath, corePath, langPath });
      } catch {
        worker = await createWorker('eng', 1, { logger, workerPath, corePath, langPath });
      }

      try {
        if (worker?.loadLanguage) await withTimeout(worker.loadLanguage('eng'), 60000, 'loadLanguage');
        if (worker?.initialize) await withTimeout(worker.initialize('eng'), 60000, 'initialize');

        let combined = '';
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          const base = i / Math.max(1, files.length);
          onProgress(`Reading screenshot ${i + 1} of ${files.length}`, clamp(base, 0.15, 0.9));
          const res = await withTimeout(worker.recognize(f), 120000, `recognize(${f.name})`);
          const text = (res as any)?.data?.text ?? '';
          combined += `\n\n--- ${f.name} ---\n${text}`;
        }

        onProgress('Ready to review', 0.98);
        return combined.trim();
      } finally {
        try {
          await worker.terminate();
        } catch {
          // ignore
        }
      }
    })(),
    GLOBAL_TIMEOUT_MS,
    'Overall OCR processing',
  );
}

function resolveTeamLogo(teamName: string, logo?: string) {
  const fallback = TEAM_COLORS[teamName]?.logo || 'elite-gaming-logo.png';
  return resolveTeamLogoUrl({
    logoUrl: logo,
    name: teamName,
    fallbackPath: fallback,
  });
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
  if (firstWord.length <= 12) return firstWord;
  return `${firstWord.slice(0, 11)}…`;
}

function normalizeToken(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function buildDraftKey(userId?: string | null, fixtureId?: string | null) {
  const comp = getStoredCompetitionKey();
  return `eg_submit_draft:${comp}:${userId || 'guest'}:${fixtureId || 'none'}`;
}

function getCompetitionLabel() {
  const key = getStoredCompetitionKey();
  return key === 'preseason' ? 'Preseason' : 'AFL26';
}

function formatSavedAt(ts: number | null) {
  if (!ts) return '';
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function SubmitPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myCoachName, setMyCoachName] = useState<string | null>(null);

  const [payload, setPayload] = useState<NextFixturePayload>(null);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [venue, setVenue] = useState('');

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');

  const [homeGoalMap, setHomeGoalMap] = useState<Record<string, number>>({});
  const [awayGoalMap, setAwayGoalMap] = useState<Record<string, number>>({});
  const [searchSide, setSearchSide] = useState<'home' | 'away' | 'both'>('both');
  const [playerSearch, setPlayerSearch] = useState('');

  const [notes, setNotes] = useState('');

  const [allPlayers, setAllPlayers] = useState<PlayerLite[]>([]);
  const [playerLoadErr, setPlayerLoadErr] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<Array<{ id: string; file: File; name: string; size: number; previewUrl: string }>>([]);
  const [ocr, setOcr] = useState<OcrState>({ status: 'idle' });
  const [ocrConfirm, setOcrConfirm] = useState(false);
  const [showOcrText, setShowOcrText] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<null | { message: string }>(null);

  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  const fixture = payload?.fixture || null;
  const homeTeam = payload?.homeTeam || null;
  const awayTeam = payload?.awayTeam || null;
  const homeDisplayName = useMemo(
    () => deriveShortName(homeTeam?.name || '', homeTeam?.shortName),
    [homeTeam?.name, homeTeam?.shortName],
  );
  const awayDisplayName = useMemo(
    () => deriveShortName(awayTeam?.name || '', awayTeam?.shortName),
    [awayTeam?.name, awayTeam?.shortName],
  );

  const homeGoalsN = useMemo(() => safeNum(homeGoals), [homeGoals]);
  const homeBehindsN = useMemo(() => safeNum(homeBehinds), [homeBehinds]);
  const awayGoalsN = useMemo(() => safeNum(awayGoals), [awayGoals]);
  const awayBehindsN = useMemo(() => safeNum(awayBehinds), [awayBehinds]);

  const homeScore = useMemo(() => homeGoalsN * 6 + homeBehindsN, [homeGoalsN, homeBehindsN]);
  const awayScore = useMemo(() => awayGoalsN * 6 + awayBehindsN, [awayGoalsN, awayBehindsN]);

  const kickoffLabel = useMemo(() => formatKickoff(fixture?.startTime), [fixture?.startTime]);

  const homeTeamColors = useMemo(() => {
    if (!homeTeam?.name) return { r: '0', g: '0', b: '0' };
    const colors = TEAM_COLORS[homeTeam.name];
    if (!colors) return { r: '0', g: '0', b: '0' };
    const match = colors.glow.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [homeTeam?.name]);

  const awayTeamColors = useMemo(() => {
    if (!awayTeam?.name) return { r: '0', g: '0', b: '0' };
    const colors = TEAM_COLORS[awayTeam.name];
    if (!colors) return { r: '0', g: '0', b: '0' };
    const match = colors.glow.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [awayTeam?.name]);

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
        if (!uid) throw new Error('Not signed in.');
        if (!alive) return;

        setSessionUserId(uid);
        setSessionEmail(email);

        const { data: profile, error: pErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!profile?.team_id) throw new Error('This account is not linked to a team yet.');
        if (!alive) return;

        setMyTeamId(profile.team_id);
        setMyCoachName(profile.display_name || profile.psn || 'Coach');

        const activeComp = getStoredCompetitionKey();
        const seasonSlug = getDataSeasonSlugForCompetition(activeComp);
        const { data: seasonRow, error: seasonErr } = await supabase
          .from('eg_seasons')
          .select('id')
          .eq('slug', seasonSlug)
          .maybeSingle();
        if (seasonErr || !seasonRow?.id) {
          throw new Error(`Active season not found for slug "${seasonSlug}"`);
        }
        const activeSeasonId = String(seasonRow.id);

        const { data: fixtures, error: fxErr } = await supabase
          .from('eg_fixtures')
          .select('id, round, status, venue, season_id, start_time, home_team_id, away_team_id, home_goals, home_behinds, away_goals, away_behinds')
          .eq('season_id', activeSeasonId)
          .eq('home_team_id', profile.team_id)
          .neq('status', 'FINAL')
          .order('round', { ascending: true })
          .limit(1);
        if (fxErr) throw fxErr;

        if (!fixtures || fixtures.length === 0) {
          if (alive) {
            setPayload(null);
            setVenue('');
          }
          return;
        }

        const fx = fixtures[0] as any;

        const [{ data: homeTeamData, error: homeErr }, { data: awayTeamData, error: awayErr }] = await Promise.all([
          supabase.from('eg_teams').select('*').eq('id', fx.home_team_id).maybeSingle(),
          supabase.from('eg_teams').select('*').eq('id', fx.away_team_id).maybeSingle(),
        ]);

        if (homeErr || awayErr) throw new Error('Failed to load team info');
        if (!alive) return;

        const homeName = resolveTeamName({
          name: homeTeamData?.name,
          shortName: homeTeamData?.short_name,
          slug: homeTeamData?.slug,
          teamKey: homeTeamData?.team_key,
        });
        const awayName = resolveTeamName({
          name: awayTeamData?.name,
          shortName: awayTeamData?.short_name,
          slug: awayTeamData?.slug,
          teamKey: awayTeamData?.team_key,
        });

        const nextPayload: NextFixturePayload = {
          fixture: {
            id: String(fx.id),
            round: safeNum(fx.round),
            venue: String(fx.venue || 'TBC'),
            status: String(fx.status || 'SCHEDULED'),
            seasonId: fx.season_id ? String(fx.season_id) : undefined,
            startTime: fx.start_time ? String(fx.start_time) : undefined,
          },
          homeTeam: {
            id: String(homeTeamData?.id || fx.home_team_id),
            name: homeName,
            shortName: deriveShortName(homeName, homeTeamData?.short_name || TEAM_SHORT_NAMES[homeName]),
            logo: resolveTeamLogo(homeName, homeTeamData?.logo_url || undefined),
            teamKey: homeTeamData?.team_key || undefined,
          },
          awayTeam: {
            id: String(awayTeamData?.id || fx.away_team_id),
            name: awayName,
            shortName: deriveShortName(awayName, awayTeamData?.short_name || TEAM_SHORT_NAMES[awayName]),
            logo: resolveTeamLogo(awayName, awayTeamData?.logo_url || undefined),
            teamKey: awayTeamData?.team_key || undefined,
          },
        };

        setPayload(nextPayload);
        setVenue(nextPayload.fixture.venue || '');
      } catch (e: any) {
        console.error('[Submit] load failed:', e);
        if (!alive) return;
        setLoadError(e?.message || 'Failed to load submit page.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!homeTeam?.id || !awayTeam?.id) return;
      try {
        const selectAttempts = [
          'id,name,display_name,full_name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
          'id,name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
          'id,name,team_id,team_name,position,number,headshot_url,photo_url',
        ] as const;

        let rawPlayers: any[] = [];
        let loaded = false;
        for (const select of selectAttempts) {
          const result = await supabase.from('eg_players').select(select).limit(5000);
          if (result.error) {
            if (!String(result.error.message || '').toLowerCase().includes('column')) {
              throw result.error;
            }
            continue;
          }
          rawPlayers = (result.data || []) as any[];
          loaded = true;
          break;
        }

        if (!loaded) throw new Error('Failed to load player data from Supabase');

        const homeKey = normalizeToken(homeTeam.teamKey || homeTeam.name);
        const awayKey = normalizeToken(awayTeam.teamKey || awayTeam.name);
        const homeNameToken = normalizeToken(homeTeam.name);
        const awayNameToken = normalizeToken(awayTeam.name);

        const rows = rawPlayers.map((p) => {
          const teamId = String(p.team_id || '').trim();
          const teamNameRaw = String(p.team_name || '').trim();
          const teamKeyRaw = String(p.team_key || '').trim();
          const fullName = resolvePlayerDisplayName({
            name: p.name,
            displayName: p.display_name,
            fullName: p.full_name,
          });

          let side: 'home' | 'away' | 'unlinked' = 'unlinked';
          if (teamId && teamId === String(homeTeam.id)) side = 'home';
          else if (teamId && teamId === String(awayTeam.id)) side = 'away';
          else {
            const token = normalizeToken(teamKeyRaw || teamNameRaw);
            if (token && (token === homeKey || token === homeNameToken)) side = 'home';
            else if (token && (token === awayKey || token === awayNameToken)) side = 'away';
          }

          const resolvedTeamName =
            side === 'home' ? homeTeam.name : side === 'away' ? awayTeam.name : 'All players (team not linked)';

          return {
            id: String(p.id || uuid()),
            name: fullName,
            teamId,
            teamName: resolvedTeamName,
            number: safeNum(p.number),
            position: String(p.position || ''),
            photoUrl: resolvePlayerPhotoUrl({
              photoUrl: p.photo_url,
              headshotUrl: p.headshot_url,
              fallbackPath: 'elite-gaming-logo.png',
            }),
          } as PlayerLite;
        });

        if (!alive) return;
        setAllPlayers(rows);
        setPlayerLoadErr(null);
      } catch (e: any) {
        if (!alive) return;
        setAllPlayers([]);
        setPlayerLoadErr(e?.message || 'Failed to load player data from Supabase');
      }
    })();

    return () => {
      alive = false;
    };
  }, [homeTeam?.id, homeTeam?.name, awayTeam?.id, awayTeam?.name]);

  useEffect(() => {
    const draftKey = buildDraftKey(sessionUserId, fixture?.id);
    if (!sessionUserId || !fixture?.id) return;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftPayload;
      if (!draft || typeof draft !== 'object') return;

      setVenue(String(draft.venue || fixture.venue || ''));
      setHomeGoals(String(draft.homeGoals || ''));
      setHomeBehinds(String(draft.homeBehinds || ''));
      setAwayGoals(String(draft.awayGoals || ''));
      setAwayBehinds(String(draft.awayBehinds || ''));
      setHomeGoalMap(draft.homeGoalMap || {});
      setAwayGoalMap(draft.awayGoalMap || {});
      setNotes(String(draft.notes || ''));
      setCurrentStep((draft.currentStep as Step) || 1);
      setOcrConfirm(!!draft.ocrConfirm);
      setDraftSavedAt(Number(draft.savedAt) || null);
    } catch {
      // ignore malformed draft
    }
  }, [sessionUserId, fixture?.id, fixture?.venue]);

  useEffect(() => {
    if (!sessionUserId || !fixture?.id) return;
    const draftKey = buildDraftKey(sessionUserId, fixture.id);

    const payload: DraftPayload = {
      venue,
      homeGoals,
      homeBehinds,
      awayGoals,
      awayBehinds,
      homeGoalMap,
      awayGoalMap,
      notes,
      currentStep,
      ocrConfirm,
      uploadedMeta: uploaded.map((u) => ({ name: u.name, size: u.size })),
      savedAt: Date.now(),
    };

    const t = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(payload));
      setDraftSavedAt(payload.savedAt);
    }, 250);

    return () => window.clearTimeout(t);
  }, [
    sessionUserId,
    fixture?.id,
    venue,
    homeGoals,
    homeBehinds,
    awayGoals,
    awayBehinds,
    homeGoalMap,
    awayGoalMap,
    notes,
    currentStep,
    ocrConfirm,
    uploaded,
  ]);

  useEffect(() => {
    return () => {
      uploaded.forEach((u) => {
        try {
          URL.revokeObjectURL(u.previewUrl);
        } catch {
          // ignore
        }
      });
    };
  }, [uploaded]);

  const homePlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === homeTeam?.name)
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers, homeTeam?.name],
  );
  const awayPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === awayTeam?.name)
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers, awayTeam?.name],
  );

  const unlinkedPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === 'All players (team not linked)')
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers],
  );

  const mergedPlayerList = useMemo(() => {
    const source = [
      ...(searchSide === 'home' || searchSide === 'both' ? homePlayers : []),
      ...(searchSide === 'away' || searchSide === 'both' ? awayPlayers : []),
      ...(searchSide === 'both' ? unlinkedPlayers : []),
    ];
    const q = playerSearch.trim().toLowerCase();
    const filtered = q
      ? source.filter((p) => p.name.toLowerCase().includes(q) || String(p.number || '').includes(q))
      : source;
    return filtered.sort((a, b) => {
      const aSide = a.teamName === homeTeam?.name ? 'home' : 'away';
      const bSide = b.teamName === homeTeam?.name ? 'home' : 'away';
      const aGoals = aSide === 'home' ? safeNum(homeGoalMap[a.id]) : safeNum(awayGoalMap[a.id]);
      const bGoals = bSide === 'home' ? safeNum(homeGoalMap[b.id]) : safeNum(awayGoalMap[b.id]);
      return bGoals - aGoals || (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name);
    });
  }, [searchSide, homePlayers, awayPlayers, unlinkedPlayers, playerSearch, homeTeam?.name, homeGoalMap, awayGoalMap]);

  const topScorers = useMemo(() => {
    const out: Array<{ id: string; name: string; goals: number; team: 'home' | 'away'; photoUrl?: string }> = [];
    for (const p of homePlayers) {
      const g = safeNum(homeGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'home', photoUrl: p.photoUrl });
    }
    for (const p of awayPlayers) {
      const g = safeNum(awayGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'away', photoUrl: p.photoUrl });
    }
    return out.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 3);
  }, [homePlayers, awayPlayers, homeGoalMap, awayGoalMap]);

  const homeGoalKickers = useMemo(
    () => homePlayers
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(homeGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [homePlayers, homeGoalMap],
  );

  const awayGoalKickers = useMemo(
    () => awayPlayers
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(awayGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [awayPlayers, awayGoalMap],
  );

  const canRunOcr = useMemo(() => uploaded.length > 0 && ocr.status !== 'ocr_running', [uploaded.length, ocr.status]);

  const isStep2Valid = useMemo(() => homeGoals !== '' && homeBehinds !== '' && awayGoals !== '' && awayBehinds !== '', [homeGoals, homeBehinds, awayGoals, awayBehinds]);
  const isStep3Valid = useMemo(() => isStep2Valid, [isStep2Valid]);
  const isStep4Valid = useMemo(() => uploaded.length > 0, [uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId || isSubmitting) return false;
    if (!isStep2Valid || !uploaded.length) return false;
    if (ocr.status !== 'done' && ocr.status !== 'idle') return false;
    if (ocr.status === 'done' && !ocrConfirm) return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, isStep2Valid, uploaded.length, ocr.status, ocrConfirm]);

  const getStatusChip = () => {
    if (submitSuccess) return { label: 'Submitted', tone: 'success' as const };
    if (draftSavedAt) return { label: 'Draft saved', tone: 'muted' as const };
    return { label: 'Ready to submit', tone: 'warning' as const };
  };

  const statusChip = getStatusChip();
  const competitionLabel = getCompetitionLabel();
  const draftSavedLabel = formatSavedAt(draftSavedAt);

  const canGoToStep = (step: Step) => {
    if (step <= 2) return true;
    if (step === 3) return isStep2Valid;
    if (step === 4) return isStep3Valid;
    if (step === 5) return isStep4Valid;
    return false;
  };

  const setPlayerGoals = (side: 'home' | 'away', playerId: string, next: number) => {
    const val = clamp(next, 0, 99);
    if (side === 'home') {
      setHomeGoalMap((prev) => {
        if (val <= 0) {
          const copy = { ...prev };
          delete copy[playerId];
          return copy;
        }
        return { ...prev, [playerId]: val };
      });
    } else {
      setAwayGoalMap((prev) => {
        if (val <= 0) {
          const copy = { ...prev };
          delete copy[playerId];
          return copy;
        }
        return { ...prev, [playerId]: val };
      });
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const next = files.map((f) => ({
      id: uuid(),
      file: f,
      name: f.name,
      size: f.size,
      previewUrl: URL.createObjectURL(f),
    }));

    setUploaded((prev) => [...prev, ...next]);
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setUploaded((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
  };

  const runOcr = async () => {
    if (!canRunOcr) return;
    setOcr({ status: 'ocr_running', step: 'Preparing OCR…', progress01: 0.02 });
    setConflict(null);

    try {
      const rawText = await runTesseract(uploaded.map((u) => u.file), (step, p) => {
        setOcr({ status: 'ocr_running', step, progress01: p });
      });

      const teamStats = parseTeamStatsFromText(rawText);
      const playerLines = parsePlayerLinesFromText(rawText);
      setOcr({ status: 'done', rawText, teamStats, playerLines });
      setOcrConfirm(false);
    } catch (e: any) {
      const msg = e?.message || 'OCR failed';
      if (msg.includes('timed out')) {
        setOcr({ status: 'timeout', error: 'OCR took too long (20 seconds). Retry or continue with manual verification.' });
      } else {
        setOcr({ status: 'error', message: msg });
      }
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId || !canSubmit) return;
    setIsSubmitting(true);
    setConflict(null);

    try {
      const ocrPayload = ocr.status === 'done' ? {
        rawText: ocr.rawText,
        teamStats: ocr.teamStats,
        playerLines: ocr.playerLines,
      } : null;

      const { error: rpcErr } = await supabase.rpc('eg_submit_result_home_only', {
        p_fixture_id: fixture.id,
        p_home_goals: homeGoalsN,
        p_home_behinds: homeBehindsN,
        p_away_goals: awayGoalsN,
        p_away_behinds: awayBehindsN,
        p_venue: venue || null,
        p_goal_kickers_home: homeGoalKickers.length ? JSON.stringify(homeGoalKickers) : null,
        p_goal_kickers_away: awayGoalKickers.length ? JSON.stringify(awayGoalKickers) : null,
        p_ocr: ocrPayload ? JSON.stringify(ocrPayload) : null,
        p_notes: notes || null,
      });

      if (rpcErr) {
        setConflict({ message: rpcErr.message || 'Submit failed.' });
        return;
      }

      const draftKey = buildDraftKey(sessionUserId, fixture.id);
      window.localStorage.removeItem(draftKey);
      setSubmitSuccess(true);
    } catch (e: any) {
      setConflict({ message: e?.message || 'Submit failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">Loading Match Day Console…</div>
              <div className="mdcLoading__sub">Fetching your next fixture</div>
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
              <div className="mdcLoading__sub">{loadError || 'No upcoming home fixture was found for your team.'}</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
              <div className="mdcHero__chips">
                <span className="mdcChip">Round {fixture.round}</span>
                <span className="mdcChip">{competitionLabel}</span>
                <span className={`mdcChip mdcChip--${statusChip.tone}`}>{statusChip.label}</span>
              </div>
              <div className="mdcCoachPill">
                <Shield size={13} />
                <span>
                  Signed in as: {sessionEmail || myCoachName || 'coach'}
                  {draftSavedLabel ? ` • Draft ${draftSavedLabel}` : ''}
                </span>
              </div>
            </div>

            <div className="mdcHero__match">
              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">
                  {homeTeam.logo ? <img src={homeTeam.logo} alt={homeTeam.name} /> : <span>{homeTeam.name.slice(0, 1)}</span>}
                </div>
                <div className="mdcTeamBlock__name" title={homeTeam.name}>{homeDisplayName}</div>
              </div>

              <div className="mdcHero__center">
                <div className="mdcHero__vs">VS</div>
                <div className="mdcHero__meta">{venue || 'TBC'} • {kickoffLabel}</div>
              </div>

              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">
                  {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <span>{awayTeam.name.slice(0, 1)}</span>}
                </div>
                <div className="mdcTeamBlock__name" title={awayTeam.name}>{awayDisplayName}</div>
              </div>
            </div>

            <div className="mdcHero__bottom">
              <div className="mdcProgressMeta">Step {currentStep} of 5</div>
              <button type="button" className="mdcHeroCta" onClick={() => navigate(`/match-centre/${fixture.id}`)}>
                Match Centre <ChevronRight size={14} />
              </button>
            </div>
          </section>

          {conflict?.message ? (
            <div className="mdcStatus mdcStatus--danger">
              <AlertTriangle size={14} /> {conflict.message}
            </div>
          ) : null}
          {playerLoadErr ? <div className="mdcStatus mdcStatus--muted">{playerLoadErr}</div> : null}

          <div className="mdcStepper" role="tablist" aria-label="Submit steps">
            {([1, 2, 3, 4, 5] as Step[]).map((step) => {
              const active = step === currentStep;
              const done = step < currentStep;
              const enabled = canGoToStep(step);
              return (
                <button
                  key={step}
                  type="button"
                  className={`mdcStep ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => enabled && setCurrentStep(step)}
                  disabled={!enabled}
                  aria-selected={active}
                >
                  <span className="mdcStep__node">{done ? <Check size={14} /> : step}</span>
                  <span className="mdcStep__label">{STEP_LABELS[step]}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.section key="s1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Confirm Match</div>
                <div className="mdcCard__body">
                  <div className="mdcConfirmMatch">
                    <div className="mdcConfirmMatch__teams">
                      <span>{homeDisplayName}</span>
                      <strong>vs</strong>
                      <span>{awayDisplayName}</span>
                    </div>
                    <div className="mdcConfirmMatch__meta">Round {fixture.round} • {venue || 'Venue TBC'} • {kickoffLabel}</div>
                  </div>

                  <div className="mdcRuleCard">
                    <Trophy size={16} />
                    <div>
                      <div className="mdcRuleCard__title">Submission Rules</div>
                      <div className="mdcRuleCard__text">This is your next scheduled fixture. Home coach submits final score, kickers and evidence for verification.</div>
                    </div>
                  </div>

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(2)}>
                      Continue to Score
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 2 && (
              <motion.section key="s2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Score Entry</div>
                <div className="mdcCard__body">
                  <div className="mdcScorePanel">
                    <div className="mdcScoreTeam">
                      <div className="mdcScoreTeam__head">{homeDisplayName}</div>
                      <div className="mdcScoreInputs">
                        <label>Goals
                          <input inputMode="numeric" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                        <label>Behinds
                          <input inputMode="numeric" value={homeBehinds} onChange={(e) => setHomeBehinds(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                      </div>
                      <div className="mdcScoreTotal">{homeGoalsN}.{homeBehindsN} <span>({homeScore})</span></div>
                    </div>

                    <div className="mdcScoreTeam">
                      <div className="mdcScoreTeam__head">{awayDisplayName}</div>
                      <div className="mdcScoreInputs">
                        <label>Goals
                          <input inputMode="numeric" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                        <label>Behinds
                          <input inputMode="numeric" value={awayBehinds} onChange={(e) => setAwayBehinds(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                      </div>
                      <div className="mdcScoreTotal">{awayGoalsN}.{awayBehindsN} <span>({awayScore})</span></div>
                    </div>
                  </div>

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

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(1)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(3)} disabled={!isStep2Valid}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 3 && (
              <motion.section key="s3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Goal Kickers</div>
                <div className="mdcCard__body">
                  <div className="mdcFilterRow">
                    <div className="mdcSeg">
                      {(['both', 'home', 'away'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          className={`mdcSeg__btn ${searchSide === side ? 'is-active' : ''}`}
                          onClick={() => setSearchSide(side)}
                        >
                          {side === 'both' ? 'Both' : side === 'home' ? homeTeam.shortName || 'Home' : awayTeam.shortName || 'Away'}
                        </button>
                      ))}
                    </div>
                    <label className="mdcSearch">
                      <Search size={14} />
                      <input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search players" />
                    </label>
                  </div>

                  <div className="mdcTopScorers">
                    <div className="mdcTopScorers__label">Top Scorers</div>
                  <div className="mdcTopScorers__chips">
                      {(topScorers.length ? topScorers : [
                        { id: 'ph1', name: 'Awaiting entries', goals: 0, team: 'home' as const, photoUrl: homePlayers[0]?.photoUrl },
                      ]).map((k) => (
                        <div key={k.id} className="mdcTopChip">
                          <div className="mdcTopChip__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User size={12} />}
                          </div>
                          <span>{k.name}</span>
                          <strong>{k.goals}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {unlinkedPlayers.length ? (
                    <div className="mdcStatus mdcStatus--muted" style={{ marginTop: 10 }}>
                      Team links missing for some players. Showing “All players (team not linked)” in combined search.
                    </div>
                  ) : null}

                  <div className="mdcPickerGrid" role="list">
                    {mergedPlayerList.map((p) => {
                      const side: 'home' | 'away' =
                        p.teamName === homeTeam.name
                          ? 'home'
                          : p.teamName === awayTeam.name
                            ? 'away'
                            : searchSide === 'home'
                              ? 'home'
                              : 'away';
                      const goals = side === 'home' ? safeNum(homeGoalMap[p.id]) : safeNum(awayGoalMap[p.id]);
                      return (
                        <button
                          key={`${side}-${p.id}`}
                          type="button"
                          className={`mdcPickerHeadshot ${goals > 0 ? 'is-active' : ''}`}
                          onClick={() => setPlayerGoals(side, p.id, goals + 1)}
                          aria-label={`${p.name} (${side === 'home' ? homeDisplayName : awayDisplayName})`}
                          title={`${p.name}${goals > 0 ? ` • ${goals} goal${goals === 1 ? '' : 's'}` : ''}`}
                        >
                          {p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" /> : <span>{p.name.slice(0, 1).toUpperCase()}</span>}
                          {goals > 0 ? <strong>{goals}</strong> : null}
                        </button>
                      );
                    })}
                  </div>
                  {!mergedPlayerList.length ? <div className="mdcEmptyInline">No players found for this filter.</div> : null}

                  <div className="mdcSelectedKickers">
                    {[...homeGoalKickers, ...awayGoalKickers].map((k) => {
                      const side = homeGoalMap[k.id] ? 'home' : 'away';
                      return (
                        <button
                          key={k.id}
                          type="button"
                          className="mdcSelectedKicker"
                          onClick={() => setPlayerGoals(side, k.id, safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[k.id]) - 1)}
                          aria-label={`Reduce ${k.name} goal count`}
                        >
                          <div className="mdcSelectedKicker__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} loading="lazy" /> : <span>{k.name.slice(0, 1).toUpperCase()}</span>}
                          </div>
                          <span>{k.goals}</span>
                        </button>
                      );
                    })}
                    {!homeGoalKickers.length && !awayGoalKickers.length ? (
                      <div className="mdcEmptyInline">Tap player photos to add goal kickers.</div>
                    ) : null}
                  </div>

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(2)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(4)}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 4 && (
              <motion.section key="s4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Evidence Upload + OCR</div>
                <div className="mdcCard__body">
                  <div className="mdcUploadDrop">
                    <div className="mdcUploadDrop__title">Upload screenshots</div>
                    <div className="mdcUploadDrop__sub">Screenshots are used as verification evidence.</div>
                    <label className="mdcBtn mdcBtn--primary mdcUploadDrop__btn">
                      <Upload size={14} /> Choose Images
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickFiles} hidden />
                    </label>
                  </div>

                  {!!uploaded.length && (
                    <div className="mdcUploadGrid">
                      {uploaded.map((f) => (
                        <div key={f.id} className="mdcUploadItem">
                          <div className="mdcUploadItem__thumb">{f.previewUrl ? <img src={f.previewUrl} alt={f.name} /> : <Upload size={14} />}</div>
                          <div className="mdcUploadItem__meta">
                            <div className="mdcUploadItem__name">{f.name}</div>
                            <div className="mdcUploadItem__size">{bytesToKb(f.size)} KB</div>
                          </div>
                          <button type="button" className="mdcUploadItem__remove" onClick={() => removeFile(f.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mdcOcrBar">
                    <button type="button" className="mdcBtn mdcBtn--primary" disabled={!canRunOcr} onClick={runOcr}>
                      <Wand2 size={14} /> {ocr.status === 'ocr_running' ? 'Running OCR…' : 'Run OCR'}
                    </button>
                    <div className="mdcOcrState">
                      {ocr.status === 'ocr_running' ? (
                        <>
                          <span>{ocr.step}</span>
                          <div className="mdcProgress"><div style={{ width: `${Math.round(ocr.progress01 * 100)}%` }} /></div>
                        </>
                      ) : ocr.status === 'done' ? (
                        <span className="is-done"><Check size={13} /> Ready to review</span>
                      ) : ocr.status === 'timeout' ? (
                        <span className="is-error"><AlertTriangle size={13} /> {ocr.error}</span>
                      ) : ocr.status === 'error' ? (
                        <span className="is-error"><AlertTriangle size={13} /> {ocr.message}</span>
                      ) : (
                        <span>Waiting for OCR run</span>
                      )}
                    </div>
                  </div>

                  {ocr.status === 'done' ? (
                    <div className="mdcOcrPreview">
                      <div className="mdcOcrPreview__head">
                        <span>OCR Summary</span>
                        <button type="button" onClick={() => setShowOcrText((v) => !v)}>
                          {showOcrText ? <><EyeOff size={13} /> Hide text</> : <><Eye size={13} /> View text</>}
                        </button>
                      </div>
                      <div className="mdcOcrPreview__stats">Detected stats: {Object.keys(ocr.teamStats || {}).length} • Player lines: {(ocr.playerLines || []).length}</div>
                      {showOcrText ? <pre className="mdcOcrPreview__text">{ocr.rawText}</pre> : null}
                      <label className="mdcConfirm">
                        <input type="checkbox" checked={ocrConfirm} onChange={(e) => setOcrConfirm(e.target.checked)} />
                        <span>Confirm OCR looks correct</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(3)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(5)} disabled={!uploaded.length}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 5 && (
              <motion.section key="s5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Review + Confirm</div>
                <div className="mdcCard__body">
                  <div className="mdcReviewScore">
                    <div className="mdcReviewScore__value">{homeScore}</div>
                    <div className="mdcReviewScore__teams">
                      {homeDisplayName} <span>vs</span> {awayDisplayName}
                    </div>
                    <div className="mdcReviewScore__value">{awayScore}</div>
                  </div>

                  <div className="mdcChecklist">
                    <div className={`mdcChecklist__row ${fixture ? 'is-ok' : ''}`}><Check size={13} /> Fixture confirmed</div>
                    <div className={`mdcChecklist__row ${isStep2Valid ? 'is-ok' : ''}`}><Check size={13} /> Score entered</div>
                    <div className={`mdcChecklist__row ${(homeGoalKickers.length + awayGoalKickers.length) > 0 ? 'is-ok' : ''}`}><Check size={13} /> Goal kickers added</div>
                    <div className={`mdcChecklist__row ${uploaded.length > 0 ? 'is-ok' : ''}`}><Check size={13} /> Evidence uploaded ({uploaded.length})</div>
                  </div>

                  <div className="mdcReviewBlock">
                    <div className="mdcReviewBlock__title">Top Goal Kickers</div>
                    {(topScorers.length ? topScorers : [{ id: 'none', name: 'Awaiting coach input', goals: 0, team: 'home' as const }]).map((k) => (
                      <div key={k.id} className="mdcReviewKicker">
                        <div className="mdcReviewKicker__left">
                          <div className="mdcReviewKicker__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User size={12} />}
                          </div>
                          <span>{k.name}</span>
                        </div>
                        <strong>{k.goals}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mdcReviewBlock">
                    <div className="mdcReviewBlock__title">Notes</div>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details for admins?" />
                  </div>

                  <div className="mdcActions mdcActions--sticky">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(4)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" disabled={!canSubmit || isSubmitting} onClick={submit}>
                      {isSubmitting ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {submitSuccess && (
          <motion.div className="mdcSuccessOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="mdcSuccessCard" initial={{ y: 10, scale: 0.97 }} animate={{ y: 0, scale: 1 }}>
              <div className="mdcSuccessCard__icon"><Check size={24} /></div>
              <div className="mdcSuccessCard__title">Submitted</div>
              <div className="mdcSuccessCard__sub">Your result has been captured and is now pending verification.</div>
              <div className="mdcSuccessCard__score">{homeScore} — {awayScore}</div>
              <div className="mdcSuccessCard__actions">
                <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => navigate(`/match-centre/${fixture.id}`)}>
                  Open Match Centre
                </button>
                <button type="button" className="mdcBtn" onClick={() => navigate('/fixtures')}>
                  Back to Fixtures
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```
