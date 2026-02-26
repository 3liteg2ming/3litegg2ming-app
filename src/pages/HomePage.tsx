import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Trophy } from 'lucide-react';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import SmartImg from '../components/SmartImg';
import { getAfl26RoundsFromSupabase, peekAfl26RoundsCache, type AflMatch, type AflRound } from '../data/afl26Supabase';
import { afl26LocalRounds } from '../data/afl26LocalRounds';
import { supabase } from '../lib/supabaseClient';
import { TEAM_ASSETS, assetUrl, getTeamAssets, type TeamKey } from '../lib/teamAssets';
import { fetchLeaderCategories, peekLeaderCategoriesCache, type StatLeaderCategory } from '../lib/stats-leaders-cache';

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
  return aliases[compact] || 'adelaide';
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

async function findNextScheduledForTeamDb(teamRef: string): Promise<{ round: number; match: AflMatch } | null> {
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
            const t = TEAM_ASSETS[entry.teamKey] || TEAM_ASSETS.adelaide;
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
  const cachedRounds = peekAfl26RoundsCache();

  const [state, setState] = useState<HomeState>({
    rounds: cachedRounds && cachedRounds.length ? cachedRounds : afl26LocalRounds,
    hero: null,
    featured: pickRoundOneTop(cachedRounds && cachedRounds.length ? cachedRounds : afl26LocalRounds),
    loadError: null,
  });
  const [loadingHero, setLoadingHero] = useState(true);
  const [goalsCategory, setGoalsCategory] = useState<StatLeaderCategory | null>(
    () => (peekLeaderCategoriesCache('players') || []).find((c) => c.statKey === 'goals') || null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHome() {
      try {
        const roundsFetched = await getAfl26RoundsFromSupabase();
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
          heroPick = await findNextScheduledForTeamDb(teamSlug);
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
    fetchLeaderCategories('players')
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
            <button type="button" className="homeSeasonCard homeSeasonCard--preseason" onClick={() => navigate('/preseason')}>
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
