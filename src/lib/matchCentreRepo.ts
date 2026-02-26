import { supabase } from '@/lib/supabaseClient';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import { afl26LocalRounds } from '@/data/afl26LocalRounds';

type FixtureRow = {
  id: string;
  round: number;

  home_team_slug: string;
  away_team_slug: string;

  venue: string;
  start_time: string | null;

  status: string;

  home_total: number | null;
  away_total: number | null;
  home_goals: number | null;
  home_behinds: number | null;
  away_goals: number | null;
  away_behinds: number | null;
};

type TeamRow = {
  id?: string;
  slug?: string;
  name?: string;
  short_name?: string;
  abbreviation?: string;
  logo_url?: string;
  primary_color?: string;
};

export type MatchCentreTeam = {
  slug: string;
  name: string;
  fullName: string;
  abbreviation: string;
  color: string;
  logoUrl?: string;

  goals: number;
  behinds: number;
  score: number;
};

export type MatchLeaderCard = {
  stat: string;
  matchTotal: number;
  seasonAvg?: number | null;
  player: string;
  position?: string;
  team: string;
  photoUrl?: string;
};

export type PlayerStatRow = {
  name: string;
  team: string;
  number: number;
  position: string;
  photoUrl?: string;

  AF: number;
  G: number;
  B: number;
  D: number;
  K: number;
  H: number;
  M: number;
  T: number;
  HO: number;
  CLR: number;
  MG: number;
  GA: number;
  TOG: number;
};

export type TeamStatRow = {
  label: string;
  isPercentage?: boolean;

  homeMatch: number;
  awayMatch: number;

  homeSeasonAvg: number;
  awaySeasonAvg: number;

  homeSeasonTotal: number;
  awaySeasonTotal: number;
};

export type MatchCentreModel = {
  fixtureId: string;
  round: number;
  dateText: string;
  venue: string;
  attendanceText?: string;
  statusLabel: string;
  margin: number;

  home: MatchCentreTeam;
  away: MatchCentreTeam;

  leaders: MatchLeaderCard[];
  teamStats: TeamStatRow[];
  playerStats: PlayerStatRow[];
  quarterProgression?: Array<{
    q: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    home: number;
    away: number;
  }>;
};

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function titleCase(s: string) {
  return String(s || '')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join(' ');
}

function fmtDate(startTimeIso: string | null) {
  if (!startTimeIso) return 'TBC';
  const d = new Date(startTimeIso);
  // Mobile-friendly AFL vibe: "Saturday 15 June 2025"
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function toAbbrev(name: string) {
  const n = String(name || '').trim();
  if (!n) return '—';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? '')).slice(0, 3).toUpperCase();
}

function mapSlugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  const compact = s.replace(/[^a-z0-9]/g, '');
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(s as TeamKey)) return s as TeamKey;
  const aliases: Record<string, TeamKey> = {
    adelaidecrows: 'adelaide',
    brisbanelions: 'brisbane',
    carltonblues: 'carlton',
    collingwoodmagpies: 'collingwood',
    essendonbombers: 'essendon',
    fremantledockers: 'fremantle',
    geelongcats: 'geelong',
    goldcoastsuns: 'goldcoast',
    gwsgiants: 'gws',
    hawthornhawks: 'hawthorn',
    melbournedemons: 'melbourne',
    northmelbournekangaroos: 'northmelbourne',
    portadelaidepower: 'portadelaide',
    richmondtigers: 'richmond',
    stkildasaints: 'stkilda',
    sydneyswans: 'sydney',
    westcoasteagles: 'westcoast',
    westernbulldogs: 'westernbulldogs',
  };
  return aliases[compact] || null;
}

function statusToLabel(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'FINAL') return 'FULL TIME';
  if (s === 'LIVE') return 'LIVE';
  if (s === 'SCHEDULED') return 'SCHEDULED';
  if (s.startsWith('PENDING')) return 'PENDING';
  if (s === 'CONFLICT') return 'UNDER REVIEW';
  return s || '—';
}

function buildTeam(teamRow: TeamRow | null, slug: string, score: { g: number; b: number; t: number }): MatchCentreTeam {
  const key = mapSlugToTeamKey(slug);
  const fallback = key ? TEAM_ASSETS[key] : null;

  const fullName = teamRow?.name || (fallback ? fallback.name : titleCase(slug));
  const shortName = teamRow?.short_name || (fallback ? fallback.short : fullName);
  const abbreviation = teamRow?.abbreviation || toAbbrev(shortName);
  const color = teamRow?.primary_color || (fallback ? fallback.primary : '#111111');

  return {
    slug,
    name: shortName,
    fullName,
    abbreviation,
    color,
    logoUrl: teamRow?.logo_url,
    goals: score.g,
    behinds: score.b,
    score: score.t,
  };
}

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim());
}

function buildLocalMatchCentre(matchId: string): MatchCentreModel | null {
  for (const r of afl26LocalRounds) {
    const m = (r.matches || []).find((x: any) => String(x.id) === String(matchId));
    if (!m) continue;

    const h = m.homeScore || { goals: 0, behinds: 0, total: 0 };
    const a = m.awayScore || { goals: 0, behinds: 0, total: 0 };
    const home = buildTeam(
      {
        slug: m.home,
        name: titleCase(m.home),
      },
      m.home,
      { g: safeNum(h.goals), b: safeNum(h.behinds), t: safeNum(h.total) },
    );
    const away = buildTeam(
      {
        slug: m.away,
        name: titleCase(m.away),
      },
      m.away,
      { g: safeNum(a.goals), b: safeNum(a.behinds), t: safeNum(a.total) },
    );

    return {
      fixtureId: String(m.id),
      round: safeNum(r.round),
      dateText: 'TBC',
      venue: String(m.venue || 'TBC'),
      attendanceText: undefined,
      statusLabel: statusToLabel(String(m.status || 'SCHEDULED')),
      margin: Math.abs(safeNum(h.total) - safeNum(a.total)),
      home,
      away,
      leaders: [],
      teamStats: [],
      playerStats: [],
      quarterProgression:
        safeNum(h.total) > 0 || safeNum(a.total) > 0
          ? fallbackQuarterProgression(safeNum(h.total), safeNum(a.total))
          : undefined,
    };
  }
  return null;
}

function fallbackQuarterProgression(homeTotal: number, awayTotal: number) {
  const ratios = [0.24, 0.5, 0.76, 1] as const;
  const labels = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
  return labels.map((q, i) => ({
    q,
    home: Math.round(homeTotal * ratios[i]),
    away: Math.round(awayTotal * ratios[i]),
  }));
}

function parseQuarterProgressionFromOcrRaw(rawText: string) {
  const t = String(rawText || '');
  if (!t) return null as MatchCentreModel['quarterProgression'] | null;

  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const leftRows = new Map<string, number>();
  const rightRows = new Map<string, number>();

  for (const line of lines) {
    const m = line.match(/\bQ([1-4])\b[^0-9]{0,8}(\d{1,2})\s+(\d{1,2})\s+(\d{1,3})\b/i);
    if (!m) continue;
    const q = `Q${m[1]}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
    const total = safeNum(m[4]);
    if (!leftRows.has(q)) leftRows.set(q, total);
    else if (!rightRows.has(q)) rightRows.set(q, total);
  }

  if (leftRows.size < 2 || rightRows.size < 2) return null;

  const order = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
  const out = order.map((q) => ({
    q,
    home: safeNum(leftRows.get(q)),
    away: safeNum(rightRows.get(q)),
  }));
  if (out.every((r) => r.home === 0 && r.away === 0)) return null;
  return out;
}

function pickPrimarySubmission(submissions: any[], homeTeamId?: string, awayTeamId?: string) {
  if (!submissions.length) return null;
  const homeSub = homeTeamId ? submissions.find((s) => String(s.team_id) === String(homeTeamId)) : null;
  const awaySub = awayTeamId ? submissions.find((s) => String(s.team_id) === String(awayTeamId)) : null;
  return homeSub || awaySub || submissions[0];
}

export async function fetchMatchCentre(matchId: string): Promise<MatchCentreModel> {
  if (!isUuidLike(matchId)) {
    const local = buildLocalMatchCentre(matchId);
    if (local) return local;
    throw new Error(`Unsupported match id: ${matchId}`);
  }

  // 1) Fixture
  const { data: fx, error: fxErr } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fxErr) throw new Error(fxErr.message);
  if (!fx) throw new Error('Match not found.');

  const fixture = fx as FixtureRow;

  // 2) Teams (by slug)
  const [homeTeamRes, awayTeamRes] = await Promise.all([
    supabase.from('eg_teams').select('*').eq('slug', fixture.home_team_slug).maybeSingle(),
    supabase.from('eg_teams').select('*').eq('slug', fixture.away_team_slug).maybeSingle(),
  ]);

  // If eg_teams doesn’t exist yet, or fields differ, we still continue with TEAM_ASSETS fallback.
  const homeTeamRow = (homeTeamRes as any)?.data as TeamRow | null;
  const awayTeamRow = (awayTeamRes as any)?.data as TeamRow | null;

  // 3) Submissions (for leaders + OCR)
  const { data: subs, error: subErr } = await supabase
    .from('submissions')
    .select('*')
    .eq('fixture_id', fixture.id);

  if (subErr) throw new Error(subErr.message);

  const submissions = (subs || []) as any[];

  // Prefer fixture totals when FINAL, otherwise show 0/0 until submitted.
  const hG = safeNum(fixture.home_goals);
  const hB = safeNum(fixture.home_behinds);
  const aG = safeNum(fixture.away_goals);
  const aB = safeNum(fixture.away_behinds);

  const hT = safeNum(fixture.home_total) || (hG * 6 + hB);
  const aT = safeNum(fixture.away_total) || (aG * 6 + aB);

  const home = buildTeam(homeTeamRow, fixture.home_team_slug, { g: hG, b: hB, t: hT });
  const away = buildTeam(awayTeamRow, fixture.away_team_slug, { g: aG, b: aB, t: aT });

  const margin = Math.abs(hT - aT);

  // --- Leaders (AFL-worthy “real” for now: GOALS from goal_kickers arrays) ---
  const allKickers: { name: string; teamName: string; goals: number; photoUrl?: string }[] = [];

  for (const s of submissions) {
    const homeKick = Array.isArray(s.goal_kickers_home) ? s.goal_kickers_home : [];
    const awayKick = Array.isArray(s.goal_kickers_away) ? s.goal_kickers_away : [];

    for (const k of homeKick) {
      allKickers.push({ name: k.name, teamName: home.fullName, goals: safeNum(k.goals), photoUrl: k.photoUrl });
    }
    for (const k of awayKick) {
      allKickers.push({ name: k.name, teamName: away.fullName, goals: safeNum(k.goals), photoUrl: k.photoUrl });
    }
  }

  const goalsLeaders = allKickers
    .filter((k) => k.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 6);

  const goalLeaderCards: MatchLeaderCard[] = goalsLeaders
    .slice(0, 3)
    .map((g) => ({
      stat: 'GOALS',
      matchTotal: g.goals,
      seasonAvg: null,
      player: g.name,
      position: '—',
      team: g.teamName,
      photoUrl: g.photoUrl,
    }));

  // --- Team stats from OCR if available (otherwise empty) ---
  // We don’t know the exact OCR keys yet, so we safely map a few common ones if they exist.
  const mergedTeamStats: Record<string, any> = {};
  const mergeStructuredTeamStats = (v: any) => {
    const nested = v?.team_stats && typeof v.team_stats === 'object' ? v.team_stats : v;
    if (!nested || typeof nested !== 'object') return;
    for (const [k, pair] of Object.entries(nested as Record<string, any>)) {
      if (pair && typeof pair === 'object' && ('home' in pair || 'away' in pair)) {
        const key = String(k);
        mergedTeamStats[`home_${key}`] = safeNum((pair as any).home);
        mergedTeamStats[`away_${key}`] = safeNum((pair as any).away);
      } else {
        mergedTeamStats[String(k)] = pair;
      }
    }
  };
  for (const s of submissions) {
    if (s?.ocr_team_stats && typeof s.ocr_team_stats === 'object') {
      // Supports both old flat keys and new structured { team_stats: { key: {home,away} } }.
      mergeStructuredTeamStats(s.ocr_team_stats);
    }
  }

  const statPairs: { label: string; key: string; isPercentage?: boolean }[] = [
    { label: 'Disposals', key: 'disposals' },
    { label: 'Kicks', key: 'kicks' },
    { label: 'Handballs', key: 'handballs' },
    { label: 'Inside 50s', key: 'inside_50s' },
    { label: 'Rebound 50s', key: 'rebound_50s' },
    { label: 'Frees For', key: 'frees_for' },
    { label: '50m Penalties', key: 'fifty_m_penalties' },
    { label: 'Hitouts', key: 'hitouts' },
    { label: 'Clearances', key: 'clearances' },
    { label: 'Contested Possessions', key: 'contested_possessions' },
    { label: 'Uncontested Possessions', key: 'uncontested_possessions' },
    { label: 'Marks', key: 'marks' },
    { label: 'Contested Marks', key: 'contested_marks' },
    { label: 'Intercept Marks', key: 'intercept_marks' },
    { label: 'Tackles', key: 'tackles' },
    { label: 'Spoils', key: 'spoils' },
  ];

  const teamStats: TeamStatRow[] = statPairs
    .map((p) => {
      const homeMatch = safeNum(mergedTeamStats[`home_${p.key}`]);
      const awayMatch = safeNum(mergedTeamStats[`away_${p.key}`]);

      // If both 0, assume not available
      if (homeMatch === 0 && awayMatch === 0) return null;

      return {
        label: p.label,
        isPercentage: p.isPercentage,
        homeMatch,
        awayMatch,
        homeSeasonAvg: 0,
        awaySeasonAvg: 0,
        homeSeasonTotal: 0,
        awaySeasonTotal: 0,
      } as TeamStatRow;
    })
    .filter(Boolean) as TeamStatRow[];

  const teamLeaderCards: MatchLeaderCard[] = ['Disposals', 'Clearances', 'Tackles']
    .map((label) => teamStats.find((s) => s.label === label))
    .filter(Boolean)
    .map((s) => {
      const stat = s as TeamStatRow;
      const homeWins = stat.homeMatch >= stat.awayMatch;
      return {
        stat: String(stat.label).toUpperCase(),
        matchTotal: homeWins ? stat.homeMatch : stat.awayMatch,
        seasonAvg: null,
        player: homeWins ? home.fullName : away.fullName,
        position: 'TEAM',
        team: homeWins ? home.fullName : away.fullName,
        photoUrl: undefined,
      } as MatchLeaderCard;
    });

  const leaders: MatchLeaderCard[] =
    [...goalLeaderCards, ...teamLeaderCards].slice(0, 6).length > 0
      ? [...goalLeaderCards, ...teamLeaderCards].slice(0, 6)
      : [
          {
            stat: 'GOALS',
            matchTotal: 0,
            seasonAvg: null,
            player: 'No submissions yet',
            position: '',
            team: '',
            photoUrl: undefined,
          },
        ];

  // --- Player stats: build richer fallback from goal kickers + OCR player lines if present ---
  const playerByName = new Map<string, PlayerStatRow>();
  const ensurePlayerRow = (name: string, teamName: string, photoUrl?: string) => {
    const key = `${String(name).trim().toLowerCase()}|${String(teamName).trim().toLowerCase()}`;
    const existing = playerByName.get(key);
    if (existing) {
      if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
      return existing;
    }
    const row: PlayerStatRow = {
      name: String(name || 'Unknown'),
      team: String(teamName || ''),
      number: 0,
      position: '',
      photoUrl,
      AF: 0, G: 0, B: 0, D: 0, K: 0, H: 0, M: 0, T: 0, HO: 0, CLR: 0, MG: 0, GA: 0, TOG: 0,
    };
    playerByName.set(key, row);
    return row;
  };

  for (const p of goalsLeaders) {
    const row = ensurePlayerRow(p.name, p.teamName, p.photoUrl);
    row.G += safeNum(p.goals);
    row.AF += safeNum(p.goals) * 6;
  }

  for (const s of submissions) {
    const lines = Array.isArray(s?.ocr_player_stats?.lines) ? s.ocr_player_stats.lines : [];
    const subTeamName =
      String(s?.team_id || '') === String(homeTeamRow?.id || '') ? home.fullName :
      String(s?.team_id || '') === String(awayTeamRow?.id || '') ? away.fullName : '';
    for (const raw of lines) {
      const line = String(raw || '').trim();
      const m = line.match(/^([A-Za-z][A-Za-z '\-\.]{2,})\s+(\d{1,3})$/);
      if (!m) continue;
      const row = ensurePlayerRow(m[1], subTeamName);
      // Treat unknown OCR player-line value as AF fallback so table becomes useful instead of empty.
      row.AF = Math.max(row.AF, safeNum(m[2]));
    }
  }

  const playerStats: PlayerStatRow[] =
    playerByName.size > 0
      ? Array.from(playerByName.values())
          .sort((a, b) => (b.G - a.G) || (b.AF - a.AF) || a.name.localeCompare(b.name))
      : goalsLeaders.length > 0
      ? goalsLeaders.map((p) => ({
          name: p.name,
          team: p.teamName,
          number: 0,
          position: '',
          photoUrl: p.photoUrl,

          AF: 0,
          G: p.goals,
          B: 0,
          D: 0,
          K: 0,
          H: 0,
          M: 0,
          T: 0,
          HO: 0,
          CLR: 0,
          MG: 0,
          GA: 0,
          TOG: 0,
        }))
      : [];

  const primarySubmission = pickPrimarySubmission(submissions, homeTeamRow?.id, awayTeamRow?.id);
  const quarterProgression =
    parseQuarterProgressionFromOcrRaw(String(primarySubmission?.ocr_raw_text || '')) ||
    ((hT > 0 || aT > 0) ? fallbackQuarterProgression(hT, aT) : undefined);

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    dateText: fmtDate(fixture.start_time),
    venue: fixture.venue || 'TBC',
    attendanceText: undefined, // optional later
    statusLabel: statusToLabel(fixture.status),
    margin,

    home,
    away,

    leaders,
    teamStats,
    playerStats,
    quarterProgression,
  };
}

export async function fetchLatestMatchCentre(): Promise<MatchCentreModel> {
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('id,status,start_time,round')
    .order('round', { ascending: false })
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('No fixtures available.');
  return fetchMatchCentre(String(data.id));
}
