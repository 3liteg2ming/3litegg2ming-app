import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel, TeamStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-team-stats.css';

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

function tintForStatValue(hex: string, fallback: string) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return fallback;
  const lift = (v: number) => Math.max(120, Math.min(255, v + 35));
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

function StatRow({ stat, homeColor, awayColor }: { stat: TeamStatRow; homeColor: string; awayColor: string }) {
  const maxMatch = Math.max(stat.homeMatch, stat.awayMatch, 1);
  const homePercent = (stat.homeMatch / maxMatch) * 100;
  const awayPercent = (stat.awayMatch / maxMatch) * 100;
  const homeTint = tintForStatValue(homeColor, '#FFD44A');
  const awayTint = tintForStatValue(awayColor, '#7BD6FF');

  return (
    <div className="mcTeamStatRow">
      <div className="mcTeamStatRow__home">
        <span className="mcTeamStatRow__value" style={{ color: homeTint }}>
          {stat.homeMatch}
        </span>
      </div>

      <div className="mcTeamStatRow__centre">
        <span className="mcTeamStatRow__label">{stat.label}</span>
        <div className="mcTeamStatRow__bar">
          <div className="mcTeamStatRow__barHome" style={{ width: `${homePercent}%`, background: homeColor }} />
          <div className="mcTeamStatRow__barDivider" />
          <div className="mcTeamStatRow__barAway" style={{ width: `${awayPercent}%`, background: awayColor }} />
        </div>
      </div>

      <div className="mcTeamStatRow__away">
        <span className="mcTeamStatRow__value" style={{ color: awayTint }}>
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

  const homeLogo = home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const awayLogo = away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const stats = model?.teamStats || [];
  const isLoadingShell = !!loading && !model;
  const isEmpty = !isLoadingShell && stats.length === 0;
  const desc = model?.hasSubmissionData
    ? 'Side-by-side team comparison from the published result'
    : 'A richer stat pack will turn this into a live team comparison after submission';

  return (
    <section className="mcTeamStats">
      <div className="mcTeamStats__header">
        <h2 className="mcTeamStats__title">Team Stats</h2>
        <p className="mcTeamStats__desc">{desc}</p>
      </div>

      {isLoadingShell ? (
        <div className="mcTeamStats__empty">
          <div className="mcTeamStats__emptyText">Loading team stats…</div>
          <p className="mcTeamStats__emptyDesc">The baseline fixture is loading now.</p>
        </div>
      ) : isEmpty ? (
        <div className="mcTeamStats__empty">
          <div className="mcTeamStats__emptyText">Team stats not available yet</div>
          <p className="mcTeamStats__emptyDesc">If a richer stat pack is submitted later, it will appear here automatically.</p>
        </div>
      ) : (
        <div className="mcTeamStats__shell">
          <div className="mcTeamStats__teams">
            <div className="mcTeamStats__team">
              <SmartImg src={homeLogo} alt={home?.fullName || 'Home'} className="mcTeamStats__logo" fallbackText={home?.abbreviation || 'H'} />
              <div className="mcTeamStats__teamMeta">
                <span className="mcTeamStats__teamLabel">Home</span>
                <span className="mcTeamStats__teamName">{home?.fullName || '—'}</span>
              </div>
            </div>

            <div className="mcTeamStats__divider" aria-hidden="true" />

            <div className="mcTeamStats__team mcTeamStats__team--away">
              <div className="mcTeamStats__teamMeta mcTeamStats__teamMeta--away">
                <span className="mcTeamStats__teamLabel">Away</span>
                <span className="mcTeamStats__teamName">{away?.fullName || '—'}</span>
              </div>
              <SmartImg src={awayLogo} alt={away?.fullName || 'Away'} className="mcTeamStats__logo" fallbackText={away?.abbreviation || 'A'} />
            </div>
          </div>

          <div className="mcTeamStats__card">
            {stats.map((stat: any, idx: number) => (
              <StatRow
                key={stat?.label || idx}
                stat={stat}
                homeColor={home?.color || '#4a7fe1'}
                awayColor={away?.color || '#e14a4a'}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
