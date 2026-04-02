import { type CSSProperties, memo } from 'react';
import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel, TeamStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-team-stats.css';

const TEAM_STAT_GROUPS = [
  { title: 'Scoring', labels: ['Score', 'Goals', 'Behinds', 'Goal Kickers'] },
  {
    title: 'Possession',
    labels: ['Disposals', 'Kicks', 'Handballs', 'Contested Possessions', 'Uncontested Possessions'],
  },
  {
    title: 'Field Position',
    labels: ['Inside 50s', 'Rebound 50s', 'Marks', 'Contested Marks', 'Intercept Marks'],
  },
  { title: 'Stoppages', labels: ['Hitouts', 'Clearances', 'Tackles'] },
  { title: 'Defence / Pressure', labels: ['Spoils', 'Frees For'] },
] as const;

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

function resolveTeamColor(primary?: string | null, secondary?: string | null, fallback = '#4a7fe1') {
  const first = String(primary || '').trim();
  if (first) return first;
  const second = String(secondary || '').trim();
  if (second) return second;
  return fallback;
}

/** Parse a hex colour to RGB components */
function hexToRgbComponents(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => `${c}${c}`).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 128,
    Number.isFinite(g) ? g : 128,
    Number.isFinite(b) ? b : 128,
  ];
}

/** Perceived colour distance (weighted Euclidean in RGB). Returns 0–765. */
function colorDistance(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgbComponents(hexA);
  const [r2, g2, b2] = hexToRgbComponents(hexB);
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3);
}

/** Secondary team colours for clash resolution */
const TEAM_SECONDARY_COLORS: Record<string, string> = {
  adelaide: '#f3c346',
  brisbane: '#2e76bc',
  carlton: '#6ca8ff',
  collingwood: '#8f9397',
  essendon: '#1f1f1f',
  fremantle: '#9a82d8',
  geelong: '#5d88c8',
  goldcoast: '#f2be3f',
  gws: '#4f5964',
  hawthorn: '#c8a96f',
  melbourne: '#e33542',
  northmelbourne: '#ffffff',
  portadelaide: '#73b5d9',
  richmond: '#ffd139',
  stkilda: '#c22d36',
  sydney: '#f5f5f5',
  westcoast: '#f2b31f',
  westernbulldogs: '#d23c4f',
};

/** If away colour is too close to home, swap to the away team's secondary colour. */
function resolveContrastingAwayColor(
  homeColor: string,
  awayColor: string,
  awayKey: string | null,
): string {
  const CLASH_THRESHOLD = 80;
  if (colorDistance(homeColor, awayColor) >= CLASH_THRESHOLD) return awayColor;
  const key = String(awayKey || '').toLowerCase().replace(/[^a-z]/g, '');
  const secondary = TEAM_SECONDARY_COLORS[key];
  if (secondary && colorDistance(homeColor, secondary) > CLASH_THRESHOLD) return secondary;
  // If no good secondary, lighten or invert
  return awayColor;
}

function ScoreHero({
  stat,
  homeName,
  awayName,
  homeColor,
  awayColor,
}: {
  stat: TeamStatRow;
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
}) {
  const homeLeading = stat.homeMatch > stat.awayMatch;
  const awayLeading = stat.awayMatch > stat.homeMatch;

  return (
    <div className="mcTeamStats__scoreHero">
      <div
        className={`mcTeamStats__scoreSide mcTeamStats__scoreSide--home${homeLeading ? ' is-leading' : ''}`}
        style={{ ['--mc-score-glow' as string]: homeColor }}
      >
        <span className="mcTeamStats__scoreLabel">Home</span>
        <span className="mcTeamStats__scoreTeam">{homeName}</span>
        <span className={`mcTeamStats__scoreValue${homeLeading ? ' is-leading' : ''}`}>{stat.homeMatch}</span>
      </div>

      <div className="mcTeamStats__scoreCentre">
        <span className="mcTeamStats__scoreEyebrow">Match Score</span>
        <span className="mcTeamStats__scoreDivider" aria-hidden="true" />
        <span className="mcTeamStats__scoreMeta">Published result comparison</span>
      </div>

      <div
        className={`mcTeamStats__scoreSide mcTeamStats__scoreSide--away${awayLeading ? ' is-leading' : ''}`}
        style={{ ['--mc-score-glow' as string]: awayColor }}
      >
        <span className="mcTeamStats__scoreLabel">Away</span>
        <span className="mcTeamStats__scoreTeam">{awayName}</span>
        <span className={`mcTeamStats__scoreValue${awayLeading ? ' is-leading' : ''}`}>{stat.awayMatch}</span>
      </div>
    </div>
  );
}

function StatRow({
  stat,
  homeColor,
  awayColor,
  rowIndex,
}: {
  stat: TeamStatRow;
  homeColor: string;
  awayColor: string;
  rowIndex: number;
}) {
  const bothZero = stat.homeMatch === 0 && stat.awayMatch === 0;
  const maxMatch = Math.max(stat.homeMatch, stat.awayMatch, 1);
  const homePercent = bothZero ? 100 : (stat.homeMatch / maxMatch) * 100;
  const awayPercent = bothZero ? 100 : (stat.awayMatch / maxMatch) * 100;
  const neutralFill = 'rgba(148, 163, 184, 0.24)';
  const rowStyle = {
    ['--mc-row-index' as string]: rowIndex,
  } as CSSProperties;

  return (
    <div className="mcTeamStatRow" style={rowStyle}>
      <div className="mcTeamStatRow__metric">
        <span className="mcTeamStatRow__value">{stat.homeMatch}</span>
      </div>

      <div className="mcTeamStatRow__centre">
        <div className="mcTeamStatRow__topline">
          <span className="mcTeamStatRow__label">{stat.label}</span>
          <span className="mcTeamStatRow__split">
            {stat.homeMatch} - {stat.awayMatch}
          </span>
        </div>
        <div className="mcTeamStatRow__bar">
          <div className="mcTeamStatRow__track mcTeamStatRow__track--home">
            <div
              className={`mcTeamStatRow__fill mcTeamStatRow__fill--home${bothZero ? ' is-neutral' : ''}`}
              style={
                {
                  ['--mc-bar-width' as string]: `${homePercent}%`,
                  ['--mc-bar-color' as string]: bothZero ? neutralFill : homeColor,
                } as CSSProperties
              }
            />
          </div>
          <div className="mcTeamStatRow__barDivider" />
          <div className="mcTeamStatRow__track mcTeamStatRow__track--away">
            <div
              className={`mcTeamStatRow__fill mcTeamStatRow__fill--away${bothZero ? ' is-neutral' : ''}`}
              style={
                {
                  ['--mc-bar-width' as string]: `${awayPercent}%`,
                  ['--mc-bar-color' as string]: bothZero ? neutralFill : awayColor,
                } as CSSProperties
              }
            />
          </div>
        </div>
      </div>

      <div className="mcTeamStatRow__metric mcTeamStatRow__metric--away">
        <span className="mcTeamStatRow__value">{stat.awayMatch}</span>
      </div>
    </div>
  );
}

function TeamStatsComponent({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo = home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const awayLogo = away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const homeColor = resolveTeamColor(home?.color, home?.colour, '#4a7fe1');
  const rawAwayColor = resolveTeamColor(away?.color, away?.colour, '#e14a4a');
  const awayColor = resolveContrastingAwayColor(homeColor, rawAwayColor, awayKey);
  const shellStyle = {
    ['--mc-team-home-color' as string]: homeColor,
    ['--mc-team-away-color' as string]: awayColor,
  } as CSSProperties;

  const stats = model?.teamStats || [];
  const scoreStat = stats.find((row) => row.label === 'Score') || null;
  const groupedSections = TEAM_STAT_GROUPS.map((group) => ({
    title: group.title,
    rows: group.labels
      .map((label) => stats.find((row) => row.label === label))
      .filter((row): row is TeamStatRow => Boolean(row)),
  })).filter((group) => group.rows.length > 0);
  const isLoadingShell = !!loading && !model;
  const isEmpty = !isLoadingShell && stats.length === 0;
  const desc = model?.hasSubmissionData
    ? 'Published match comparison'
    : 'Missing stat fields currently fall back to 0 until richer match data is submitted';
  let rowAnimationIndex = 0;

  return (
    <section className="mcTeamStats">
      <div className="mcTeamStats__header">
        <div>
          <h2 className="mcTeamStats__title">Team Stats</h2>
          <p className="mcTeamStats__desc">{desc}</p>
        </div>
        <span className="mcTeamStats__badge">Match Comparison</span>
      </div>

      {isLoadingShell ? (
        <div className="mcTeamStats__empty">
          <div className="mcTeamStats__emptyText">Loading team stats…</div>
          <p className="mcTeamStats__emptyDesc">The published result is loading now.</p>
        </div>
      ) : isEmpty ? (
        <div className="mcTeamStats__empty">
          <div className="mcTeamStats__emptyText">Team stats not available yet</div>
          <p className="mcTeamStats__emptyDesc">The match centre is still loading its comparison data.</p>
        </div>
      ) : (
        <div className="mcTeamStats__shell" style={shellStyle}>
          <div className="mcTeamStats__teams">
            <div className="mcTeamStats__team">
              <SmartImg
                src={homeLogo}
                alt={home?.fullName || 'Home'}
                className="mcTeamStats__logo"
                fallbackText={home?.abbreviation || 'H'}
                loading="eager"
                fetchPriority="high"
              />
              <div className="mcTeamStats__teamMeta">
                <span className="mcTeamStats__teamTopAccent" style={{ backgroundColor: homeColor }} aria-hidden="true" />
                <span className="mcTeamStats__teamLabel">
                  Home
                </span>
                <span className="mcTeamStats__teamName">{home?.fullName || '—'}</span>
              </div>
            </div>

            <div className="mcTeamStats__divider" aria-hidden="true" />

            <div className="mcTeamStats__team mcTeamStats__team--away">
              <div className="mcTeamStats__teamMeta mcTeamStats__teamMeta--away">
                <span className="mcTeamStats__teamTopAccent mcTeamStats__teamTopAccent--away" style={{ backgroundColor: awayColor }} aria-hidden="true" />
                <span className="mcTeamStats__teamLabel mcTeamStats__teamLabel--away">
                  Away
                </span>
                <span className="mcTeamStats__teamName">{away?.fullName || '—'}</span>
              </div>
              <SmartImg
                src={awayLogo}
                alt={away?.fullName || 'Away'}
                className="mcTeamStats__logo"
                fallbackText={away?.abbreviation || 'A'}
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          <div className="mcTeamStats__sections">
            {groupedSections.map((section) => {
              const sectionRows =
                section.title === 'Scoring'
                  ? section.rows.filter((row) => row.label !== 'Score')
                  : section.rows;

              return (
                <section className="mcTeamStats__section" key={section.title}>
                  <div className="mcTeamStats__sectionHeader">
                    <h3 className="mcTeamStats__sectionTitle">{section.title}</h3>
                    <span className="mcTeamStats__sectionRule" aria-hidden="true" />
                  </div>

                  {section.title === 'Scoring' && scoreStat ? (
                    <ScoreHero
                      stat={scoreStat}
                      homeName={home?.abbreviation || home?.shortName || home?.fullName || 'Home'}
                      awayName={away?.abbreviation || away?.shortName || away?.fullName || 'Away'}
                      homeColor={homeColor}
                      awayColor={awayColor}
                    />
                  ) : null}

                  <div className="mcTeamStats__sectionBody">
                    {sectionRows.map((stat, idx) => (
                      <StatRow
                        key={`${section.title}:${stat.label || idx}`}
                        stat={stat}
                        homeColor={homeColor}
                        awayColor={awayColor}
                        rowIndex={rowAnimationIndex++}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(TeamStatsComponent);
