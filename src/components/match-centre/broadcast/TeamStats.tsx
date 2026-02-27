import { useMemo } from 'react';
import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel, TeamStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-team-stats.css';

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(s as TeamKey)) return s as TeamKey;
  const compact = s.replace(/[^a-z0-9]/g, '');
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

function StatRow({ stat, homeColor, awayColor }: { stat: TeamStatRow; homeColor: string; awayColor: string }) {
  const maxMatch = Math.max(stat.homeMatch, stat.awayMatch, 1);
  const homePercent = (stat.homeMatch / maxMatch) * 100;
  const awayPercent = (stat.awayMatch / maxMatch) * 100;

  return (
    <div className="mcTeamStatRow">
      {/* Home value */}
      <div className="mcTeamStatRow__home">
        <span className="mcTeamStatRow__value" style={{ color: homeColor }}>
          {stat.homeMatch}
        </span>
      </div>

      {/* Stat label centre */}
      <div className="mcTeamStatRow__centre">
        <span className="mcTeamStatRow__label">{stat.label}</span>
        <div className="mcTeamStatRow__bar">
          <div
            className="mcTeamStatRow__barHome"
            style={{ width: `${homePercent}%`, background: homeColor }}
          />
          <div
            className="mcTeamStatRow__barDivider"
          />
          <div
            className="mcTeamStatRow__barAway"
            style={{ width: `${awayPercent}%`, background: awayColor }}
          />
        </div>
      </div>

      {/* Away value */}
      <div className="mcTeamStatRow__away">
        <span className="mcTeamStatRow__value" style={{ color: awayColor }}>
          {stat.awayMatch}
        </span>
      </div>
    </div>
  );
}

export default function TeamStats({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo =
    home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : '');
  const awayLogo =
    away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : '');

  const stats = model?.teamStats || [];
  const isEmpty = !loading && stats.length === 0;

  return (
    <section className="mcTeamStats">
      <div className="mcTeamStats__header">
        <h2 className="mcTeamStats__title">Team Stats</h2>
        <p className="mcTeamStats__desc">Detailed comparison</p>
      </div>

      {isEmpty ? (
        <div className="mcTeamStats__empty">
          <div className="mcTeamStats__emptyText">Team stats not available yet</div>
          <p className="mcTeamStats__emptyDesc">
            Once coaches submit results and stats are verified, they will appear here
          </p>
        </div>
      ) : (
        <>
          <div className="mcTeamStats__teams">
            <div className="mcTeamStats__team">
              {homeLogo && (
                <SmartImg
                  src={homeLogo}
                  alt={home?.fullName || 'Home'}
                  className="mcTeamStats__logo"
                  fallbackText={home?.abbreviation || 'H'}
                />
              )}
              <span className="mcTeamStats__teamName">{home?.fullName || '—'}</span>
            </div>
            <div className="mcTeamStats__team mcTeamStats__team--away">
              <span className="mcTeamStats__teamName">{away?.fullName || '—'}</span>
              {awayLogo && (
                <SmartImg
                  src={awayLogo}
                  alt={away?.fullName || 'Away'}
                  className="mcTeamStats__logo"
                  fallbackText={away?.abbreviation || 'A'}
                />
              )}
            </div>
          </div>

          <div className="mcTeamStats__card">
            {(loading && !model ? Array.from({ length: 5 }) : stats).map((stat: any, idx: number) => (
              <StatRow
                key={stat?.label || idx}
                stat={stat}
                homeColor={home?.color || '#4a7fe1'}
                awayColor={away?.color || '#e14a4a'}
              />
            ))}
          </div>

          {/* Logos footer */}
          <div className="mcTeamStats__footer">
            <div />
            <div />
          </div>
        </>
      )}
    </section>
  );
}
