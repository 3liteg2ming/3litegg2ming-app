import { ChevronLeft, Gamepad2, KeyRound, Mail, Shield, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import BadgeGrid from '../components/BadgeGrid';
import BadgeModal from '../components/BadgeModal';
import SmartImg from '../components/SmartImg';
import { afl26LocalRounds } from '../data/afl26LocalRounds';
import { getAfl26RoundsFromSupabase, type AflMatch, type AflRound } from '../data/afl26Supabase';
import { fetchCoachBadges, groupCoachBadgesByCategory, type CoachBadgeModel } from '../lib/badges';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';

type TeamRecord = {
  rank: number;
  peakRank: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  pointsFor: number;
  winPct: number;
  streak: string;
  played: number;
};

function normalize(v: string) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function teamKeyFromMatchSlug(slug: string): TeamKey {
  const compact = normalize(slug);
  const direct = slug?.toLowerCase() as TeamKey;
  if ((TEAM_ASSETS as Record<string, unknown>)[direct]) return direct;

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

  return aliases[compact] || ('unknown' as TeamKey);
}

function totalOf(score?: { total: number; goals: number; behinds: number }) {
  return Number.isFinite(score?.total as number) ? Number(score!.total) : 0;
}

function computeTeamRecord(rounds: AflRound[], teamKey: TeamKey): TeamRecord {
  const sortedRounds = [...rounds].sort((a, b) => a.round - b.round);
  const ladder = new Map<TeamKey, { played: number; points: number; pf: number; pa: number }>();
  (Object.keys(TEAM_ASSETS) as TeamKey[]).forEach((k) => {
    ladder.set(k, { played: 0, points: 0, pf: 0, pa: 0 });
  });

  const teamResults: Array<{ round: number; result: 'W' | 'L' | 'D'; goals: number; points: number }> = [];
  let peakRank = 18;
  let currentRank = 18;

  const applyFinal = (match: AflMatch) => {
    const homeKey = teamKeyFromMatchSlug(match.home);
    const awayKey = teamKeyFromMatchSlug(match.away);
    const homeRow = ladder.get(homeKey)!;
    const awayRow = ladder.get(awayKey)!;

    const hs = totalOf(match.homeScore);
    const as = totalOf(match.awayScore);
    const hg = Number(match.homeScore?.goals || 0);
    const ag = Number(match.awayScore?.goals || 0);

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.pf += hs;
    homeRow.pa += as;
    awayRow.pf += as;
    awayRow.pa += hs;

    if (hs > as) homeRow.points += 4;
    else if (as > hs) awayRow.points += 4;
    else {
      homeRow.points += 2;
      awayRow.points += 2;
    }

    if (homeKey === teamKey || awayKey === teamKey) {
      const isHome = homeKey === teamKey;
      const teamPts = isHome ? hs : as;
      const oppPts = isHome ? as : hs;
      const teamGoals = isHome ? hg : ag;
      const result: 'W' | 'L' | 'D' = teamPts > oppPts ? 'W' : teamPts < oppPts ? 'L' : 'D';
      teamResults.push({
        round: 0,
        result,
        goals: teamGoals,
        points: teamPts,
      });
    }
  };

  for (const round of sortedRounds) {
    for (const match of round.matches || []) {
      if (String(match.status || '').toUpperCase() !== 'FINAL') continue;
      applyFinal(match);
      if (teamResults.length > 0) {
        teamResults[teamResults.length - 1].round = round.round;
      }
    }

    const table = (Object.keys(TEAM_ASSETS) as TeamKey[])
      .map((k) => {
        const row = ladder.get(k)!;
        const pct = row.pa > 0 ? (row.pf / row.pa) * 100 : 0;
        return { key: k, points: row.points, pct };
      })
      .sort((a, b) => (b.points - a.points) || (b.pct - a.pct) || a.key.localeCompare(b.key));

    const idx = table.findIndex((r) => r.key === teamKey);
    if (idx >= 0) {
      currentRank = idx + 1;
      peakRank = Math.min(peakRank, currentRank);
    }
  }

  const wins = teamResults.filter((r) => r.result === 'W').length;
  const losses = teamResults.filter((r) => r.result === 'L').length;
  const draws = teamResults.filter((r) => r.result === 'D').length;
  const played = teamResults.length;
  const goals = teamResults.reduce((sum, r) => sum + r.goals, 0);
  const pointsFor = teamResults.reduce((sum, r) => sum + r.points, 0);
  const winPct = played ? (wins / played) * 100 : 0;

  const streakFromLatest = [...teamResults]
    .sort((a, b) => b.round - a.round)
    .map((r) => r.result);

  let streak = 'No streak';
  if (streakFromLatest.length > 0) {
    const first = streakFromLatest[0];
    let count = 1;
    for (let i = 1; i < streakFromLatest.length; i += 1) {
      if (streakFromLatest[i] !== first) break;
      count += 1;
    }
    streak = `${first}${count}`;
  }

  return {
    rank: currentRank,
    peakRank,
    wins,
    losses,
    draws,
    goals,
    pointsFor,
    winPct,
    streak,
    played,
  };
}

function clampPct(v: number) {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

export default function MembersPage() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();

  const [rounds, setRounds] = useState<AflRound[]>(afl26LocalRounds);
  const [loadingStats, setLoadingStats] = useState(true);
  const [badges, setBadges] = useState<CoachBadgeModel[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<CoachBadgeModel | null>(null);

  const team = useMemo(() => {
    const k = user?.teamKey as TeamKey | undefined;
    return k ? TEAM_ASSETS[k] : null;
  }, [user?.teamKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStats(true);
      try {
        const liveRounds = await getAfl26RoundsFromSupabase();
        if (!cancelled && liveRounds?.length) setRounds(liveRounds);
      } catch {
        if (!cancelled) setRounds(afl26LocalRounds);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setBadges([]);
        setLoadingBadges(false);
        return;
      }
      setLoadingBadges(true);
      try {
        const rows = await fetchCoachBadges(user.id);
        if (!cancelled) setBadges(rows);
      } catch {
        if (!cancelled) setBadges([]);
      } finally {
        if (!cancelled) setLoadingBadges(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const displayName = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Coach');
  const record = useMemo<TeamRecord>(() => {
    const teamKey = user?.teamKey as TeamKey | undefined;
    if (!teamKey) {
      return {
        rank: 18,
        peakRank: 18,
        wins: 0,
        losses: 0,
        draws: 0,
        goals: 0,
        pointsFor: 0,
        winPct: 0,
        streak: 'No streak',
        played: 0,
      };
    }
    return computeTeamRecord(rounds, teamKey);
  }, [rounds, user?.teamKey]);

  const badgeGroups = useMemo(() => groupCoachBadgesByCategory(badges), [badges]);
  const unlockedCount = useMemo(() => badges.filter((b) => b.earned).length, [badges]);

  const teamLogo = team ? assetUrl(team.logoFile ?? '') : assetUrl('elite-gaming-logo.png');
  const heroGradient = team
    ? `linear-gradient(135deg, ${team.colour}66 0%, rgba(9,11,16,0.86) 55%, rgba(14,26,48,0.92) 100%)`
    : 'linear-gradient(135deg, rgba(245,196,0,0.18) 0%, rgba(9,11,16,0.88) 50%, rgba(14,26,48,0.92) 100%)';

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/')} aria-label="Back to home">
          <ChevronLeft size={18} />
          <span>Home</span>
        </button>
      </div>

      <div className="auth-card auth-card--wide">
        <div className="member-head">
          <div className="member-title">
            <div className="auth-badge">MEMBERS</div>
            <div className="auth-title">Hi {displayName}</div>
            <div className="auth-sub">Coach performance dashboard and season profile.</div>
          </div>

          <button type="button" className="member-signout" onClick={() => signOut()} aria-label="Sign out">
            Sign out
          </button>
        </div>

        <section className="profileHero" style={{ background: heroGradient }}>
          <SmartImg className="profileHero__watermark" src={teamLogo} alt="Team watermark" fallbackText="EG" />

          <div className="profileHero__head">
            <div className="teamBadge">
              <div className="teamBadgeLogo">
                <SmartImg className="teamBadgeImg" src={teamLogo} alt={team?.name || 'Team'} fallbackText={team?.shortName || 'EG'} />
              </div>
              <div className="teamBadgeMeta">
                <div className="teamBadgeName">{team?.name || 'Unassigned Team'}</div>
                <div className="teamBadgeHint">Coach PSN: {user?.psn || 'Not linked yet'}</div>
              </div>
            </div>

            <div className="profileHero__rankChip">
              <span className="profileHero__rankLabel">Current Rank</span>
              <span className="profileHero__rankValue">#{record.rank}</span>
            </div>
          </div>

          <div className="profileHero__stats">
            <div className="profileHero__metric">
              <span className="profileHero__metricLabel">W-L</span>
              <span className="profileHero__metricValue">
                {record.wins}-{record.losses}{record.draws ? `-${record.draws}` : ''}
              </span>
            </div>
            <div className="profileHero__metric">
              <span className="profileHero__metricLabel">Win %</span>
              <span className="profileHero__metricValue">{clampPct(record.winPct).toFixed(1)}%</span>
            </div>
            <div className="profileHero__metric">
              <span className="profileHero__metricLabel">Streak</span>
              <span className="profileHero__metricValue">{record.streak}</span>
            </div>
          </div>
        </section>

        <section className="member-panel">
          <div className="member-panelTitle">
            <Trophy size={16} style={{ opacity: 0.75 }} /> Performance Dashboard
          </div>
          <div className="profileMiniGrid">
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Wins</div>
              <div className="profileMiniCard__value">{record.wins}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Goals</div>
              <div className="profileMiniCard__value">{record.goals}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Points For</div>
              <div className="profileMiniCard__value">{record.pointsFor}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Ladder Peak</div>
              <div className="profileMiniCard__value">#{record.peakRank}</div>
            </article>
          </div>
          {loadingStats ? <div className="profileDashHint">Refreshing season numbers…</div> : null}
        </section>

        <section className="member-panel">
          <div className="member-panelTitle">
            <Shield size={16} style={{ opacity: 0.75 }} /> Badge Collection
          </div>
          <div className="profileBadgeSummary">
            <span>{unlockedCount}/{badges.length} unlocked</span>
            <span>Tap a badge to view details</span>
          </div>
          {loadingBadges ? <div className="badgeGrid__loading">Loading badges…</div> : <BadgeGrid groups={badgeGroups} onSelect={setSelectedBadge} />}
        </section>

        <div className="member-grid">
          <div className="member-panel">
            <div className="member-panelTitle">
              <Mail size={16} style={{ opacity: 0.75 }} /> Account
            </div>
            <div className="member-mini">
              <div className="member-miniRow">
                <Mail size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">Email</div>
                  <div className="member-miniValue">{user?.email || '—'}</div>
                </div>
              </div>

              <div className="member-miniRow">
                <Gamepad2 size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">PSN</div>
                  <div className="member-miniValue">{user?.psn || 'Not set'}</div>
                </div>
              </div>

              <div className="member-miniRow">
                <KeyRound size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">Account</div>
                  <div className="member-miniValue">Name locked • Email/password editable soon</div>
                </div>
              </div>
            </div>
          </div>

          <div className="member-next">
            <div className="member-nextTitle">Next up</div>
            <div className="member-nextText">
              Keep submitting clean match results to improve rank, unlock performance badges, and push toward finals seeding.
            </div>
          </div>
        </div>
      </div>

      <BadgeModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </div>
  );
}
