import { supabase } from '@/lib/supabaseClient';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';

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
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  return (keys.includes(s as TeamKey) ? (s as TeamKey) : null);
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

export async function fetchMatchCentre(matchId: string): Promise<MatchCentreModel> {
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

  const leaders: MatchLeaderCard[] =
    goalsLeaders.length > 0
      ? goalsLeaders.map((g) => ({
          stat: 'GOALS',
          matchTotal: g.goals,
          seasonAvg: null,
          player: g.name,
          position: '—',
          team: g.teamName,
          photoUrl: g.photoUrl,
        }))
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

  // --- Team stats from OCR if available (otherwise empty) ---
  // We don’t know the exact OCR keys yet, so we safely map a few common ones if they exist.
  const mergedTeamStats: Record<string, any> = {};
  for (const s of submissions) {
    if (s?.ocr_team_stats && typeof s.ocr_team_stats === 'object') {
      // last write wins (fine)
      Object.assign(mergedTeamStats, s.ocr_team_stats);
    }
  }

  const statPairs: { label: string; homeKey: string; awayKey: string }[] = [
    { label: 'Disposals', homeKey: 'home_disposals', awayKey: 'away_disposals' },
    { label: 'Kicks', homeKey: 'home_kicks', awayKey: 'away_kicks' },
    { label: 'Handballs', homeKey: 'home_handballs', awayKey: 'away_handballs' },
    { label: 'Marks', homeKey: 'home_marks', awayKey: 'away_marks' },
    { label: 'Tackles', homeKey: 'home_tackles', awayKey: 'away_tackles' },
  ];

  const teamStats: TeamStatRow[] = statPairs
    .map((p) => {
      const homeMatch = safeNum(mergedTeamStats[p.homeKey]);
      const awayMatch = safeNum(mergedTeamStats[p.awayKey]);

      // If both 0, assume not available
      if (homeMatch === 0 && awayMatch === 0) return null;

      return {
        label: p.label,
        homeMatch,
        awayMatch,
        homeSeasonAvg: 0,
        awaySeasonAvg: 0,
        homeSeasonTotal: 0,
        awaySeasonTotal: 0,
      } as TeamStatRow;
    })
    .filter(Boolean) as TeamStatRow[];

  // --- Player stats: build a “basic” table from goal kickers so Player Stats isn’t empty ---
  const playerStats: PlayerStatRow[] =
    goalsLeaders.length > 0
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
  };
}