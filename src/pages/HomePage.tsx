// src/pages/HomePage.tsx
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth/AuthProvider';

// Real data hooks
import { useLadder } from '../hooks/useLadder';
import { useNextFixtures } from '../hooks/useFixtures';

// Icons
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Columns3,
  LogIn,
  Shield,
  Trophy,
  User,
  Users,
  Info,
} from 'lucide-react';

// ====================================================================================
// 1. CONFIG & BRANDING CONSTANTS
// ====================================================================================
const HERO_BG_URL = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/stadium-bg-blurry.jpg';
const ELITE_GAMING_LOGO_URL = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/afl26-logo-v3-light.png';
const BGL_MEDIA_LOGO_URL = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/BGL%20Media%20Logo%20V2.svg';

const teamLogoFallbackUrl = (slug: string) => `https://cdn.afl.com.au/club-logos/AFL/${slug}.png`;

// ====================================================================================
// 2. TYPES
// ====================================================================================
type StatLeaderCategory = import('../lib/stats-leaders-cache').StatLeaderCategory;

export type HomeCoach = {
  user_id: string;
  display_name: string;
  psn: string;
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
};

// ====================================================================================
// 3. SAFE LOCAL REPO HOOKS
// ====================================================================================
const useHomeCoaches = () => {
  const [data, setData] = useState<HomeCoach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchCoaches = async () => {
      try {
        const repo = await import('../lib/homeRepo');
        // Safely invoke the repo function regardless of exact exported name
        const fetcher = (repo as any).getHomeCoaches || (repo as any).fetchHomeCoaches || (repo as any).getCoaches;
        if (fetcher) {
          const result = await fetcher();
          if (isMounted && result) setData(result);
        }
      } catch (err) {
        console.warn("Could not fetch homepage coaches:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchCoaches();
    return () => { isMounted = false; };
  }, []);

  return { data, isLoading };
};

const useHomeAnnouncements = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAnnouncements = async () => {
      try {
        const repo = await import('../lib/homeRepo');
        const fetcher = (repo as any).getHomeAnnouncements || (repo as any).fetchAnnouncements || (repo as any).getAnnouncements;
        if (fetcher) {
          const result = await fetcher();
          if (isMounted && result) setData(result);
        }
      } catch (err) {
        console.warn("Could not fetch homepage announcements:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchAnnouncements();
    return () => { isMounted = false; };
  }, []);

  return { data, isLoading };
};

const useHomepageStats = () => {
  const [data, setData] = useState<StatLeaderCategory[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const { fetchLeaderCategories, peekLeaderCategoriesCache } = await import('../lib/stats-leaders-cache');
        
        if (isMounted) {
            const cachedData = peekLeaderCategoriesCache('players');
            if (cachedData) {
                setData(cachedData);
                setIsLoading(false);
            } else {
                setIsLoading(true);
            }
        }

        const freshData = await fetchLeaderCategories('players');
        if (isMounted) setData(freshData);
      } catch (error) {
        console.warn("Failed to fetch homepage stats leaders:", error);
        if (isMounted) setData([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchStats();
    return () => { isMounted = false };
  }, []);
  
  const leaders = useMemo(() => {
    if (!data) return [];
    const desiredStats = ['goals', 'fantasyPoints', 'disposals', 'marks'];
    return desiredStats.map(statKey => data.find(c => c.statKey === statKey)).filter(Boolean) as StatLeaderCategory[];
  }, [data]);

  return { leaders, isLoading };
};

// ====================================================================================
// 4. REUSABLE UI COMPONENTS
// ====================================================================================
const GlassCard: React.FC<{ children: React.ReactNode; className?: string, onClick?: () => void }> = ({ children, className, onClick }) => (
  <div className={`glass-card ${className || ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    {children}
  </div>
);

const Section: React.FC<{ title: string; ctaLabel?: string; ctaPath?: string; children: React.ReactNode; className?: string;}> = ({ title, ctaLabel, ctaPath, children, className }) => (
  <section className={`home-section ${className || ''}`}>
    <header className="home-section-header">
      <h2 className="home-section-title">{title}</h2>
      {ctaLabel && ctaPath && (
        <Link to={ctaPath} className="home-section-cta">
          <span>{ctaLabel}</span>
          <ChevronRight size={18} />
        </Link>
      )}
    </header>
    <div className="home-section-content">
      {children}
    </div>
  </section>
);

const Skeleton: React.FC<{className?: string}> = ({className}) => <div className={`skeleton ${className || ''}`} />;

const BrandImage: React.FC<{ src: string; alt: string; fallbackText: string }> = ({ src, alt, fallbackText }) => {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <span className="brand-fallback-text">{fallbackText}</span>;
  return <img src={src} alt={alt} onError={() => setHasError(true)} />;
};

// ====================================================================================
// 5. HOMEPAGE SECTIONS
// ====================================================================================

// 5.1 --- HERO / MASTHEAD ---
const Hero = () => {
  const { user } = useAuth();
  const { data: announcements, isLoading } = useHomeAnnouncements();
  const announcement = announcements?.[0];

  return (
    <header className="home-hero" style={{ backgroundImage: `url(${HERO_BG_URL})` }}>
      <div className="hero-scrim" />
      <div className="hero-content">
        <div className="hero-branding">
          <div className="hero-brand-logo-capsule elite-gaming-logo">
            <BrandImage src={ELITE_GAMING_LOGO_URL} alt="Elite Gaming" fallbackText="ELITE GAMING" />
          </div>
          <div className="hero-brand-logo-capsule bgl-media-logo">
            <BrandImage src={BGL_MEDIA_LOGO_URL} alt="BGL Media" fallbackText="BGL MEDIA" />
          </div>
        </div>

        <div className="hero-title-group">
            <p className="hero-kicker">AFL 26 • Season Two</p>
            <h1 className="hero-headline">Elite Gaming Season Two</h1>
            <p className="hero-subline">Presented by BGL Media</p>
        </div>
        
        {!isLoading && announcement?.message && (
          <div className="hero-ticker">
            <Info size={16} className="hero-ticker-icon" />
            <p>{announcement.message}</p>
          </div>
        )}

        <div className="hero-cta-grid">
          <Link to="/ladder" className="hero-cta-item">
            <div className="cta-icon-wrapper"><Columns3 size={18} /></div>
            <span>Ladder</span>
          </Link>
          <Link to="/stats3" className="hero-cta-item">
            <div className="cta-icon-wrapper"><BarChart3 size={18} /></div>
            <span>Stats</span>
          </Link>
          <Link to="/fixtures" className="hero-cta-item">
            <div className="cta-icon-wrapper"><CalendarDays size={18} /></div>
            <span>Fixtures</span>
          </Link>
          <Link to={user ? "/members" : "/auth/sign-in"} className="hero-cta-item cta-primary">
            <div className="cta-icon-wrapper">{user ? <User size={18}/> : <LogIn size={18}/>}</div>
            <span>{user ? 'Profile' : 'Sign In'}</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

// 5.2 --- STATS SPOTLIGHT RAIL ---
const StatsSpotlightRail = () => {
  const { leaders, isLoading } = useHomepageStats();
  const navigate = useNavigate();

  return (
    <Section title="Stats Spotlight" ctaLabel="View All" ctaPath="/stats3">
      <div className="stats-rail-container">
        {isLoading && leaders.length === 0 ? (
          <div className="stats-rail">
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i} className="stat-card is-loading">
                <Skeleton className="h-4 w-24 mb-6" />
                <Skeleton className="h-12 w-20 mb-6" />
                <div className="stat-card-player">
                  <Skeleton className="stat-card-headshot-skeleton" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24 mt-2" />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : leaders.length > 0 ? (
          <div className="stats-rail">
            {leaders.map(({ statKey, label, top }) => top && (
              <GlassCard key={statKey} className="stat-card" onClick={() => navigate('/stats3')}>
                <div className="stat-card-header">
                  <h3 className="stat-card-label">{label}</h3>
                  <div className="stat-card-icon"><BarChart3 size={16} /></div>
                </div>
                <div className="stat-card-body">
                    <span className="stat-card-value">{top.valueTotal}</span>
                </div>
                <div className="stat-card-player">
                  <div className="stat-card-headshot">
                    {top.photoUrl ? <img src={top.photoUrl} alt={top.name} /> : <User size={28} className="fallback-avatar" />}
                  </div>
                  <div className="stat-card-player-details">
                    <p className="stat-card-player-name">{top.name}</p>
                    <p className="stat-card-player-team">{top.teamName}</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <div className="home-section-empty-state">
            <BarChart3 size={32} />
            <p>Stat leaderboards will appear after Round 1.</p>
          </div>
        )}
      </div>
    </Section>
  );
};

// 5.3 --- LADDER SNAPSHOT ---
const LadderSnapshot = () => {
  const { data, isLoading } = useLadder('afl26-season-two');
  const ladder = useMemo(() => Array.isArray(data) ? data.slice(0, 8) : [], [data]);
  
  return (
    <Section title="Ladder Snapshot" ctaLabel="Full Ladder" ctaPath="/ladder">
      <GlassCard className="ladder-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : ladder.length > 0 ? (
          <div className="ladder-table-wrapper">
            <table className="ladder-snapshot-table">
                <thead>
                    <tr>
                        <th className="rank-col">Pos</th>
                        <th className="team-col">Club</th>
                        <th className="points-col">Pts</th>
                        <th className="percent-col">%</th>
                    </tr>
                </thead>
                <tbody>
                {ladder.map((team: any, index: number) => (
                    <tr key={team.team_slug || index} className={index === 3 ? 'top-4-cutoff' : ''}>
                    <td className="rank-cell">
                        <span className={`rank ${index === 0 ? 'rank-first' : index < 4 ? 'rank-top-4' : ''}`}>{team.position || index + 1}</span>
                    </td>
                    <td className="team-cell">
                        <div className="ladder-team-logo-wrap">
                           <img src={teamLogoFallbackUrl(team.team_slug)} alt={team.team_name} className="team-logo" onError={(e) => e.currentTarget.style.display = 'none'} />
                        </div>
                        <span className="team-name">{team.team_name}</span>
                    </td>
                    <td className="points-cell">{team.points || 0}</td>
                    <td className="percent-cell">{(team.percentage || 0).toFixed(1)}</td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
        ) : (
          <div className="home-section-empty-state">
            <Columns3 size={32} />
            <p>The ladder will be available after Round 1.</p>
          </div>
        )}
      </GlassCard>
    </Section>
  );
};

// 5.4 --- MATCH HUB ---
const MatchHub = () => {
    const { user } = useAuth();
    const { data, isLoading } = useNextFixtures('afl26-season-two', 1);
    const navigate = useNavigate();

    // Safely extract the fixture whether the hook returns an array or an object
    const fixturesArray = Array.isArray(data) ? data : data?.fixtures;
    const fixture = fixturesArray?.[0];

    if(isLoading) return <Section title="Match Hub"><Skeleton className="h-48 w-full" /></Section>;
    
    if(!fixture) {
        return (
            <Section title="Match Hub">
                <div className="home-section-empty-state">
                    <CalendarDays size={32} />
                    <p>The schedule for Season Two will be released shortly.</p>
                </div>
            </Section>
        )
    }

    const title = user ? "My Next Match" : "Featured Match";

    return (
        <Section title={title} ctaLabel="All Fixtures" ctaPath="/fixtures">
            <GlassCard 
              className="match-hub-card" 
              onClick={() => navigate(`/match-centre/afl26-season-two/${fixture.round}/${fixture.id}`)}
            >
                <div className="match-hub-header">
                    <span className="match-hub-round">Round {fixture.round}</span>
                    <span className="match-hub-date">
                        {fixture.scheduled_at ? new Date(fixture.scheduled_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBD'}
                    </span>
                </div>
                <div className="match-hub-body">
                    <div className="match-team">
                        <div className="match-team-logo-wrapper">
                            <img src={teamLogoFallbackUrl(fixture.team_a)} alt={fixture.team_a} className="match-team-logo" />
                        </div>
                        <span className="match-team-name">{fixture.team_a?.replace(/-/g, ' ')}</span>
                    </div>
                    <div className="match-versus">
                        <span className="vs-badge">VS</span>
                    </div>
                    <div className="match-team">
                         <div className="match-team-logo-wrapper">
                            <img src={teamLogoFallbackUrl(fixture.team_b)} alt={fixture.team_b} className="match-team-logo" />
                        </div>
                        <span className="match-team-name">{fixture.team_b?.replace(/-/g, ' ')}</span>
                    </div>
                </div>
                <div className="match-hub-footer">
                    <span>Match Centre</span>
                    <ArrowRight size={16} />
                </div>
            </GlassCard>
        </Section>
    );
}

// 5.5 --- COACHES SPOTLIGHT ---
const CoachesSpotlight = () => {
  const { data: coaches, isLoading } = useHomeCoaches();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const CoachesModal = () => (
    <div className="coaches-modal-backdrop" onClick={() => setIsModalOpen(false)}>
      <div className="coaches-modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="coaches-modal-header">
            <h2>Season Coaches</h2>
            <button onClick={() => setIsModalOpen(false)}>&times;</button>
        </header>
        <div className="coaches-modal-grid">
            {coaches?.map(coach => (
                 <div key={coach.user_id} className="coach-card-modal">
                    <div className="coach-team-logo-modal-wrap">
                        <img src={coach.team_logo_url || teamLogoFallbackUrl(coach.team_id)} alt={coach.team_name} className="coach-team-logo-modal" />
                    </div>
                    <div className="coach-details-modal">
                        <p className="coach-name-modal">{coach.display_name}</p>
                        <p className="coach-team-modal">{coach.team_name}</p>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Section title="Coaches Spotlight">
        <div className="coaches-grid">
          {isLoading ? (
             Array.from({length: 6}).map((_, i) => <GlassCard key={i} className="coach-card is-loading"><Skeleton className="h-16 w-16 rounded-full" /></GlassCard>)
          ) : coaches?.slice(0, 6).map(coach => (
            <GlassCard key={coach.user_id} className="coach-card">
              <div className="coach-avatar-wrapper">
                  <img src={coach.team_logo_url || teamLogoFallbackUrl(coach.team_id)} alt={coach.team_name} className="coach-team-logo" />
              </div>
              <div className="coach-info">
                <p className="coach-name">{coach.display_name}</p>
                <p className="coach-team-name">{coach.team_name}</p>
              </div>
            </GlassCard>
          ))}
        </div>
        {coaches && coaches.length > 6 && (
            <button className="view-all-coaches-btn" onClick={() => setIsModalOpen(true)}>
                View All Coaches
            </button>
        )}
      </Section>
      {isModalOpen && <CoachesModal />}
    </>
  );
};

// 5.6 --- QUICK ACCESS ---
const QuickAccess = () => (
    <Section title="Quick Access" className="quick-access-section">
        <div className="quick-access-grid">
            <Link to="/ladder" className="quick-access-item"><Columns3 size={24} /><span>Ladder</span></Link>
            <Link to="/stats3" className="quick-access-item"><BarChart3 size={24} /><span>Stats</span></Link>
            <Link to="/fixtures" className="quick-access-item"><CalendarDays size={24} /><span>Fixtures</span></Link>
            <Link to="/match-centre" className="quick-access-item"><Trophy size={24} /><span>Matches</span></Link>
            <Link to="/members" className="quick-access-item"><Users size={24} /><span>Members</span></Link>
            <Link to="/clubs" className="quick-access-item"><Shield size={24} /><span>Clubs</span></Link>
        </div>
    </Section>
);

// ====================================================================================
// 6. MAIN PAGE COMPONENT
// ====================================================================================
export default function HomePage() {
  return (
    <div className="home-page-container">
      <Hero />
      <main className="home-main-content">
        <Suspense fallback={<Section title="Stats Spotlight"><Skeleton className="h-48 w-full" /></Section>}>
          <StatsSpotlightRail />
        </Suspense>
        <Suspense fallback={<Section title="Match Hub"><Skeleton className="h-64 w-full" /></Section>}>
          <MatchHub />
        </Suspense>
        <Suspense fallback={<Section title="Ladder Snapshot"><Skeleton className="h-96 w-full" /></Section>}>
          <LadderSnapshot />
        </Suspense>
        <Suspense fallback={<Section title="Coaches Spotlight"><Skeleton className="h-64 w-full" /></Section>}>
          <CoachesSpotlight />
        </Suspense>
        <QuickAccess />
      </main>
    </div>
  );
}