import { requireSupabaseClient } from '@/lib/supabaseClient';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '@/lib/competitionRegistry';
import {
  fetchFixtureById,
  fetchSeasonFixtures,
  normalizeFixtureStatus,
  type FixtureRow as NormalizedFixtureRow,
} from '@/lib/fixturesRepo';
import { resolveSeasonRecord } from '@/lib/seasonResolver';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import { fetchAflPlayers } from '@/data/aflPlayers';
import {
  resolvePlayerDisplayName,
  resolveTeamKey,
  resolveTeamLogoUrl,
  resolveTeamName,
} from '@/lib/entityResolvers';
import { resolveKnownPlayerHeadshot } from '@/lib/playerHeadshots';

const supabase = requireSupabaseClient();

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

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

async function resolveActiveSeasonSlug(): Promise<string> {
  const requestedSlug = normalizeSlug(getDataSeasonSlugForCompetition(getStoredCompetitionKey()));
  if (!requestedSlug) throw new Error('Missing active competition season slug.');
  const season = await resolveSeasonRecord(supabase, requestedSlug, { preferFixtureRows: true });
  return season.slug || requestedSlug;
}

async function fetchPlayersByTeamIds(teamIds: string[]): Promise<DbPlayerRow[]> {
  if (!teamIds.length) return [];

  const attempts = [
    'id,team_id,name,position,number,headshot_url,photo_url',
    'id,team_id,name,headshot_url,photo_url',
    'id,team_id,display_name,headshot_url,photo_url',
    'id,team_id,full_name,headshot_url,photo_url',
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
    'id,team_id,name,position,number,headshot_url,photo_url',
    'id,team_id,name,headshot_url,photo_url',
    'id,team_id,display_name,headshot_url,photo_url',
    'id,team_id,full_name,headshot_url,photo_url',
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
    'id,team_id,team_name,name,position,number,headshot_url,photo_url',
    'id,team_id,team_name,name,headshot_url,photo_url',
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

const TEAM_SELECT_STABLE = 'id,team_key,slug,name,short_name,logo_url,primary_color';

async function fetchTeamsByIds(teamIds: string[]): Promise<TeamRow[]> {
  const ids = Array.from(new Set(teamIds.map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return [];

  const { data, error } = await supabase.from('eg_teams').select(TEAM_SELECT_STABLE).in('id', ids);
  if (error) {
    console.warn('[matchCentreRepo] eg_teams by id failed:', error.message);
    return [];
  }

  return (data || []) as TeamRow[];
}

async function fetchTeamBySlug(slug: string | null | undefined): Promise<TeamRow | null> {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return null;

  const { data, error } = await supabase
    .from('eg_teams')
    .select(TEAM_SELECT_STABLE)
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (error) return null;
  return (data as TeamRow | null) ?? null;
}

function mergePlayerName(p: DbPlayerRow): string {
  return resolvePlayerDisplayName({
    name: p.name,
    firstName: p.first_name,
    lastName: p.last_name,
  });
}

function resolveRosterPhotoUrl(args: {
  name?: string | null;
  photoUrl?: string | null;
  headshotUrl?: string | null;
}): string | undefined {
  return resolveKnownPlayerHeadshot(args) || undefined;
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

  G: number | null;
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
  state: 'Scheduled' | 'Live' | 'Disputed' | 'Corrected';
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

function meaningfulVenue(value: unknown): string | null {
  const venue = String(value || '').trim();
  if (!venue) return null;
  const upper = venue.toUpperCase();
  if (upper === 'TBA' || upper === 'TBC' || upper === 'VENUE TBA') return null;
  return venue;
}

function statusToLabel(status: string, fixture?: Partial<FixtureRow>) {
  const normalized = normalizeFixtureStatus(status, fixture as any);
  if (normalized === 'FINAL') return 'FINAL';
  if (normalized === 'LIVE') return 'LIVE';
  return 'UPCOMING';
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

type GoalKickerRow = {
  playerId: string;
  name: string;
  goals: number;
  teamId: string;
  teamName: string;
};

type FixturePlayerStatPackRow = {
  player_id: string;
  team_id: string;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
};

type TeamStatPayloadConfig = {
  label: string;
  aliases: string[];
};

const TEAM_STAT_PAYLOAD_CONFIGS: TeamStatPayloadConfig[] = [
  { label: 'Disposals', aliases: ['disposals'] },
  { label: 'Kicks', aliases: ['kicks'] },
  { label: 'Handballs', aliases: ['handballs'] },
  { label: 'Inside 50s', aliases: ['inside50s', 'inside_50s', 'inside50', 'inside_50'] },
  { label: 'Rebound 50s', aliases: ['rebound50s', 'rebound_50s', 'rebound50', 'rebound_50'] },
  { label: 'Frees For', aliases: ['freesFor', 'frees_for'] },
  { label: '50m Penalties', aliases: ['fiftyMetrePenalties', 'fifty_metre_penalties', 'fiftyMeterPenalties', '50mPenalties', 'fiftys'] },
  { label: 'Hit Outs', aliases: ['hitOuts', 'hit_outs', 'hitouts'] },
  { label: 'Clearances', aliases: ['clearances'] },
  { label: 'Contested Possessions', aliases: ['contestedPossessions', 'contested_possessions'] },
  { label: 'Uncontested Possessions', aliases: ['uncontestedPossessions', 'uncontested_possessions'] },
  { label: 'Marks', aliases: ['marks'] },
  { label: 'Contested Marks', aliases: ['contestedMarks', 'contested_marks'] },
  { label: 'Intercept Marks', aliases: ['interceptMarks', 'intercept_marks'] },
  { label: 'Tackles', aliases: ['tackles'] },
  { label: 'Spoils', aliases: ['spoils'] },
];

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject<T extends Record<string, any>>(value: unknown): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }

  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeGoalKickers(value: unknown, teamId: string, teamName: string): GoalKickerRow[] {
  return parseJsonArray(value)
    .map((row: any) => {
      const rawPlayerId = String(row?.id || row?.player_id || '').trim();
      const name = String(row?.name || row?.player_name || '').trim();
      const goals = safeNum(row?.goals);
      return {
        playerId: rawPlayerId || `goal:${teamId}:${name.toLowerCase()}`,
        name,
        goals,
        teamId,
        teamName,
      };
    })
    .filter((row) => (row.playerId || row.name) && row.goals > 0);
}

function parseStatValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readStatFromBucket(bucket: Record<string, any> | null, aliases: string[]): number | null {
  if (!bucket) return null;
  for (const alias of aliases) {
    if (bucket[alias] !== undefined) {
      const parsed = parseStatValue(bucket[alias]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function readFlatStat(payload: Record<string, any>, side: 'home' | 'away', aliases: string[]): number | null {
  const prefixes = side === 'home' ? ['home_', 'home'] : ['away_', 'away'];
  for (const alias of aliases) {
    const normalized = alias.replace(/_/g, '');
    const snake = alias.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^_/, '');
    for (const prefix of prefixes) {
      const candidates = [
        `${prefix}${alias}`,
        `${prefix}_${alias}`,
        `${prefix}${snake}`,
        `${prefix}_${snake}`,
        `${prefix}${normalized}`,
      ];
      for (const key of candidates) {
        if (payload[key] !== undefined) {
          const parsed = parseStatValue(payload[key]);
          if (parsed !== null) return parsed;
        }
      }
    }
  }
  return null;
}

function parseSubmissionTeamStats(value: unknown): TeamStatRow[] {
  const payload = parseJsonObject<Record<string, any>>(value);
  if (!payload) return [];

  const homeBucket =
    parseJsonObject<Record<string, any>>(payload.home) ||
    parseJsonObject<Record<string, any>>(payload.home_team) ||
    parseJsonObject<Record<string, any>>(payload.teamA) ||
    null;
  const awayBucket =
    parseJsonObject<Record<string, any>>(payload.away) ||
    parseJsonObject<Record<string, any>>(payload.away_team) ||
    parseJsonObject<Record<string, any>>(payload.teamB) ||
    null;

  return TEAM_STAT_PAYLOAD_CONFIGS.map(({ label, aliases }) => {
    const homeMatch = readStatFromBucket(homeBucket, aliases) ?? readFlatStat(payload, 'home', aliases);
    const awayMatch = readStatFromBucket(awayBucket, aliases) ?? readFlatStat(payload, 'away', aliases);
    if (homeMatch === null && awayMatch === null) return null;
    return {
      label,
      homeMatch: safeNum(homeMatch),
      awayMatch: safeNum(awayMatch),
    } satisfies TeamStatRow;
  }).filter(Boolean) as TeamStatRow[];
}

async function fetchFixtureSubmissionsOrdered(fixtureId: string): Promise<any[]> {
  const { data, error } = await supabase.from('submissions').select('*').eq('fixture_id', fixtureId);
  if (error || !Array.isArray(data)) {
    return [];
  }

  return [...data].sort((a: any, b: any) => {
    const aTime = new Date(String(a?.submitted_at || a?.created_at || 0)).getTime() || 0;
    const bTime = new Date(String(b?.submitted_at || b?.created_at || 0)).getTime() || 0;
    return bTime - aTime;
  });
}

async function fetchFixturePlayerStatPack(fixtureId: string): Promise<FixturePlayerStatPackRow[]> {
  const { data, error } = await supabase
    .from('eg_fixture_player_stats')
    .select('player_id,team_id,disposals,kicks,handballs,marks,tackles,clearances')
    .eq('fixture_id', fixtureId);

  if (error) {
    return [];
  }

  return (data || []) as FixturePlayerStatPackRow[];
}

function computeMatchStatus({ fixture, submissions }: { fixture: FixtureRow; submissions: any[] }): MatchTrustInfo {
  const status = String(fixture.status || '').toLowerCase();
  const isSubmitted =
    Boolean(fixture.submitted_at) ||
    (submissions || []).length > 0 ||
    status === 'completed' ||
    status === 'final';
  const isVerified = Boolean(fixture.verified_at);
  const isDisputed = Boolean(fixture.disputed_at);
  const isCorrected = Boolean(fixture.corrected_at);
  const latest = (submissions || [])[0] || null;
  const evidenceCountFromPayload = parseJsonArray(latest?.screenshots).length || parseJsonArray(latest?.screenshot_urls).length;
  const submittedByRaw =
    String(latest?.submitted_by_email || latest?.submitted_by || latest?.coach_name || '').trim() || 'Coach';
  const submittedBy = isUuidLike(submittedByRaw) ? 'Coach' : submittedByRaw;
  const evidenceCount = Number(latest?.evidence_count ?? evidenceCountFromPayload ?? 0) || 0;
  const lastUpdated =
    String(fixture.updated_at || fixture.corrected_at || fixture.verified_at || fixture.submitted_at || latest?.submitted_at || latest?.created_at || '');

  if (isCorrected) {
    return {
      state: 'Corrected',
      label: 'Corrected',
      summary: 'Corrected result is live',
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
      label: 'Reviewing',
      summary: 'Live result is under review',
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
  if (isSubmitted) {
    return {
      state: 'Live',
      label: 'Live',
      summary: isVerified ? 'Result is live and confirmed' : 'Result is live across the app',
      submittedBy,
      evidenceCount,
      lastUpdated,
      isSubmitted,
      isVerified,
      isDisputed,
      isCorrected,
      badgeLabel: 'LIVE',
      badgeTone: 'good',
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

function parseScoreToken(token: string): number | null {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const dotted = raw.match(/^(\d+)\s*\.\s*(\d+)(?:\s*\.\s*(\d+))?(?:\s*\(\s*(\d+)\s*\))?$/);
  if (dotted) {
    const goals = safeNum(dotted[1]);
    const behinds = safeNum(dotted[2]);
    const explicitTotal = dotted[4] ?? dotted[3];
    return explicitTotal != null ? safeNum(explicitTotal) : goals * 6 + behinds;
  }

  const plain = raw.match(/^\d{1,3}$/);
  if (plain) return safeNum(raw);

  return null;
}

function normalizeQuarterProgression(
  rows: Array<{ q: string; home: number; away: number }>,
): MatchCentreModel['quarterProgression'] {
  const quarterOrder = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
  const normalized = rows
    .map((row) => ({
      q: String(row.q || '').toUpperCase() as 'Q1' | 'Q2' | 'Q3' | 'Q4',
      home: safeNum(row.home),
      away: safeNum(row.away),
    }))
    .filter((row) => quarterOrder.includes(row.q))
    .sort((a, b) => quarterOrder.indexOf(a.q) - quarterOrder.indexOf(b.q));

  if (!normalized.length) return undefined;

  const unique = new Map<string, (typeof normalized)[number]>();
  for (const row of normalized) unique.set(row.q, row);
  return Array.from(unique.values());
}

function parseQuarterProgressionFromJson(raw: string): MatchCentreModel['quarterProgression'] {
  const parsed = parseJsonObject<any>(raw);
  if (!parsed) return undefined;

  const direct = Array.isArray(parsed.quarterProgression)
    ? parsed.quarterProgression
    : Array.isArray(parsed.quarters)
      ? parsed.quarters
      : null;

  if (direct) {
    const rows = direct
      .map((row: any, index: number) => ({
        q: String(row?.q || row?.quarter || `Q${index + 1}`),
        home: row?.home ?? row?.homeScore ?? row?.home_total ?? row?.scoreHome,
        away: row?.away ?? row?.awayScore ?? row?.away_total ?? row?.scoreAway,
      }))
      .filter((row: { q: string; home: unknown; away: unknown }) => row.home != null && row.away != null);
    const normalized = normalizeQuarterProgression(rows);
    if (normalized?.length) return normalized;
  }

  if (parsed.home && parsed.away) {
    const homeRows = Array.isArray(parsed.home) ? parsed.home : Array.isArray(parsed.home?.quarters) ? parsed.home.quarters : null;
    const awayRows = Array.isArray(parsed.away) ? parsed.away : Array.isArray(parsed.away?.quarters) ? parsed.away.quarters : null;
    if (homeRows && awayRows && homeRows.length && awayRows.length) {
      const rows = homeRows.slice(0, 4).map((homeRow: any, index: number) => ({
        q: String(homeRow?.q || homeRow?.quarter || awayRows[index]?.q || awayRows[index]?.quarter || `Q${index + 1}`),
        home: homeRow?.score ?? homeRow?.total ?? homeRow?.home ?? homeRow,
        away: awayRows[index]?.score ?? awayRows[index]?.total ?? awayRows[index]?.away ?? awayRows[index],
      }));
      const normalized = normalizeQuarterProgression(rows);
      if (normalized?.length) return normalized;
    }
  }

  return undefined;
}

function parseQuarterProgressionFromOcrRaw(raw: string): MatchCentreModel['quarterProgression'] {
  const source = String(raw || '').trim();
  if (!source) return undefined;

  const fromJson = parseQuarterProgressionFromJson(source);
  if (fromJson?.length) return fromJson;

  const compact = source.replace(/\r/g, '\n');
  const scorePattern = /\b\d+\s*\.\s*\d+(?:\s*\.\s*\d+)?(?:\s*\(\s*\d+\s*\))?|\b\d{1,3}\b/g;
  const quarterMatches = [...compact.matchAll(/\b(Q[1-4])\b([\s\S]*?)(?=\bQ[1-4]\b|$)/gi)];
  const parsedRows: Array<{ q: string; home: number; away: number }> = [];

  for (const match of quarterMatches) {
    const q = String(match[1] || '').toUpperCase();
    const segment = String(match[2] || '');
    const tokenMatches = segment.match(scorePattern) || [];
    const scored = tokenMatches.map(parseScoreToken).filter((value): value is number => value != null);
    if (scored.length >= 2) {
      parsedRows.push({ q, home: scored[0], away: scored[1] });
    }
  }

  const normalizedRows = normalizeQuarterProgression(parsedRows);
  if (normalizedRows?.length) return normalizedRows;

  const byLine = compact
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const lineRows: Array<{ q: string; home: number; away: number }> = [];
  for (const line of byLine) {
    const qMatch = line.match(/\b(Q[1-4])\b/i);
    if (!qMatch) continue;
    const tokens = (line.replace(/\bQ[1-4]\b/i, ' ').match(scorePattern) || [])
      .map(parseScoreToken)
      .filter((value): value is number => value != null);
    if (tokens.length >= 2) {
      lineRows.push({ q: qMatch[1].toUpperCase(), home: tokens[0], away: tokens[1] });
    }
  }

  return normalizeQuarterProgression(lineRows);
}

function formatMomentTime(iso?: string | null) {
  const raw = String(iso || '').trim();
  if (!raw) return { sortAt: Number.NEGATIVE_INFINITY, label: 'Pending update' };

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { sortAt: Number.NEGATIVE_INFINITY, label: 'Pending update' };
  }

  return {
    sortAt: d.getTime(),
    label: d.toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

function buildMoments(
  fixture: FixtureRow,
  submissions: any[],
  trust: MatchTrustInfo,
  teams: { home: MatchCentreTeam; away: MatchCentreTeam },
): MatchMoment[] {
  const events: Array<MatchMoment & { sortAt: number }> = [];
  const latestSubmission = submissions[0] || null;
  const scoreKnown = [fixture.home_total, fixture.away_total, fixture.home_goals, fixture.away_goals].some((value) => safeNum(value) > 0);
  const scheduledTime = formatMomentTime(fixture.start_time);

  events.push({
    id: `${fixture.id}:scheduled`,
    time: fixture.start_time || '',
    timeLabel: fixture.start_time ? scheduledTime.label : 'Awaiting first bounce',
    title: 'Fixture scheduled',
    detail: [meaningfulVenue(fixture.venue), fixture.start_time ? 'Match centre will update once a result is submitted.' : 'Kick-off time has not been locked yet.']
      .filter(Boolean)
      .join(' • '),
    tone: 'neutral',
    type: 'moment',
    sortAt: scheduledTime.sortAt,
  });

  if (latestSubmission) {
    const submittedTime = formatMomentTime(latestSubmission.submitted_at || latestSubmission.created_at);
    const screenshotCount = parseJsonArray(latestSubmission.screenshots).length || parseJsonArray(latestSubmission.screenshot_urls).length;
    const note = String(latestSubmission.notes || '').trim();

    events.push({
      id: `${fixture.id}:submission`,
      time: String(latestSubmission.submitted_at || latestSubmission.created_at || ''),
      timeLabel: submittedTime.label,
      title: 'Coach submission published',
      detail: [
        trust.submittedBy && trust.submittedBy !== 'Coach' ? `Submitted by ${trust.submittedBy}` : 'Submitted by coach',
        screenshotCount > 0 ? `${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}` : null,
        note ? note : null,
      ]
        .filter(Boolean)
        .join(' • '),
      tone: trust.isDisputed ? 'bad' : 'good',
      type: 'moment',
      sortAt: submittedTime.sortAt,
    });
  }

  if (scoreKnown || normalizeFixtureStatus(fixture.status, fixture as any) === 'FINAL') {
    const finalTime = formatMomentTime(fixture.corrected_at || fixture.verified_at || fixture.submitted_at || fixture.updated_at);
    events.push({
      id: `${fixture.id}:score`,
      time: String(fixture.corrected_at || fixture.verified_at || fixture.submitted_at || fixture.updated_at || ''),
      timeLabel: finalTime.label,
      title: trust.isCorrected ? 'Corrected score posted' : 'Score posted',
      detail: `${teams.home.shortName} ${safeNum(fixture.home_total)} - ${safeNum(fixture.away_total)} ${teams.away.shortName}`,
      tone: trust.isCorrected ? 'warn' : 'good',
      type: 'milestone',
      scoreHome: safeNum(fixture.home_total),
      scoreAway: safeNum(fixture.away_total),
      sortAt: finalTime.sortAt,
    });
  }

  if (trust.isDisputed) {
    const disputedTime = formatMomentTime(fixture.disputed_at || fixture.updated_at);
    events.push({
      id: `${fixture.id}:disputed`,
      time: String(fixture.disputed_at || fixture.updated_at || ''),
      timeLabel: disputedTime.label,
      title: 'Result under review',
      detail: 'The live result has been flagged and is awaiting admin review.',
      tone: 'bad',
      type: 'moment',
      sortAt: disputedTime.sortAt,
    });
  }

  if (trust.isCorrected) {
    const correctedTime = formatMomentTime(fixture.corrected_at || fixture.updated_at);
    events.push({
      id: `${fixture.id}:corrected`,
      time: String(fixture.corrected_at || fixture.updated_at || ''),
      timeLabel: correctedTime.label,
      title: 'Score correction applied',
      detail: 'Match centre reflects the latest live correction.',
      tone: 'warn',
      type: 'milestone',
      sortAt: correctedTime.sortAt,
    });
  }

  return events
    .sort((a, b) => b.sortAt - a.sortAt || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map(({ sortAt: _sortAt, ...event }) => event);
}

function pickFeaturedFixture(fixtures: NormalizedFixtureRow[]): NormalizedFixtureRow | null {
  if (!fixtures.length) return null;

  const live = fixtures.find((fixture) => fixture.status === 'LIVE');
  if (live) return live;

  const finals = fixtures.filter((fixture) => fixture.status === 'FINAL');
  if (finals.length) {
    return [...finals].sort((a, b) => {
      const aTime = new Date(String(a.corrected_at || a.verified_at || a.submitted_at || a.updated_at || a.start_time || 0)).getTime() || 0;
      const bTime = new Date(String(b.corrected_at || b.verified_at || b.submitted_at || b.updated_at || b.start_time || 0)).getTime() || 0;
      if (aTime !== bTime) return bTime - aTime;
      return b.round - a.round;
    })[0];
  }

  const withStart = fixtures.filter((fixture) => String(fixture.start_time || '').trim());
  if (withStart.length) return withStart[0];
  return fixtures[0];
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
  if (!players.length) {
    const baselinePlayers = await fetchAflPlayers().catch(() => []);
    const normalizedHome = normalizeToken(home.fullName);
    const normalizedAway = normalizeToken(away.fullName);
    players = baselinePlayers
      .filter((player) => {
        const teamName = normalizeToken(String(player.teamName || ''));
        const teamKey = normalizeToken(String(player.teamKey || ''));
        return (
          teamName === normalizedHome ||
          teamName === normalizedAway ||
          teamKey === normalizeToken(home.key) ||
          teamKey === normalizeToken(away.key)
        );
      })
      .map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        number: player.number,
        team_id:
          normalizeToken(String(player.teamName || '')) === normalizedAway ||
          normalizeToken(String(player.teamKey || '')) === normalizeToken(away.key)
            ? awayTeamId || away.id || ''
            : homeTeamId || home.id || '',
        photo_url: player.headshotUrl || null,
        headshot_url: player.headshotUrl || null,
      })) as DbPlayerRow[];
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
      photoUrl: resolveRosterPhotoUrl({
        name: mergePlayerName(p),
        photoUrl: p.photo_url,
        headshotUrl: p.headshot_url,
      }),
      G: null,
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

  const fx = await fetchFixtureById(matchId);
  if (!fx) throw new Error('Match not found.');

  const fixture = fx as unknown as FixtureRow & NormalizedFixtureRow;

  let homeTeamRow: TeamRow | null = null;
  let awayTeamRow: TeamRow | null = null;
  const teamIds = [fixture.home_team_id, fixture.away_team_id].filter(Boolean) as string[];
  if (teamIds.length > 0) {
    const list = await fetchTeamsByIds(teamIds);
    homeTeamRow = list.find((t) => String(t.id) === String(fixture.home_team_id)) ?? null;
    awayTeamRow = list.find((t) => String(t.id) === String(fixture.away_team_id)) ?? null;
  }

  if (!homeTeamRow && fixture.home_team_slug) {
    homeTeamRow = await fetchTeamBySlug(fixture.home_team_slug);
  }

  if (!awayTeamRow && fixture.away_team_slug) {
    awayTeamRow = await fetchTeamBySlug(fixture.away_team_slug);
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

  const submissions = await fetchFixtureSubmissionsOrdered(fixture.id);
  const fixturePlayerStats = await fetchFixturePlayerStatPack(fixture.id);

  const hasSubmissionData = (submissions || []).length > 0;
  const primarySubmission = (submissions || [])[0];
  const hasStructuredScoreData =
    hasSubmissionData ||
    normalizeFixtureStatus(fixture.status, fixture as any) === 'FINAL' ||
    normalizeFixtureStatus(fixture.status, fixture as any) === 'LIVE' ||
    [hG, hB, aG, aB, safeNum(hT), safeNum(aT)].some((value) => value > 0);

  let playerStats = await fetchFixtureTeamPlayers({
    fixture,
    home,
    away,
    homeTeamRow,
    awayTeamRow,
  });
  const playerById = new Map(playerStats.map((row) => [String(row.playerId), row]));

  const goalKickers = [
    ...normalizeGoalKickers(primarySubmission?.goal_kickers_home, String(home.id || fixture.home_team_id || ''), home.fullName),
    ...normalizeGoalKickers(primarySubmission?.goal_kickers_away, String(away.id || fixture.away_team_id || ''), away.fullName),
  ];

  if (goalKickers.length > 0) {
    const goalPlayerIds = Array.from(new Set(goalKickers.map((row) => row.playerId).filter((value) => isUuidLike(value))));
    const playersByIdRows = await fetchPlayersByIds(goalPlayerIds);
    const playersById = new Map(playersByIdRows.map((p) => [String(p.id), p]));

    for (const kicker of goalKickers) {
      const linkedPlayer = playersById.get(kicker.playerId);
      let target = playerById.get(kicker.playerId);

      if (!target) {
        target = {
          playerId: kicker.playerId,
          name:
            kicker.name ||
            resolvePlayerDisplayName({
              name: linkedPlayer?.name,
              firstName: linkedPlayer?.first_name,
              lastName: linkedPlayer?.last_name,
            }),
          teamId: kicker.teamId,
          team: kicker.teamName,
          number: safeNum(linkedPlayer?.number),
          position: String(linkedPlayer?.position || '').trim(),
          photoUrl: linkedPlayer
            ? resolveRosterPhotoUrl({
                name: kicker.name,
                photoUrl: linkedPlayer.photo_url,
                headshotUrl: linkedPlayer.headshot_url,
              })
            : resolveRosterPhotoUrl({ name: kicker.name }),
          G: null,
          D: null,
          K: null,
          H: null,
          M: null,
          T: null,
          CLR: null,
        };
        playerById.set(kicker.playerId, target);
        playerStats.push(target);
      } else if (linkedPlayer) {
        target.name =
          target.name ||
          resolvePlayerDisplayName({
            name: linkedPlayer.name,
            firstName: linkedPlayer.first_name,
            lastName: linkedPlayer.last_name,
          });
        target.number = target.number || safeNum(linkedPlayer.number);
        target.position = target.position || String(linkedPlayer.position || '').trim();
        if (!target.photoUrl) {
          target.photoUrl = resolveRosterPhotoUrl({
            name: target.name,
            photoUrl: linkedPlayer.photo_url,
            headshotUrl: linkedPlayer.headshot_url,
          });
        }
      }

      target.name = kicker.name || target.name;
      target.teamId = target.teamId || kicker.teamId;
      target.team = target.team || kicker.teamName;
      target.G = kicker.goals;
    }
  }

  if (fixturePlayerStats.length > 0) {
    const statPlayerIds = Array.from(
      new Set(
        fixturePlayerStats
          .map((row) => String(row.player_id || '').trim())
          .filter((value) => isUuidLike(value)),
      ),
    );
    const statPlayersById = new Map((await fetchPlayersByIds(statPlayerIds)).map((p) => [String(p.id), p]));

    for (const statRow of fixturePlayerStats) {
      const playerId = String(statRow.player_id || '').trim();
      if (!playerId) continue;

      const linkedPlayer = statPlayersById.get(playerId);
      let target = playerById.get(playerId);

      if (!target) {
        const teamName =
          String(statRow.team_id || '') === String(home.id || fixture.home_team_id || '')
            ? home.fullName
            : String(statRow.team_id || '') === String(away.id || fixture.away_team_id || '')
              ? away.fullName
              : home.fullName;

        target = {
          playerId,
          name: resolvePlayerDisplayName({
            name: linkedPlayer?.name,
            firstName: linkedPlayer?.first_name,
            lastName: linkedPlayer?.last_name,
          }),
          teamId: String(statRow.team_id || '').trim(),
          team: teamName,
          number: safeNum(linkedPlayer?.number),
          position: String(linkedPlayer?.position || '').trim(),
          photoUrl: linkedPlayer
            ? resolveRosterPhotoUrl({
                name: resolvePlayerDisplayName({
                  name: linkedPlayer?.name,
                  firstName: linkedPlayer?.first_name,
                  lastName: linkedPlayer?.last_name,
                }),
                photoUrl: linkedPlayer.photo_url,
                headshotUrl: linkedPlayer.headshot_url,
              })
            : undefined,
          G: null,
          D: null,
          K: null,
          H: null,
          M: null,
          T: null,
          CLR: null,
        };
        playerById.set(playerId, target);
        playerStats.push(target);
      }

      target.D = safeNum(statRow.disposals);
      target.K = safeNum(statRow.kicks);
      target.H = safeNum(statRow.handballs);
      target.M = safeNum(statRow.marks);
      target.T = safeNum(statRow.tackles);
      target.CLR = safeNum(statRow.clearances);
    }
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

  const pickLeader = (teamName: string, key: 'G' | 'D' | 'T' | 'CLR' | 'M') => {
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

  const hasGoalsLeader = playerStats.some((row) => safeNum(row.G) > 0);
  const hasDisposalsLeader = playerStats.some((row) => safeNum(row.D) > 0);
  const hasTacklesLeader = playerStats.some((row) => safeNum(row.T) > 0);
  const hasClearancesLeader = playerStats.some((row) => safeNum(row.CLR) > 0);
  const hasMarksLeader = playerStats.some((row) => safeNum(row.M) > 0);

  const leaders: MatchLeaderCard[] = [
    hasGoalsLeader ? { stat: 'GOALS', home: pickLeader(home.fullName, 'G'), away: pickLeader(away.fullName, 'G') } : null,
    hasDisposalsLeader ? { stat: 'DISPOSALS', home: pickLeader(home.fullName, 'D'), away: pickLeader(away.fullName, 'D') } : null,
    hasTacklesLeader ? { stat: 'TACKLES', home: pickLeader(home.fullName, 'T'), away: pickLeader(away.fullName, 'T') } : null,
    hasClearancesLeader ? { stat: 'CLEARANCES', home: pickLeader(home.fullName, 'CLR'), away: pickLeader(away.fullName, 'CLR') } : null,
    hasMarksLeader ? { stat: 'MARKS', home: pickLeader(home.fullName, 'M'), away: pickLeader(away.fullName, 'M') } : null,
  ].filter(Boolean) as MatchLeaderCard[];

  const baseTeamStats: TeamStatRow[] = hasStructuredScoreData
    ? [
        {
          label: 'Score',
          homeMatch: safeNum(hT),
          awayMatch: safeNum(aT),
        },
        {
          label: 'Goals',
          homeMatch: hG,
          awayMatch: aG,
        },
        {
          label: 'Behinds',
          homeMatch: hB,
          awayMatch: aB,
        },
        {
          label: 'Goal Kickers',
          homeMatch: playerStats.filter((p) => p.team === home.fullName && safeNum(p.G) > 0).length,
          awayMatch: playerStats.filter((p) => p.team === away.fullName && safeNum(p.G) > 0).length,
        },
      ]
    : [];

  const derivedStatRows: TeamStatRow[] = [
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
  ].filter((row) => row.homeMatch > 0 || row.awayMatch > 0);
  const submissionTeamStats = parseSubmissionTeamStats((primarySubmission as any)?.team_stats) || parseSubmissionTeamStats((primarySubmission as any)?.ocr_team_stats);
  const mergedTeamStats = new Map<string, TeamStatRow>();

  for (const row of [...baseTeamStats, ...submissionTeamStats, ...derivedStatRows]) {
    const key = String(row.label || '').toLowerCase();
    if (!key) continue;
    if (!mergedTeamStats.has(key)) {
      mergedTeamStats.set(key, row);
      continue;
    }
    const existing = mergedTeamStats.get(key)!;
    const currentStrength = existing.homeMatch + existing.awayMatch;
    const nextStrength = row.homeMatch + row.awayMatch;
    if (nextStrength >= currentStrength) {
      mergedTeamStats.set(key, row);
    }
  }

  const teamStats: TeamStatRow[] = Array.from(mergedTeamStats.values()).map((row) => ({
    ...row,
    homeValue: row.homeMatch,
    awayValue: row.awayMatch,
  }));

  const quarterProgression =
    parseQuarterProgressionFromOcrRaw(String((primarySubmission as any)?.ocr_raw_text || '')) ||
    (hasStructuredScoreData ? fallbackQuarterProgression(hT, aT) : undefined);

  const trust = computeMatchStatus({ fixture, submissions: submissions || [] });
  const moments = buildMoments(fixture, submissions || [], trust, { home, away });

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    dateText: fmtDate(fixture.start_time),
    venue: meaningfulVenue(fixture.venue) || 'TBC',
    attendanceText: undefined,
    statusLabel: statusToLabel(fixture.status, fixture),
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
  const activeSeasonSlug = await resolveActiveSeasonSlug();
  const { fixtures } = await fetchSeasonFixtures(activeSeasonSlug, { limit: 1000, offset: 0 });
  const latest = pickFeaturedFixture(fixtures);
  if (!latest) throw new Error('No fixtures found.');
  return fetchMatchCentre(String(latest.id));
}
