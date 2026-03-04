import { requireSupabaseClient } from '@/lib/supabaseClient';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '@/lib/competitionRegistry';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import {
  resolvePlayerDisplayName,
  resolvePlayerPhotoUrl,
  resolveTeamKey,
  resolveTeamLogoUrl,
  resolveTeamName,
} from '@/lib/entityResolvers';

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
