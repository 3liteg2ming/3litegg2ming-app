import { CalendarClock, Megaphone, ShieldCheck, Trophy, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../state/auth/AuthProvider';
import LadderPreviewCard, { type LadderPreviewRow } from '../components/LadderPreviewCard';
import LeaderCard, { type LeaderCardRow } from '../components/LeaderCard';
import { useLadder } from '../hooks/useLadder';
import '../styles/home.css';

const AFL26_LOGO_URL = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/afl26-logo.png';

function firstName(value?: string | null, email?: string | null) {
  const name = String(value || '').trim();
  if (name) return name.split(/\s+/)[0] || 'Coach';
  return String(email || '').trim().split('@')[0] || 'Coach';
}

function HomeSectionHeader({
  icon,
  title,
  actionText,
}: {
  icon: React.ReactNode;
  title: string;
  actionText?: string;
}) {
  return (
    <header className="homeSectionHead">
      <div className="homeSectionHead__left">
        <span className="homeSectionHead__icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </div>
      {actionText ? <span className="homeSectionHead__meta">{actionText}</span> : null}
    </header>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const coachFirstName = useMemo(() => firstName(user?.firstName || user?.displayName, user?.email), [user?.displayName, user?.email, user?.firstName]);

  // Fetch ladder for AFL 26 Season Two
  const { data: ladderData, isLoading: ladderLoading } = useLadder('afl26-season-two');

  // Prepare ladder preview rows with safe team keys
  const ladderRows: LadderPreviewRow[] = ladderData
    ?.sort((a, b) => b.points - a.points || b.percentage - a.percentage)
    .slice(0, 5)
    .map((row, index) => {
      // Safely map team_slug to TeamKey
      const teamKeyMap: Record<string, any> = {
        'adelaide': 'adelaide',
        'brisbane': 'brisbane',
        'carlton': 'carlton',
        'collingwood': 'collingwood',
        'essendon': 'essendon',
        'fremantle': 'fremantle',
        'geelong': 'geelong',
        'goldcoast': 'goldcoast',
        'gws': 'gws',
        'hawthorn': 'hawthorn',
        'melbourne': 'melbourne',
        'northmelbourne': 'northmelbourne',
        'portadelaide': 'portadelaide',
        'richmond': 'richmond',
        'stkilda': 'stkilda',
        'sydney': 'sydney',
        'westcoast': 'westcoast',
        'westernbulldogs': 'westernbulldogs',
      };
      const safeTeam = teamKeyMap[row.team_slug] || 'adelaide'; // fallback to adelaide
      return {
        pos: index + 1,
        team: safeTeam,
        gp: row.played,
        pts: row.points,
        pct: row.percentage,
      };
    }) || [];

  // Mock stats leaders (would fetch from actual stats)
  const goalsLeader: LeaderCardRow = {
    rank: 1,
    name: 'Example Player',
    team: 'Adelaide',
    value: 25,
  };

  return (
    <div className="homePage">
      <div className="homeShell">
        <section className="homeHeroIntro" aria-label="Launch intro">
          <div className="homeHeroIntro__copy">
            <div className="homeDashLabel">Elite Gaming</div>
            <h1 className="homeHeroIntro__title">AFL 26 Season Two</h1>
            <p className="homeHeroIntro__sub">Fixtures, ladder, stats and match centre for Elite Gaming AFL 26.</p>
          </div>
        </section>

        <section className="homeHeroCard" aria-label="AFL 26 Season Two launch">
          <div className="homeHeroCard__content">
            <div className="homeHeroCard__topline">
              <span className="homeHeroCard__kicker">
                <Zap size={14} /> Season Two
              </span>
              <img className="homeHeroCard__heroLogo" src={AFL26_LOGO_URL} alt="AFL 26" loading="lazy" />
            </div>

            <div className="homeHeroCard__copy">
              <h2>Season Two is live!</h2>
              <p>Round 1 kicks off next week. Follow your team, check the ladder, and dive into match centre for live updates.</p>
            </div>

            <div className="homeHeroCard__actions">
              <button type="button" className="homeHeroCard__cta" onClick={() => navigate('/fixtures')}>
                View Fixtures
              </button>
              <button
                type="button"
                className="homeHeroCard__ctaSecondary"
                onClick={() => navigate('/ladder')}
              >
                Check Ladder
              </button>
            </div>

            <p className="homeHeroCard__note">Welcome back, {coachFirstName}!</p>

            <div className="homeHeroMeta" aria-label="Season info">
              <div className="homeHeroMeta__item">
                <span className="homeHeroMeta__label">
                  <CalendarClock size={14} /> Next round
                </span>
                <strong className="homeHeroMeta__value">Starts next week</strong>
              </div>
              <div className="homeHeroMeta__item">
                <span className="homeHeroMeta__label">
                  <ShieldCheck size={14} /> Status
                </span>
                <strong className="homeHeroMeta__value">Season active</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="homeCard homeCard--compact" aria-label="Next fixture">
          <HomeSectionHeader icon={<CalendarClock size={15} />} title="Next Fixture" actionText="View all" />
          <div className="homeMiniFixture">
            <div className="homeMiniFixture__teams">
              <strong>Collingwood</strong>
              <span>vs</span>
              <strong>Carlton</strong>
            </div>
            <div className="homeMiniFixture__meta">MCG • Round 1</div>
          </div>
          <button type="button" className="homeCoachesPanel__cta" onClick={() => navigate('/fixtures')}>
            View Fixtures
          </button>
        </section>

        <section className="homeCard homeCard--compact" aria-label="Ladder snapshot">
          <HomeSectionHeader icon={<Trophy size={15} />} title="Ladder" actionText="Full ladder" />
          {ladderLoading ? (
            <div className="homeSkeleton homeSkeleton--table" />
          ) : ladderRows.length > 0 ? (
            <LadderPreviewCard rows={ladderRows} seasonLabel="Season Two" />
          ) : (
            <div className="homePendingState">
              <p className="homePendingState__title">Ladder will appear after Round 1</p>
              <p className="homePendingState__sub">Points and percentages will populate here once matches begin.</p>
            </div>
          )}
        </section>

        <section className="homeCard homeCard--compact" aria-label="Stats leaders">
          <HomeSectionHeader icon={<Trophy size={15} />} title="Goals Leaders" actionText="All stats" />
          <LeaderCard
            title="GOALS"
            leader={goalsLeader}
            onFull={() => navigate('/stats3')}
          />
        </section>

        <section className="homeCard homeCard--compact homeCard--quiet" aria-label="Season updates">
          <HomeSectionHeader icon={<Megaphone size={15} />} title="Season Updates" />
          <div className="homeAnnouncements">
            <article className="homeAnnouncementItem">
              <h3>Season Two format</h3>
              <p>2 home-and-away matches per team, followed by knockout finals.</p>
            </article>
            <article className="homeAnnouncementItem">
              <h3>Match centre live</h3>
              <p>Live scores, stats, and commentary for every game.</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
