import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Columns3,
  Crown,
  User,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '../state/auth/AuthProvider';
import { useLadder } from '../hooks/useLadder';
import { useNextFixtures } from '../hooks/useFixtures';
import { assetUrl } from '../lib/teamAssets';
import { resolveTeamLogoUrl } from '../lib/entityResolvers';
import { FIXTURES_UNLOCK_LABEL, useFixtureVisibility } from '../lib/fixtureVisibility';
import { TEAM_SHORT_NAMES } from '../data/teamColors';
import { MelvinBetHomeCard, type MelvinHomeFixture } from '../components/MelvinBet';

import '../styles/home.css';

type StatLeaderCategory = import('../lib/stats-leaders-cache').StatLeaderCategory;
type HomeCoach = import('../lib/homeRepo').HomeCoach;

const AFL26_LOGO_URL =
  'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/afl26-logo.png';
const BGL_LOGO_URL =
  'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/ChatGPT%20Image%20Mar%2022,%202026,%2001_57_16%20AM.png';
const BGL_LOGO_FALLBACK_URL =
  'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/BGL%20Media%20Logo%20V2.svg';
const MCG_IMAGE_URL =
  'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/mcg-stadium.jpg';

const teamLogoFallbackUrl = (slug?: string, name?: string, explicitLogo?: string | null) =>
  resolveTeamLogoUrl({
    logoUrl: explicitLogo || null,
    slug: slug || null,
    name: name || null,
    fallbackPath: 'elite-gaming-logo.png',
  });

const STAT_THEME: Record<string, string> = {
  goals: 'goals',
  fantasyPoints: 'fantasy',
  disposals: 'disposals',
  marks: 'marks',
  teamDisposals: 'disposals',
};

function teamNamesOverlap(fixtureName: string, coachTeam: string): boolean {
  if (!fixtureName || !coachTeam) return false;
  const f = fixtureName.toLowerCase().replace(/-/g, ' ').trim();
  const c = coachTeam.toLowerCase().trim();
  if (f.includes(c) || c.includes(f)) return true;
  const cWords = c.split(/\s+/).filter((w) => w.length > 2);
  if (!cWords.length) return false;
  const matchCount = cWords.filter((w) => f.includes(w)).length;
  return matchCount >= Math.min(2, cWords.length);
}

function useHomepageStats() {
  const [playerData, setPlayerData] = useState<StatLeaderCategory[] | null>(null);
  const [teamData, setTeamData] = useState<StatLeaderCategory[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { fetchLeaderCategories, peekLeaderCategoriesCache } = await import(
          '../lib/stats-leaders-cache'
        );
        const cp = peekLeaderCategoriesCache('players');
        const ct = peekLeaderCategoriesCache('teams');
        if (mounted && cp) setPlayerData(cp);
        if (mounted && ct) setTeamData(ct);
        if (mounted && (cp || ct)) setIsLoading(false);
        const [fp, ft] = await Promise.all([
          fetchLeaderCategories('players'),
          fetchLeaderCategories('teams'),
        ]);
        if (!mounted) return;
        setPlayerData(fp || []);
        setTeamData(ft || []);
      } catch (err) {
        console.warn('Failed to fetch homepage stats:', err);
        if (mounted) {
          setPlayerData([]);
          setTeamData([]);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const playerLeaders = useMemo(() => {
    const keys = ['goals', 'fantasyPoints', 'disposals', 'marks'];
    return keys
      .map((k) => playerData?.find((c) => c.statKey === k))
      .filter(Boolean) as StatLeaderCategory[];
  }, [playerData]);

  const teamLeaders = useMemo(() => {
    if (!teamData?.length) return [] as StatLeaderCategory[];
    const preferred = ['goals', 'disposals', 'marks', 'fantasyPoints', 'teamDisposals'];
    const found = preferred
      .map((k) => teamData.find((c) => c.statKey === k))
      .filter(Boolean) as StatLeaderCategory[];
    return found.length ? found.slice(0, 3) : teamData.slice(0, 3);
  }, [teamData]);

  return { playerLeaders, teamLeaders, isLoading };
}

function useHomeCoaches() {
  const [data, setData] = useState<HomeCoach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const repo = await import('../lib/homeRepo');
        const result = (await (repo as any).fetchCurrentCoaches?.()) || [];
        if (mounted && Array.isArray(result)) setData(result);
      } catch (err) {
        console.warn('Failed to fetch coaches:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { data, isLoading };
}

const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`home-skeleton ${className || ''}`} style={style} />
);

function HeroMasterCard() {
  const { user } = useAuth();
  const eliteLogo = assetUrl('elite-gaming-logo.png');

  const primaryHref = user ? '/members' : '/auth/sign-in';
  const secondaryHref = user ? '/ladder' : '/fixtures';
  const primaryLabel = user ? 'My Club Hub' : 'Sign In';
  const secondaryLabel = user ? 'View Ladder' : 'View Fixtures';

  return (
    <section className="home-hero-wrap">
      <div className="home-hero-card">
        <div
          className="home-hero-stadium"
          style={{ backgroundImage: `url(${MCG_IMAGE_URL})` }}
          aria-hidden="true"
        />
        <div className="home-hero-atmos" aria-hidden="true" />

        <div className="home-hero-content">
          <div className="home-hero-pillRow">
            <span className="home-hero-pill">
              <span className="home-hero-pillDot" />
              Season Live
            </span>
          </div>

          <div className="home-hero-lockup">
            <div className="home-hero-lockup__glow" aria-hidden="true" />
            <img
              src={eliteLogo}
              alt="Elite Gaming"
              className="home-hero-lockup__eg"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="home-hero-lockup__divider" aria-hidden="true" />
            <img
              src={BGL_LOGO_URL}
              alt="BGL Media"
              className="home-hero-lockup__bgl"
              onError={(e) => {
                const t = e.currentTarget;
                if (t.src !== BGL_LOGO_FALLBACK_URL) {
                  t.src = BGL_LOGO_FALLBACK_URL;
                  return;
                }
                t.style.display = 'none';
              }}
            />
          </div>

          <div className="home-hero-aflWrap">
            <img src={AFL26_LOGO_URL} alt="AFL26" className="home-hero-aflLogo" />
          </div>

          <div className="home-hero-titleGroup">
            <h1 className="home-hero-seasonTitle">Season Two</h1>
            <p className="home-hero-sub">
              {user
                ? 'Your fixtures, ladder and match centre.'
                : 'Official hub for coaches and players.'}
            </p>
          </div>

          <div className="home-hero-actions">
            <Link to={primaryHref} className="home-hero-btn home-hero-btn--primary">
              <span className="home-hero-btn__icon">
                {user ? <Crown size={14} /> : <User size={14} />}
              </span>
              <span>{primaryLabel}</span>
            </Link>
            <Link to={secondaryHref} className="home-hero-btn home-hero-btn--secondary">
              {user ? <Columns3 size={13} /> : <CalendarDays size={13} />}
              <span>{secondaryLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LaunchPromoCard() {
  return (
    <section className="home-module home-module--promo">
      <div className="home-promo-card">
        <div className="home-promo-card__content">
          <div className="home-promo-card__icon">
            <ShieldCheck size={16} />
          </div>
          <h3 className="home-promo-card__title">{FIXTURES_UNLOCK_LABEL}</h3>
          <p className="home-promo-card__body">
            Fixtures and matchups will appear here once the season reveal goes live.
          </p>
        </div>
      </div>
    </section>
  );
}

function FeaturedMatchCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useNextFixtures('afl26-season-two', user ? 20 : 1);
  const { data: coaches } = useHomeCoaches();

  const allFixtures: any[] = useMemo(
    () => (Array.isArray(data) ? data : (data as any)?.fixtures ?? []),
    [data],
  );

  const fixture = useMemo(() => {
    if (!allFixtures.length) return null;
    if (!user) return allFixtures[0];

    const myCoach = coaches.find((c) => c.user_id === user.id);
    if (!myCoach) return allFixtures[0];

    const upcoming = allFixtures.filter((f) => f.status !== 'FINAL' && f.status !== 'COMPLETED');
    const pool = upcoming.length ? upcoming : allFixtures;

    if (myCoach.team_id) {
      const byId = pool.find(
        (f) => f.home_team_id === myCoach.team_id || f.away_team_id === myCoach.team_id,
      );
      if (byId) return byId;
    }

    const myTeam = myCoach.team_name;
    if (myTeam) {
      const byName = pool.find(
        (f) =>
          teamNamesOverlap(f.home_team_name || f.home_team_slug || '', myTeam) ||
          teamNamesOverlap(f.away_team_name || f.away_team_slug || '', myTeam),
      );
      if (byName) return byName;
    }

    return pool[0] ?? allFixtures[0];
  }, [allFixtures, user, coaches]);

  const sectionLabel = user ? 'Your Next Match' : 'Featured Match';

  if (isLoading) {
    return (
      <section className="home-module home-module--feature">
        <header className="home-module__header">
          <h2>{sectionLabel}</h2>
          <Link to="/fixtures">
            All Fixtures<ChevronRight size={13} />
          </Link>
        </header>
        <Skeleton className="home-featured-skeleton" />
      </section>
    );
  }

  if (!fixture) {
    return (
      <section className="home-module home-module--feature">
        <header className="home-module__header">
          <h2>{sectionLabel}</h2>
          <Link to="/fixtures">
            All Fixtures<ChevronRight size={13} />
          </Link>
        </header>
        <div className="home-empty">Season fixtures will appear shortly.</div>
      </section>
    );
  }

  const homeName =
    fixture.home_team_name ||
    fixture.home_team_short_name ||
    fixture.home_team_slug?.replace(/-/g, ' ') ||
    'TBD';
  const awayName =
    fixture.away_team_name ||
    fixture.away_team_short_name ||
    fixture.away_team_slug?.replace(/-/g, ' ') ||
    'TBD';
  const homeLogo = teamLogoFallbackUrl(
    fixture.home_team_slug,
    homeName,
    fixture.home_team_logo_url,
  );
  const awayLogo = teamLogoFallbackUrl(
    fixture.away_team_slug,
    awayName,
    fixture.away_team_logo_url,
  );

  let dateText = 'Time TBA';
  if (fixture.start_time) {
    const d = new Date(fixture.start_time);
    if (!Number.isNaN(d.getTime())) {
      dateText = d.toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  return (
    <section className="home-module home-module--feature">
      <header className="home-module__header">
        <h2>{sectionLabel}</h2>
        <Link to="/fixtures">
          All Fixtures<ChevronRight size={13} />
        </Link>
      </header>
      <button
        type="button"
        className="home-feature-card"
        onClick={() => navigate(`/match-centre/${fixture.id}`)}
      >
        <div className="home-feature-card__meta">
          <span className="home-feature-card__round">Round {fixture.round || '-'}</span>
          <span className="home-feature-card__date">
            {fixture.status === 'COMPLETED' || fixture.status === 'FINAL' ? 'Full Time' : dateText}
          </span>
        </div>
        <div className="home-feature-card__main">
          <div className="home-feature-card__team">
            <span className="home-feature-card__logo">
              <img
                src={homeLogo}
                alt={homeName}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </span>
            <span>{homeName}</span>
          </div>
          <div className="home-feature-card__vs">vs</div>
          <div className="home-feature-card__team">
            <span className="home-feature-card__logo">
              <img
                src={awayLogo}
                alt={awayName}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </span>
            <span>{awayName}</span>
          </div>
        </div>
        <div className="home-feature-card__cta">
          <span>Enter Match Centre</span>
          <ArrowRight size={13} />
        </div>
      </button>
    </section>
  );
}

function MelvinBetOutlookSection() {
  const { data } = useNextFixtures('afl26-season-two', 6);

  const fixtures = useMemo<MelvinHomeFixture[]>(() => {
    const raw: any[] = Array.isArray(data) ? data : (data as any)?.fixtures ?? [];
    return raw.slice(0, 4).map((f: any) => ({
      id: String(f.id || ''),
      homeName: f.home_team_name || f.home_team_short_name || f.home_team_slug?.replace(/-/g, ' ') || 'TBD',
      awayName: f.away_team_name || f.away_team_short_name || f.away_team_slug?.replace(/-/g, ' ') || 'TBD',
      round: Number(f.round) || undefined,
      venue: f.venue || undefined,
    }));
  }, [data]);

  if (!fixtures.length) return null;

  return (
    <section className="home-module">
      <MelvinBetHomeCard fixtures={fixtures} />
    </section>
  );
}

function LeadersPreview() {
  const navigate = useNavigate();
  const { playerLeaders, teamLeaders, isLoading } = useHomepageStats();
  const [tab, setTab] = useState<'players' | 'teams'>('players');

  const displayLeaders = tab === 'players' ? playerLeaders.slice(0, 3) : teamLeaders.slice(0, 3);

  const showSkeleton = isLoading && playerLeaders.length === 0 && teamLeaders.length === 0;
  const isTeamTab = tab === 'teams';

  return (
    <section className="home-module home-module--leaders">
      <div className="home-leaders-header">
        <header className="home-module__header" style={{ width: '100%' }}>
          <h2>Season Leaders</h2>
          <Link to="/stats3">
            Stats Hub<ChevronRight size={13} />
          </Link>
        </header>
        <div className="home-leaders-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'players'}
            className={`home-leaders-toggle__btn ${tab === 'players' ? 'is-active' : ''}`}
            onClick={() => setTab('players')}
          >
            Player
          </button>
          <button
            role="tab"
            aria-selected={tab === 'teams'}
            className={`home-leaders-toggle__btn ${tab === 'teams' ? 'is-active' : ''}`}
            onClick={() => setTab('teams')}
          >
            Team
          </button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="home-leaders-rail">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="home-leader-card">
              <Skeleton className="home-leader-sk__top" />
              <Skeleton className="home-leader-sk__value" />
              <div className="home-leader-divider" />
              <div className="home-leader-row">
                <Skeleton className="home-leader-sk__avatar" />
                <div style={{ flex: 1 }}>
                  <Skeleton className="home-leader-sk__line" />
                  <Skeleton className="home-leader-sk__line" style={{ marginTop: 5, width: '60%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayLeaders.length > 0 ? (
        <div className="home-leaders-rail" key={tab}>
          {displayLeaders.map((category) => {
            if (!category?.top) return null;
            const top = category.top;
            const theme = STAT_THEME[category.statKey] ?? 'default';
            return (
              <button
                key={category.statKey}
                type="button"
                className={`home-leader-card home-leader-card--${theme}`}
                onClick={() => navigate('/stats3')}
              >
                <div className="home-leader-top">
                  <span className="home-leader-label">{category.label}</span>
                  <span className={`home-leader-chip ${isTeamTab ? 'home-leader-chip--team' : ''}`}>
                    {isTeamTab ? 'Top Team' : 'Top Player'}
                  </span>
                </div>
                <div className="home-leader-value">{top.valueTotal}</div>
                <div className="home-leader-divider" />
                <div className="home-leader-row">
                  <div className="home-leader-avatar">
                    {top.photoUrl ? <img src={top.photoUrl} alt={top.name} /> : <User size={14} />}
                  </div>
                  <div className="home-leader-meta">
                    <p>{top.name}</p>
                    <span>{top.teamName || 'Season Leader'}</span>
                  </div>
                  <span className="home-leader-badge">#1</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="home-empty">
          {isTeamTab
            ? 'Team leaderboards will appear once stats are submitted.'
            : 'Player leaderboards will appear once stats are submitted.'}
        </div>
      )}
    </section>
  );
}

function CoachesSection() {
  const { data: coaches, isLoading } = useHomeCoaches();

  if (isLoading) {
    return (
      <section className="home-module home-module--coaches">
        <header className="home-module__header">
          <h2>Season Coaches</h2>
        </header>
        <div className="home-coaches-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="home-coach-skeleton" style={{ height: 64, borderRadius: 14 }} />
          ))}
        </div>
      </section>
    );
  }

  if (!coaches.length) {
    return (
      <section className="home-module home-module--coaches">
        <header className="home-module__header">
          <h2>Season Coaches</h2>
        </header>
        <div className="home-empty">Coaches will appear once teams are assigned.</div>
      </section>
    );
  }

  return (
    <section className="home-module home-module--coaches">
      <header className="home-module__header">
        <h2>Season Coaches</h2>
        <Link to="/ladder">
          Full Ladder<ChevronRight size={13} />
        </Link>
      </header>
      <div className="home-coaches-grid">
        {coaches.map((coach) => {
          const logo = teamLogoFallbackUrl(undefined, coach.team_name || undefined, coach.team_logo_url);
          return (
            <div key={coach.user_id} className="home-coach-card">
              <div className="home-coach-card__logo">
                {logo ? (
                  <img
                    src={logo}
                    alt={coach.team_name || ''}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <User size={16} />
                )}
              </div>
              <div className="home-coach-card__info">
                <span className="home-coach-card__name">{(coach.display_name || '').split(' ')[0]}</span>
                <span className="home-coach-card__team">{(coach.team_name && TEAM_SHORT_NAMES[coach.team_name]) || coach.team_name || 'Unassigned'}</span>
                {coach.psn && <span className="home-coach-card__psn">{coach.psn}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LadderSnapshot() {
  const { data, isLoading } = useLadder('afl26-season-two');
  const ladder = useMemo(() => (Array.isArray(data) ? data.slice(0, 8) : []), [data]);

  return (
    <section className="home-module home-module--ladder">
      <header className="home-module__header">
        <h2>Ladder Snapshot</h2>
        <Link to="/ladder">
          Full Ladder<ChevronRight size={13} />
        </Link>
      </header>

      <div className="home-ladder-card">
        {isLoading ? (
          <div className="home-ladder-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="home-ladder-skeleton__row" />
            ))}
          </div>
        ) : ladder.length > 0 ? (
          <div className="home-ladder-tableWrap">
            <table className="home-ladder-table">
              <thead>
                <tr>
                  <th className="home-ladder-th--pos">#</th>
                  <th className="home-ladder-th--club">Club</th>
                  <th>P</th>
                  <th>W</th>
                  <th>Pts</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {ladder.map((team: any, index: number) => {
                  const logo = teamLogoFallbackUrl(team.team_slug, team.team_name, team.team_logo_url);
                  const rank = Number(team.position || index + 1);
                  const isFirst = rank === 1;
                  const isTopFour = rank <= 4;
                  return (
                    <tr
                      key={team.team_slug || `${team.team_name}-${index}`}
                      className={[
                        index === 3 ? 'is-top-four-cut' : '',
                        isFirst ? 'is-row-first' : isTopFour ? 'is-row-top-four' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="home-ladder-td--pos">
                        <span
                          className={`home-ladder-rank ${
                            isFirst ? 'is-first' : isTopFour ? 'is-top-four' : ''
                          }`}
                        >
                          {rank}
                        </span>
                      </td>
                      <td className="home-ladder-club">
                        <span className="home-ladder-logoWrap">
                          <img
                            src={logo}
                            alt={team.team_name || 'Team'}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </span>
                        <span className="home-ladder-name">{team.team_name || 'Team'}</span>
                      </td>
                      <td className="home-ladder-td--num">{team.played || 0}</td>
                      <td className="home-ladder-td--num">{team.wins || 0}</td>
                      <td className="home-ladder-td--pts">{team.points || 0}</td>
                      <td className="home-ladder-td--pct">{Number(team.percentage || 0).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="home-empty">Ladder data will appear after Round 1.</div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const fixturesVisible = useFixtureVisibility(user?.role);

  return (
    <div className="home-page">
      <main className="home-main">
        <HeroMasterCard />
        {fixturesVisible ? <FeaturedMatchCard /> : <LaunchPromoCard />}

        <LeadersPreview />
        <CoachesSection />
        <LadderSnapshot />
      </main>
    </div>
  );
}
