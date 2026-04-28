import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  LayoutDashboard,
  Trophy,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '../state/auth/AuthProvider';
import { useLadder } from '../hooks/useLadder';
import { useSeasonFixtures } from '../hooks/useFixtures';
import FinalsVoteCard from '../components/finals/FinalsVoteCard';
import PremiersVoteCard from '../components/finals/PremiersVoteCard';
import { FINALS_CONFIG, getFinalsLabel } from '../config/finals';
import { assetUrl } from '../lib/teamAssets';
import { resolveTeamLogoUrl } from '../lib/entityResolvers';
import { FIXTURES_UNLOCK_LABEL, useFixtureVisibility } from '../lib/fixtureVisibility';
import { normalizeFixtureStatus, type FixtureRow } from '../lib/fixturesRepo';
import { TEAM_SHORT_NAMES } from '../data/teamColors';

import '../styles/home.css';

type Coach = import('../lib/homeRepo').Coach;
type HomeNewsItem = import('../lib/homeRepo').HomeNewsItem;
type FinalsTeamCard = {
  key: string;
  teamId?: string;
  name: string;
  logoUrl: string;
};

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

function toText(value: unknown): string {
  return String(value || '').trim();
}

function getFixtureTimestamp(value?: string | null): number {
  const raw = toText(value);
  if (!raw) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatFixtureDateTime(value?: string | null): string {
  const raw = toText(value);
  if (!raw) return 'Time TBA';

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Time TBA';

  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isFinalsFixtureCandidate(fixture: FixtureRow): boolean {
  const source = [fixture.stage_name, fixture.bracket_slot, fixture.round_label].join(' ').toLowerCase();
  return (
    source.includes('qualifying') ||
    source.includes('elimination') ||
    source.includes('semi') ||
    source.includes('prelim') ||
    source.includes('preliminary') ||
    source.includes('grand') ||
    source.includes('finals week') ||
    source.includes('finals') ||
    source.includes('final')
  );
}

function getFixtureFinalsRoundLabel(fixture: FixtureRow) {
  const source = [fixture.stage_name, fixture.bracket_slot, fixture.round_label].join(' ').toLowerCase();

  if (source.includes('qualifying')) return 'Qualifying Final';
  if (source.includes('elimination')) return 'Elimination Final';
  if (source.includes('semi')) return 'Semi Final';
  if (source.includes('prelim')) return 'Preliminary Final';
  if (source.includes('grand')) return 'Grand Final';

  return getFinalsLabel(FINALS_CONFIG.week) || fixture.round_label || 'Finals';
}

function pickFeaturedFinalsFixture(fixtures: FixtureRow[]): FixtureRow | null {
  if (!fixtures.length) return null;

  const finalsFixtures = fixtures.filter(isFinalsFixtureCandidate);
  if (!finalsFixtures.length) return null;

  const now = Date.now();
  const statusPriority = (fixture: FixtureRow) => {
    const status = normalizeFixtureStatus(fixture.status, fixture);
    const timestamp = getFixtureTimestamp(fixture.start_time);

    if (status === 'LIVE') return { priority: 0, order: Math.abs(now - timestamp) };
    if (status === 'PENDING_RESULTS') return { priority: 1, order: Math.abs(now - timestamp) };
    if (status === 'SCHEDULED' && timestamp >= now) return { priority: 2, order: timestamp };
    return { priority: 3, order: timestamp };
  };

  return [...finalsFixtures].sort((a, b) => {
    const aRank = statusPriority(a);
    const bRank = statusPriority(b);

    if (aRank.priority !== bRank.priority) return aRank.priority - bRank.priority;
    if (aRank.order !== bRank.order) return aRank.order - bRank.order;

    return getFixtureTimestamp(a.start_time) - getFixtureTimestamp(b.start_time);
  })[0] || null;
}

function useHomepageNews() {
  const query = useQuery<HomeNewsItem[]>({
    queryKey: ['home', 'news', 2],
    queryFn: async () => {
      const repo = await import('../lib/homeRepo');
      const result = await repo.fetchHomepageNews(2);
      return Array.isArray(result) ? result : [];
    },
    staleTime: 120_000,
    gcTime: 600_000,
  });

  return { items: query.data ?? [], isLoading: query.isLoading };
}

function useHomeCoaches() {
  const query = useQuery<Coach[]>({
    queryKey: ['home', 'current-coaches'],
    queryFn: async () => {
      const repo = await import('../lib/homeRepo');
      const result = await repo.fetchCurrentCoaches();
      return Array.isArray(result) ? result : [];
    },
    staleTime: 60_000,
    gcTime: 120_000,
  });

  return { data: query.data ?? [], isLoading: query.isLoading };
}

function getFixtureTeamName(fixture: FixtureRow, side: 'home' | 'away') {
  if (side === 'home') {
    return (
      fixture.home_team_name ||
      fixture.home_team_short_name ||
      fixture.home_team_slug?.replace(/-/g, ' ') ||
      'TBD'
    );
  }

  return (
    fixture.away_team_name ||
    fixture.away_team_short_name ||
    fixture.away_team_slug?.replace(/-/g, ' ') ||
    'TBD'
  );
}

function getFixturePrimaryLabel(fixture: FixtureRow) {
  if (isFinalsFixtureCandidate(fixture)) return getFixtureFinalsRoundLabel(fixture);
  return fixture.round_label || `Round ${fixture.round || '-'}`;
}

function getFixtureStatusLabel(fixture: FixtureRow) {
  const status = normalizeFixtureStatus(fixture.status, fixture);
  if (status === 'LIVE') return 'Live now';
  if (status === 'PENDING_RESULTS') return 'Awaiting result';
  if (status === 'FINAL') return 'Full Time';
  return formatFixtureDateTime(fixture.start_time);
}

function collectFinalsTeams(fixtures: FixtureRow[]): FinalsTeamCard[] {
  const teams = new Map<string, FinalsTeamCard>();

  for (const fixture of fixtures) {
    (['home', 'away'] as const).forEach((side) => {
      const teamId = toText(side === 'home' ? fixture.home_team_id : fixture.away_team_id);
      const teamName = getFixtureTeamName(fixture, side);
      const teamSlug = toText(side === 'home' ? fixture.home_team_slug : fixture.away_team_slug);
      const explicitLogo = side === 'home' ? fixture.home_team_logo_url : fixture.away_team_logo_url;
      const key = teamId || teamSlug || teamName.toLowerCase();
      if (!key || teams.has(key)) return;

      teams.set(key, {
        key,
        teamId: teamId || undefined,
        name: teamName,
        logoUrl: teamLogoFallbackUrl(teamSlug || undefined, teamName, explicitLogo),
      });
    });
  }

  return Array.from(teams.values());
}

function filterFinalsCoaches(coaches: Coach[], finalists: FinalsTeamCard[]) {
  if (!coaches.length) return [] as Coach[];
  if (!finalists.length) return coaches.slice(0, 8);

  const finalistIds = new Set(finalists.map((team) => toText(team.teamId)).filter(Boolean));
  const finalistNames = finalists.map((team) => team.name);

  return coaches
    .filter((coach) => {
      const teamId = toText(coach.team_id);
      if (teamId && finalistIds.has(teamId)) return true;

      const teamName = toText(coach.team_name);
      return finalistNames.some((finalistName) => teamNamesOverlap(finalistName, teamName));
    })
    .slice(0, 8);
}

const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`home-skeleton ${className || ''}`} style={style} />
);

function HeroMasterCard() {
  const { user } = useAuth();
  const finalsLabel = getFinalsLabel(FINALS_CONFIG.week) || 'Season Live';
  const secondaryHref = user ? '/members' : '/teams';
  const secondaryLabel = user ? 'Coach Hub' : 'Explore Teams';
  const SecondaryIcon = user ? LayoutDashboard : ShieldCheck;

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
          <div className="home-hero-topbar">
            <span className="home-hero-eyebrow home-hero-eyebrow--logos">
              <img src={assetUrl('elite-gaming-logo.png')} alt="Elite Gaming" className="home-hero-partnerLogo" />
              <span className="home-hero-eyebrow-x">×</span>
              <span className="home-hero-bglWrap">
                <img
                  src={BGL_LOGO_URL}
                  alt="BGL"
                  className="home-hero-partnerLogo home-hero-partnerLogo--bgl"
                  onError={(e) => { e.currentTarget.src = BGL_LOGO_FALLBACK_URL; }}
                />
              </span>
            </span>
            <span className="home-hero-pill">
              <span className="home-hero-pillDot" />
              {finalsLabel}
            </span>
          </div>

          <div className="home-hero-titleGroup">
            <h1 className="home-hero-seasonTitle">AFL26<br />Finals Hub</h1>
            <p className="home-hero-sub">
              {user
                ? 'Every finals result, match centre and standings — live.'
                : 'Fan voting, every finals result and standings — live.'}
            </p>
          </div>

          <div className="home-hero-statsRow">
            <span className="home-hero-stat"><strong>8</strong> Clubs</span>
            <span className="home-hero-statDiv" />
            <span className="home-hero-stat"><strong>4</strong> Rounds</span>
            <span className="home-hero-statDiv" />
            <span className="home-hero-stat"><strong>9</strong> Games</span>
          </div>

          <div className="home-hero-actions home-hero-actions--stack">
            <Link to="/fixtures" className="home-hero-btn home-hero-btn--primary home-hero-btn--full">
              <span className="home-hero-btn__icon">
                <ArrowRight size={14} />
              </span>
              Open Finals Draw
            </Link>
            <Link to={secondaryHref} className="home-hero-btn home-hero-btn--secondary">
              <span className="home-hero-btn__icon">
                <SecondaryIcon size={14} />
              </span>
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function EgNewsSection() {
  const { items, isLoading } = useHomepageNews();

  if (isLoading) return null;
  if (!items.length) return null;

  return (
    <section className="home-module home-module--news">
      <header className="home-module__header">
        <h2>EG News</h2>
        <span className="home-news-badge">Latest</span>
      </header>
      <div className="home-news-grid">
        {items.map((item: HomeNewsItem) => (
          <article key={item.id} className="home-news-card">
            <div className="home-news-card__img">
              <img
                src={item.image_url}
                alt={item.title}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div className="home-news-card__body">
              {item.category && (
                <span className="home-news-card__cat">{item.category}</span>
              )}
              <h3 className="home-news-card__title">{item.title}</h3>
              {item.caption && (
                <p className="home-news-card__caption">{item.caption}</p>
              )}
              {item.published_at && (
                <span className="home-news-card__date">
                  {new Date(item.published_at).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </div>
          </article>
        ))}
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
          <div className="home-promo-card__actions">
            <Link to="/teams" className="home-promo-card__btn home-promo-card__btn--secondary">
              Club Tracker
            </Link>
            <Link to="/best-team" className="home-promo-card__btn home-promo-card__btn--primary">
              Build Best 23
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedMatchCard({ coaches = [] }: { coaches?: Coach[] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Reuse the same season fixtures query the rest of the page already loads —
  // identical query key dedupes the request inside React Query.
  const seasonFixturesQuery = useSeasonFixtures('afl26-season-two', { limit: 1000 });
  const isLoading = seasonFixturesQuery.isLoading;

  const allFixtures = useMemo<FixtureRow[]>(
    () => (Array.isArray(seasonFixturesQuery.data?.fixtures) ? seasonFixturesQuery.data?.fixtures || [] : []),
    [seasonFixturesQuery.data?.fixtures],
  );

  const featuredFinalsFixture = useMemo(() => {
    if (!FINALS_CONFIG.enabled || !allFixtures.length) return null;

    const finalsFixtures = allFixtures.filter(isFinalsFixtureCandidate);
    if (!finalsFixtures.length) return null;

    if (!user) return pickFeaturedFinalsFixture(finalsFixtures);

    const myCoach = coaches.find((c) => c.user_id === user.id);
    if (!myCoach) return pickFeaturedFinalsFixture(finalsFixtures);

    const upcomingFinals = finalsFixtures.filter((candidate) => {
      const status = normalizeFixtureStatus(candidate.status, candidate);
      return status !== 'FINAL' && status !== 'PENDING_RESULTS';
    });
    const pool = upcomingFinals.length ? upcomingFinals : finalsFixtures;

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

    return pickFeaturedFinalsFixture(pool) || finalsFixtures[0] || null;
  }, [allFixtures, coaches, user]);

  const fixture = useMemo(() => {
    if (featuredFinalsFixture) return featuredFinalsFixture;
    if (FINALS_CONFIG.enabled) return null;

    if (!allFixtures.length) return null;
    if (!user) return allFixtures[0];

    const myCoach = coaches.find((c) => c.user_id === user.id);
    if (!myCoach) return allFixtures[0];

    const upcoming = allFixtures.filter((candidate) => {
      const status = normalizeFixtureStatus(candidate.status, candidate);
      return status !== 'FINAL' && status !== 'PENDING_RESULTS';
    });
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
  }, [allFixtures, featuredFinalsFixture, user, coaches]);

  const myCoachForLabel = user ? coaches.find((c) => c.user_id === user.id) : null;
  const isMyMatchup = !!(myCoachForLabel?.team_id && fixture && (
    (fixture as any).home_team_id === myCoachForLabel.team_id ||
    (fixture as any).away_team_id === myCoachForLabel.team_id
  ));
  const sectionLabel = isMyMatchup ? 'Your Matchup' : 'Featured Match';
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

  if (FINALS_CONFIG.enabled && !featuredFinalsFixture) {
    return null;
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

  const isFinalsMatch = isFinalsFixtureCandidate(fixture);
  const homeName = getFixtureTeamName(fixture, 'home');
  const awayName = getFixtureTeamName(fixture, 'away');
  const homeLogo = teamLogoFallbackUrl(
    fixture.home_team_slug || undefined,
    homeName,
    fixture.home_team_logo_url,
  );
  const awayLogo = teamLogoFallbackUrl(
    fixture.away_team_slug || undefined,
    awayName,
    fixture.away_team_logo_url,
  );
  const homeCoach = coaches.find((c) => c.team_id === fixture.home_team_id) ?? null;
  const awayCoach = coaches.find((c) => c.team_id === fixture.away_team_id) ?? null;
  const label = getFixturePrimaryLabel(fixture);
  const dateText = getFixtureStatusLabel(fixture);
  const displayHeading = isFinalsMatch
    ? isMyMatchup
      ? 'Your Finals Matchup'
      : 'Finals Spotlight'
    : sectionLabel;

  return (
    <section className="home-module home-module--feature">
      <header className="home-module__header">
        <h2>{displayHeading}</h2>
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
          <span className="home-feature-card__round">{label}</span>
          <span className="home-feature-card__date">{dateText}</span>
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
        {(homeCoach || awayCoach) && (
          <div className="home-feature-card__coaches">
            <span className="home-feature-card__coach">
              {homeCoach ? homeCoach.display_name : '—'}
              {homeCoach?.psn ? <em>@{homeCoach.psn}</em> : null}
            </span>
            <span className="home-feature-card__coachDiv" />
            <span className="home-feature-card__coach home-feature-card__coach--away">
              {awayCoach ? awayCoach.display_name : '—'}
              {awayCoach?.psn ? <em>@{awayCoach.psn}</em> : null}
            </span>
          </div>
        )}
        <div className="home-feature-card__cta">
          <span>{normalizeFixtureStatus(fixture.status, fixture) === 'FINAL' ? 'View Match Centre' : 'Enter Match Centre'}</span>
          <ArrowRight size={13} />
        </div>
      </button>
    </section>
  );
}

function RecentResultsRibbon() {
  const seasonFixturesQuery = useSeasonFixtures('afl26-season-two', { limit: 1000 });

  const completedFinals = useMemo<FixtureRow[]>(() => {
    const all = Array.isArray(seasonFixturesQuery.data?.fixtures) ? seasonFixturesQuery.data!.fixtures : [];
    return all
      .filter((f) => isFinalsFixtureCandidate(f) && normalizeFixtureStatus(f.status, f) === 'FINAL')
      .sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime())
      .slice(0, 4);
  }, [seasonFixturesQuery.data?.fixtures]);

  if (!FINALS_CONFIG.enabled || completedFinals.length === 0) return null;

  return (
    <section className="home-module home-module--results">
      <header className="home-module__header">
        <h2>Recent Results</h2>
        <Link to="/fixtures">
          All Results<ChevronRight size={13} />
        </Link>
      </header>
      <div className="home-results-ribbon">
        {completedFinals.map((f) => {
          const homeG = Number(f.home_goals ?? 0);
          const homeB = Number(f.home_behinds ?? 0);
          const homeT = Number(f.home_total ?? homeG * 6 + homeB);
          const awayG = Number(f.away_goals ?? 0);
          const awayB = Number(f.away_behinds ?? 0);
          const awayT = Number(f.away_total ?? awayG * 6 + awayB);
          const homeWon = homeT > awayT;
          const homeName = getFixtureTeamName(f, 'home');
          const awayName = getFixtureTeamName(f, 'away');
          const roundLabel = getFixturePrimaryLabel(f);
          return (
            <div key={f.id} className="home-result-card">
              <span className="home-result-card__round">{roundLabel}</span>
              <div className="home-result-card__row">
                <span className={`home-result-card__team${homeWon ? ' home-result-card__team--winner' : ''}`}>
                  {homeName}
                </span>
                <span className="home-result-card__score">
                  {homeG}.{homeB}.{homeT}
                </span>
              </div>
              <div className="home-result-card__row">
                <span className={`home-result-card__team${!homeWon ? ' home-result-card__team--winner' : ''}`}>
                  {awayName}
                </span>
                <span className="home-result-card__score">
                  {awayG}.{awayB}.{awayT}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CoachHubBanner({ coaches = [] }: { coaches?: Coach[] }) {
  const { user } = useAuth();

  const myCoach = user ? coaches.find((c) => c.user_id === user.id) : null;
  const liveTeamName = myCoach?.team_name || undefined;
  const coachClubLabel = liveTeamName
    ? TEAM_SHORT_NAMES[liveTeamName] || liveTeamName
    : user ? 'Hub' : 'Finalists';
  const primaryHref = user ? '/members' : '/teams';
  const primaryLabel = user ? 'Coach Hub' : 'Club Tracker';
  const primaryMeta = user ? coachClubLabel : 'Finalists';

  return (
    <section className="home-module home-module--coachhub">
      <div className="home-quickLinks">
        <Link to={primaryHref} className="home-quickLink home-quickLink--coach">
          <LayoutDashboard size={15} className="home-quickLink__icon" />
          <span className="home-quickLink__label">{primaryLabel}</span>
          <span className="home-quickLink__meta">{primaryMeta}</span>
          <ArrowRight size={13} className="home-quickLink__arrow" />
        </Link>

      </div>
    </section>
  );
}

function FinalsHubSection(_props: { fixturesVisible: boolean; coaches?: Coach[] }) {
  const ladderQuery = useLadder('afl26-season-two');

  const premiersOptions = React.useMemo(
    () =>
      (ladderQuery.data || []).slice(0, 8).map((team, index) => ({
        key: team.team_slug,
        label: team.team_name,
        logoUrl: team.team_logo_url,
        rank: index + 1,
        points: team.points,
        percentage: team.percentage,
      })),
    [ladderQuery.data],
  );

  const showPremiersVote = FINALS_CONFIG.enabled && premiersOptions.length >= 2;

  if (!FINALS_CONFIG.enabled || !showPremiersVote) return null;

  return (
    <section className="home-finalsHub">
      <PremiersVoteCard
        pollKey="afl26-season-two-premiers-coaches"
        options={premiersOptions}
      />
    </section>
  );
}

function FinalsShowcaseSection({ fixturesVisible, coaches = [] }: { fixturesVisible: boolean; coaches?: Coach[] }) {
  const finalsFixturesQuery = useSeasonFixtures('afl26-season-two', {
    limit: 1000,
    enabled: fixturesVisible && FINALS_CONFIG.enabled,
  });

  const allFinalsFixtures = useMemo(
    () =>
      Array.isArray(finalsFixturesQuery.data?.fixtures)
        ? (finalsFixturesQuery.data?.fixtures || []).filter(isFinalsFixtureCandidate)
        : [],
    [finalsFixturesQuery.data?.fixtures],
  );
  const featuredFinalsFixture = useMemo(
    () => pickFeaturedFinalsFixture(allFinalsFixtures),
    [allFinalsFixtures],
  );
  const finalists = useMemo(() => collectFinalsTeams(allFinalsFixtures), [allFinalsFixtures]);
  const finalsCoaches = useMemo(
    () => filterFinalsCoaches(coaches, finalists),
    [coaches, finalists],
  );
  const liveCount = useMemo(
    () =>
      allFinalsFixtures.filter((fixture) => normalizeFixtureStatus(fixture.status, fixture) === 'LIVE').length,
    [allFinalsFixtures],
  );
  const completedCount = useMemo(
    () =>
      allFinalsFixtures.filter((fixture) => normalizeFixtureStatus(fixture.status, fixture) === 'FINAL').length,
    [allFinalsFixtures],
  );

  if (!fixturesVisible || !FINALS_CONFIG.enabled) return null;

  if (finalsFixturesQuery.isLoading && allFinalsFixtures.length === 0) {
    return (
      <section className="home-module home-module--finalsShowcase">
        <Skeleton className="home-finalsShowcase__skeleton" />
      </section>
    );
  }

  const spotlightHome = featuredFinalsFixture ? getFixtureTeamName(featuredFinalsFixture, 'home') : 'TBC';
  const spotlightAway = featuredFinalsFixture ? getFixtureTeamName(featuredFinalsFixture, 'away') : 'TBC';
  const spotlightVenue = toText(featuredFinalsFixture?.venue);
  const totalFinalsMatches = allFinalsFixtures.length || 9;
  const clubCount = finalists.length || 8;
  const nextActionCount = Math.max(totalFinalsMatches - completedCount, 0);
  const spotlightTitle = featuredFinalsFixture
    ? `${spotlightHome} vs ${spotlightAway}`
    : 'Top eight locked in';
  const spotlightBody = featuredFinalsFixture
    ? `${getFixturePrimaryLabel(featuredFinalsFixture)} • ${getFixtureStatusLabel(featuredFinalsFixture)}${
        spotlightVenue ? ` • ${spotlightVenue}` : ''
      }`
    : 'The top eight is set. The bracket is locked and the first finals matchups will land here as they go live.';
  const spotlightHref = featuredFinalsFixture ? `/match-centre/${featuredFinalsFixture.id}` : '/fixtures';
  const spotlightCta = featuredFinalsFixture ? 'Open Match Centre' : 'Open Finals Draw';
  const finalsCoachCount = finalsCoaches.length || coaches.length || clubCount;
  const progressLabel = allFinalsFixtures.length
    ? liveCount > 0
      ? `${liveCount} live now`
      : `${completedCount} complete`
    : 'Bracket locked';
  const thirdMetricValue = allFinalsFixtures.length ? (liveCount > 0 ? liveCount : nextActionCount) : 4;
  const thirdMetricLabel = allFinalsFixtures.length ? (liveCount > 0 ? 'Live' : 'To Play') : 'Weeks';

  return (
    <section className="home-module home-module--finalsShowcase">
      <div className="home-finalsShowcase__header">
        <div className="home-finalsShowcase__copy">
          <span className="home-finalsShowcase__eyebrow">{getFinalsLabel(FINALS_CONFIG.week) || 'Finals Central'}</span>
          <h2 className="home-finalsShowcase__title">Finals Series</h2>
          <p className="home-finalsShowcase__body">
            Every finals result, coach and standings in one place.
          </p>
        </div>
        <Link to="/fixtures" className="home-finalsShowcase__inlineLink">
          All Fixtures<ChevronRight size={13} />
        </Link>
      </div>

      <div className="home-finalsShowcase__pills">
        <span className="home-finalsShowcase__pill home-finalsShowcase__pill--accent">
          {clubCount} clubs alive
        </span>
        <span className="home-finalsShowcase__pill">
          {progressLabel}
        </span>
        {featuredFinalsFixture ? (
          <span className="home-finalsShowcase__pill">
            {getFixturePrimaryLabel(featuredFinalsFixture)}
          </span>
        ) : null}
      </div>

      {featuredFinalsFixture ? (
        <>
          <div className="home-finalsShowcase__summary">
            <div className="home-finalsShowcase__summaryCopy">
              <span className="home-finalsShowcase__summaryEyebrow">Spotlight</span>
              <h3 className="home-finalsShowcase__summaryTitle">{spotlightTitle}</h3>
              <p className="home-finalsShowcase__summaryBody">{spotlightBody}</p>
            </div>
            <Link to={spotlightHref} className="home-finalsShowcase__cta home-finalsShowcase__cta--ghost">
              {spotlightCta}
            </Link>
          </div>

          <div className="home-finalsShowcase__metricStrip">
            <span className="home-finalsShowcase__metricItem">
              <strong>{totalFinalsMatches}</strong>
              Matches
            </span>
            <span className="home-finalsShowcase__metricItem">
              <strong>{finalsCoachCount}</strong>
              Coaches
            </span>
            <span className="home-finalsShowcase__metricItem">
              <strong>{thirdMetricValue}</strong>
              {thirdMetricLabel}
            </span>
          </div>
        </>
      ) : null}

      <div className={`home-finalsShowcase__actionRow ${featuredFinalsFixture ? '' : 'home-finalsShowcase__actionRow--single'}`}>
        <Link to="/fixtures" className="home-finalsShowcase__cta">
          Open Finals Draw
        </Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const fixturesVisible = useFixtureVisibility(user?.role);
  const { data: coaches = [] } = useHomeCoaches();

  return (
    <div className="home-page">
      <main className="home-main">
        <div className="home-topStack">
          <HeroMasterCard />
          <FinalsHubSection fixturesVisible={fixturesVisible} coaches={coaches} />
          {fixturesVisible ? <FeaturedMatchCard coaches={coaches} /> : <LaunchPromoCard />}
        </div>
        <RecentResultsRibbon />
        <CoachHubBanner coaches={coaches} />
        <EgNewsSection />
      </main>
    </div>
  );
}
