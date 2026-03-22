import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Columns3,
  Crown,
  User,
  Users,
} from 'lucide-react';

import { useAuth } from '../state/auth/AuthProvider';
import { useLadder } from '../hooks/useLadder';
import { useNextFixtures } from '../hooks/useFixtures';
import { assetUrl } from '../lib/teamAssets';
import { resolveTeamLogoUrl } from '../lib/entityResolvers';

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

/* ─── stat colour token per statKey ─── */
const STAT_THEME: Record<string, string> = {
  goals:         'goals',
  fantasyPoints: 'fantasy',
  disposals:     'disposals',
  marks:         'marks',
  teamDisposals: 'disposals',
};

/* ─── loose team-name match for signed-in fixture filter ─── */
function teamNamesOverlap(fixtureName: string, coachTeam: string): boolean {
  if (!fixtureName || !coachTeam) return false;
  const f = fixtureName.toLowerCase().replace(/-/g, ' ');
  const c = coachTeam.toLowerCase();
  const cFirst = c.split(' ')[0];
  const fFirst = f.split(' ')[0];
  return f.includes(cFirst) || c.includes(fFirst);
}

/* ═══════════════════════════════════════════════════════════
   DATA HOOKS
═══════════════════════════════════════════════════════════ */

function useHomepageStats() {
  const [playerData, setPlayerData] = useState<StatLeaderCategory[] | null>(null);
  const [teamData, setTeamData]     = useState<StatLeaderCategory[] | null>(null);
  const [isLoading, setIsLoading]   = useState(true);

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
        setTeamData(ft   || []);
      } catch (err) {
        console.warn('Failed to fetch homepage stats:', err);
        if (mounted) { setPlayerData([]); setTeamData([]); }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* Player leaders: goals → fantasy → disposals → marks */
  const playerLeaders = useMemo(() => {
    const keys = ['goals', 'fantasyPoints', 'disposals', 'marks'];
    return keys
      .map((k) => playerData?.find((c) => c.statKey === k))
      .filter(Boolean) as StatLeaderCategory[];
  }, [playerData]);

  /* Team leaders: first 3 team categories available */
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
  const [data, setData]           = useState<HomeCoach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const repo   = await import('../lib/homeRepo');
        const result = (await (repo as any).fetchCurrentCoaches?.()) || [];
        if (mounted && Array.isArray(result)) setData(result);
      } catch (err) {
        console.warn('Failed to fetch coaches:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { data, isLoading };
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`home-skeleton ${className || ''}`} />
);

/* ═══════════════════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════════════════ */
function HeroMasterCard() {
  const { user }  = useAuth();
  const eliteLogo = assetUrl('elite-gaming-logo.png');

  const primaryHref    = user ? '/members'  : '/auth/sign-in';
  const secondaryHref  = user ? '/ladder'   : '/fixtures';
  const primaryLabel   = user ? 'My Club Hub' : 'Coach Sign In';
  const secondaryLabel = user ? 'View Ladder' : 'View Fixtures';

  return (
    <section className="home-hero-wrap">
      <div className="home-hero-card">
        {/* MCG atmosphere */}
        <div
          className="home-hero-stadium"
          style={{ backgroundImage: `url(${MCG_IMAGE_URL})` }}
          aria-hidden="true"
        />
        <div className="home-hero-atmos" aria-hidden="true" />

        <div className="home-hero-content">

          {/* ① Status pill */}
          <div className="home-hero-pillRow">
            <span className="home-hero-pill">
              <span className="home-hero-pillDot" />
              {user ? 'Season Live' : 'Season Launch'}
            </span>
          </div>

          {/* ② EG × BGL — two distinct glass panels */}
          <div className="home-hero-partnerRow">
            <div className="home-hero-panel home-hero-panel--eg">
              <div className="home-hero-panel__glow home-hero-panel__glow--eg" aria-hidden="true" />
              <img
                src={eliteLogo}
                alt="Elite Gaming"
                className="home-hero-logo home-hero-logo--eg"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            <span className="home-hero-sep" aria-hidden="true">×</span>

            <div className="home-hero-panel home-hero-panel--bgl">
              <div className="home-hero-panel__glow home-hero-panel__glow--bgl" aria-hidden="true" />
              <img
                src={BGL_LOGO_URL}
                alt="BGL Media"
                className="home-hero-logo home-hero-logo--bgl"
                onError={(e) => {
                  const t = e.currentTarget;
                  if (t.src !== BGL_LOGO_FALLBACK_URL) { t.src = BGL_LOGO_FALLBACK_URL; return; }
                  t.style.display = 'none';
                }}
              />
            </div>
          </div>

          {/* ③ AFL26 — borderless floating */}
          <div className="home-hero-aflWrap">
            <img src={AFL26_LOGO_URL} alt="AFL26" className="home-hero-aflLogo" />
          </div>

          {/* ④ Title + sub */}
          <div className="home-hero-titleGroup">
            <h1 className="home-hero-seasonTitle">Season Two</h1>
            <p className="home-hero-sub">
              {user
                ? 'Your fixtures, ladder and match centre.'
                : 'Fixtures, ladder and match centre\u00a0— one premium home.'}
            </p>
          </div>

          {/* ⑤ CTAs */}
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

/* ═══════════════════════════════════════════════════════════
   COACH HUB — 2×2 grid, no horizontal scroll
═══════════════════════════════════════════════════════════ */
function CommunityPreview() {
  const { user }   = useAuth();
  const { data: coaches, isLoading } = useHomeCoaches();
  const visible = useMemo(() => coaches.slice(0, 4), [coaches]);

  return (
    <section className="home-hub">
      <div className="home-hub__glow" aria-hidden="true" />

      <header className="home-hub__header">
        <div className="home-hub__headerLeft">
          <p className="home-hub__eyebrow">Member Zone</p>
          <h2 className="home-hub__title">
            {user ? 'Coach\u00a0Community' : 'Coaches\u00a0& Clubs'}
          </h2>
        </div>
        <Link to={user ? '/members' : '/auth/sign-in'} className="home-hub__headerLink">
          {user ? 'Open Hub' : 'Join Hub'}<ChevronRight size={13} />
        </Link>
      </header>

      {isLoading ? (
        <div className="home-hub-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="home-hub-skeleton" />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <>
          <div className="home-hub-grid">
            {visible.map((coach) => (
              <article key={`${coach.user_id}-${coach.team_id}`} className="home-hub-card">
                <div className="home-hub-card__logo">
                  {coach.team_logo_url
                    ? <img src={coach.team_logo_url} alt={coach.team_name || 'Team'} />
                    : <Users size={18} />}
                </div>
                <div className="home-hub-card__meta">
                  <strong>{coach.display_name || coach.psn || 'Coach'}</strong>
                  <span>{coach.team_name || 'Team assigned'}</span>
                </div>
              </article>
            ))}
          </div>

          <Link to={user ? '/members' : '/auth/sign-in'} className="home-hub-cta">
            <span className="home-hub-cta__left">
              <span className="home-hub-cta__iconWrap"><Users size={15} /></span>
              <span>{user ? 'Open Member Hub' : 'Sign in to open Member Hub'}</span>
            </span>
            <ArrowRight size={14} />
          </Link>
        </>
      ) : (
        <div className="home-empty">Coach and club profiles will appear as teams lock in.</div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEATURED MATCH / YOUR NEXT MATCH
═══════════════════════════════════════════════════════════ */
function FeaturedMatchCard() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  /* Fetch more fixtures when signed in so we can filter by team */
  const { data, isLoading } = useNextFixtures('afl26-season-two', user ? 20 : 1);
  const { data: coaches }   = useHomeCoaches();

  const allFixtures: any[] = useMemo(
    () => (Array.isArray(data) ? data : (data as any)?.fixtures ?? []),
    [data],
  );

  /* Try to find the signed-in coach's team fixture */
  const fixture = useMemo(() => {
    if (!allFixtures.length) return null;
    if (!user) return allFixtures[0];
    const myCoach = coaches.find((c) => c.user_id === user.id);
    const myTeam  = myCoach?.team_name || null;
    if (!myTeam) return allFixtures[0];
    const match = allFixtures.find((f) =>
      teamNamesOverlap(f.home_team_name || f.home_team_slug || '', myTeam) ||
      teamNamesOverlap(f.away_team_name || f.away_team_slug || '', myTeam),
    );
    return match ?? allFixtures[0];
  }, [allFixtures, user, coaches]);

  const sectionLabel = user ? 'Your Next Match' : 'Featured Match';

  if (isLoading) {
    return (
      <section className="home-module home-module--feature">
        <header className="home-module__header">
          <h2>{sectionLabel}</h2>
          <Link to="/fixtures">All Fixtures<ChevronRight size={13} /></Link>
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
          <Link to="/fixtures">All Fixtures<ChevronRight size={13} /></Link>
        </header>
        <div className="home-empty">Season fixtures will appear shortly.</div>
      </section>
    );
  }

  const homeName =
    fixture.home_team_name || fixture.home_team_short_name ||
    fixture.home_team_slug?.replace(/-/g, ' ') || 'TBD';
  const awayName =
    fixture.away_team_name || fixture.away_team_short_name ||
    fixture.away_team_slug?.replace(/-/g, ' ') || 'TBD';
  const homeLogo = teamLogoFallbackUrl(fixture.home_team_slug, homeName, fixture.home_team_logo_url);
  const awayLogo = teamLogoFallbackUrl(fixture.away_team_slug, awayName, fixture.away_team_logo_url);

  let dateText = 'Time TBA';
  if (fixture.start_time) {
    const d = new Date(fixture.start_time);
    if (!isNaN(d.getTime())) {
      dateText = d.toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      });
    }
  }

  return (
    <section className="home-module home-module--feature">
      <header className="home-module__header">
        <h2>{sectionLabel}</h2>
        <Link to="/fixtures">All Fixtures<ChevronRight size={13} /></Link>
      </header>
      <button
        type="button"
        className="home-feature-card"
        onClick={() => navigate(`/match-centre/afl26-season-two/${fixture.round}/${fixture.id}`)}
      >
        <div className="home-feature-card__meta">
          <span className="home-feature-card__round">Round {fixture.round || '-'}</span>
          <span className="home-feature-card__date">
            {fixture.status === 'COMPLETED' ? 'Full Time' : dateText}
          </span>
        </div>
        <div className="home-feature-card__main">
          <div className="home-feature-card__team">
            <span className="home-feature-card__logo">
              <img src={homeLogo} alt={homeName}
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </span>
            <span>{homeName}</span>
          </div>
          <div className="home-feature-card__vs">vs</div>
          <div className="home-feature-card__team">
            <span className="home-feature-card__logo">
              <img src={awayLogo} alt={awayName}
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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

/* ═══════════════════════════════════════════════════════════
   SEASON LEADERS — Player / Team toggle + colour-coded cards
═══════════════════════════════════════════════════════════ */
function LeadersPreview() {
  const navigate = useNavigate();
  const { playerLeaders, teamLeaders, isLoading } = useHomepageStats();
  const [tab, setTab] = useState<'players' | 'teams'>('players');

  const displayLeaders = tab === 'players'
    ? playerLeaders.slice(0, 3)
    : teamLeaders.slice(0, 3);

  const showSkeleton = isLoading && playerLeaders.length === 0 && teamLeaders.length === 0;

  return (
    <section className="home-module home-module--leaders">
      <div className="home-leaders-header">
        <header className="home-module__header" style={{ flex: 1 }}>
          <h2>Season Leaders</h2>
          <Link to="/stats3">Stats Hub<ChevronRight size={13} /></Link>
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
        <div className="home-leaders-rail">
          {displayLeaders.map((category) => {
            if (!category?.top) return null;
            const top   = category.top;
            const theme = STAT_THEME[category.statKey] ?? 'default';
            const isTeam = category.mode === 'teams';
            return (
              <button
                key={category.statKey}
                type="button"
                className={`home-leader-card home-leader-card--${theme}`}
                onClick={() => navigate('/stats3')}
              >
                <div className="home-leader-top">
                  <span className="home-leader-label">{category.label}</span>
                  <span className={`home-leader-chip ${isTeam ? 'home-leader-chip--team' : ''}`}>
                    {isTeam ? 'Top Team' : 'Top Player'}
                  </span>
                </div>
                <div className="home-leader-value">{top.valueTotal}</div>
                <div className="home-leader-divider" />
                <div className="home-leader-row">
                  <div className="home-leader-avatar">
                    {top.photoUrl
                      ? <img src={top.photoUrl} alt={top.name} />
                      : <User size={14} />}
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
          {tab === 'teams'
            ? 'Team leaderboards will appear once stats are submitted.'
            : 'Player leaderboards will appear once stats are submitted.'}
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   LADDER SNAPSHOT
═══════════════════════════════════════════════════════════ */
function LadderSnapshot() {
  const { data, isLoading } = useLadder('afl26-season-two');
  const ladder = useMemo(() => (Array.isArray(data) ? data.slice(0, 8) : []), [data]);

  return (
    <section className="home-module home-module--ladder">
      <header className="home-module__header">
        <h2>Ladder Snapshot</h2>
        <Link to="/ladder">Full Ladder<ChevronRight size={13} /></Link>
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
                  const logo      = teamLogoFallbackUrl(team.team_slug, team.team_name, team.team_logo_url);
                  const rank      = Number(team.position || index + 1);
                  const isFirst   = rank === 1;
                  const isTopFour = rank <= 4;
                  return (
                    <tr
                      key={team.team_slug || `${team.team_name}-${index}`}
                      className={[
                        index === 3 ? 'is-top-four-cut' : '',
                        isFirst ? 'is-row-first' : isTopFour ? 'is-row-top-four' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="home-ladder-td--pos">
                        <span className={`home-ladder-rank ${isFirst ? 'is-first' : isTopFour ? 'is-top-four' : ''}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="home-ladder-club">
                        <span className="home-ladder-logoWrap">
                          <img src={logo} alt={team.team_name || 'Team'}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        </span>
                        <span className="home-ladder-name">{team.team_name || 'Team'}</span>
                      </td>
                      <td className="home-ladder-td--num">{team.played  || 0}</td>
                      <td className="home-ladder-td--num">{team.wins    || 0}</td>
                      <td className="home-ladder-td--pts">{team.points  || 0}</td>
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

/* ═══════════════════════════════════════════════════════════
   PAGE — final order: Hero → Hub → Match → Leaders → Ladder
═══════════════════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="home-page">
      <main className="home-main">
        <HeroMasterCard />
        <CommunityPreview />
        <FeaturedMatchCard />
        <LeadersPreview />
        <LadderSnapshot />
      </main>
    </div>
  );
}
