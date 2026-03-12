import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import WormGraph from '@/components/match-centre/broadcast/WormGraph';
import '@/styles/match-centre-momentum.css';

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(s as TeamKey)) return s as TeamKey;
  const compact = s.replace(/[^a-z0-9]/g, '');
  if (keys.includes(compact as TeamKey)) return compact as TeamKey;
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
  return aliases[compact] || null;
}

function momentToneClass(tone?: 'good' | 'warn' | 'bad' | 'neutral') {
  if (tone === 'good') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'bad') return 'danger';
  return 'info';
}

export default function MatchTimeline({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo =
    home?.logoUrl ||
    (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const awayLogo =
    away?.logoUrl ||
    (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const progression = model?.quarterProgression || [];
  const moments = model?.moments || [];
  const isLoadingShell = !!loading && !model;
  const hasProgression = progression.length > 0;
  const wormDesc = hasProgression
    ? 'Score progression through the match'
    : model?.hasSubmissionData
      ? 'Quarter breakdown will appear once richer OCR data is available'
      : 'Awaiting the first submitted result';
  const momentsDesc = model?.hasSubmissionData
    ? 'Submission and publish checkpoints for this fixture'
    : 'What happens next before this match is locked in';

  return (
    <>
      <section className="mcMomentum">
        <div className="mcMomentum__header">
          <h2 className="mcMomentum__title">Momentum Worm</h2>
          <p className="mcMomentum__desc">{wormDesc}</p>
        </div>

        <div className="mcMomentum__card">
          <div className="mcMomentum__quarters">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
              <div key={i} className="mcMomentum__quarter">
                <span className="mcMomentum__quarterLabel">{q}</span>
              </div>
            ))}
          </div>

          <div className="mcMomentum__chartContainer">
            <div className="mcMomentum__logoLeft">
              {homeLogo && (
                <SmartImg
                  key={`timeline-home-${homeLogo}`}
                  src={homeLogo}
                  alt={home?.fullName || 'Home'}
                  className="mcMomentum__logoImg"
                  fallbackText={home?.abbreviation || 'H'}
                />
              )}
            </div>

            <div className="mcMomentum__worm">
              <div className="mcMomentum__midline" />
              {isLoadingShell || !model ? (
                <div className="mcMomentum__placeholder">
                  <div className="mcMomentum__placeholderDot" />
                </div>
              ) : (
                <WormGraph
                  progression={progression}
                  waitingLabel={model.hasSubmissionData ? 'Quarter data pending' : 'Awaiting first result'}
                />
              )}
            </div>

            <div className="mcMomentum__logoRight">
              {awayLogo && (
                <SmartImg
                  key={`timeline-away-${awayLogo}`}
                  src={awayLogo}
                  alt={away?.fullName || 'Away'}
                  className="mcMomentum__logoImg"
                  fallbackText={away?.abbreviation || 'A'}
                />
              )}
            </div>
          </div>

          <div className="mcMomentum__legend">
            <div className="mcMomentum__legendTeam">
              <span className="mcMomentum__legendLabel">{home?.fullName || '—'}</span>
            </div>
            <div className="mcMomentum__legendTeam" style={{ textAlign: 'right' }}>
              <span className="mcMomentum__legendLabel">{away?.fullName || '—'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mcMoments">
        <div className="mcMomentum__header">
          <h2 className="mcMomentum__title">Key Moments</h2>
          <p className="mcMomentum__desc">{momentsDesc}</p>
        </div>
        <div className="mcMomentum__card mcMoments__card">
          {isLoadingShell ? (
            <div className="mcMoments__empty">Loading moments…</div>
          ) : moments.length ? (
            <ul className="mcMoments__list">
              {moments.map((moment) => (
                <li key={moment.id} className="mcMoments__item">
                  <div className={`mcMoments__dot is-${momentToneClass(moment.tone)}`} />
                  <div className="mcMoments__body">
                    <div className="mcMoments__titleRow">
                      <span className="mcMoments__title">{moment.title}</span>
                      <span className="mcMoments__time">{moment.timeLabel}</span>
                    </div>
                    {moment.subtitle ? <div className="mcMoments__subtitle">{moment.subtitle}</div> : null}
                    {moment.detail ? <div className="mcMoments__detail">{moment.detail}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mcMoments__empty">{model?.hasSubmissionData ? 'Publish checkpoints pending' : 'Moments will appear after submission'}</div>
          )}
        </div>
      </section>
    </>
  );
}
