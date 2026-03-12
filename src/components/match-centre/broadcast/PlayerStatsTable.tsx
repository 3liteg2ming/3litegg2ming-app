import { type KeyboardEvent, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-player-stats.css';

type StatKey = 'G' | 'D' | 'M' | 'T' | 'CLR' | 'K' | 'H';

const statOrder: { key: StatKey; label: string }[] = [
  { key: 'G', label: 'G' },
  { key: 'D', label: 'D' },
  { key: 'M', label: 'M' },
  { key: 'T', label: 'T' },
  { key: 'CLR', label: 'CLR' },
  { key: 'K', label: 'K' },
  { key: 'H', label: 'H' },
];

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase() || 'EG';
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function rowStatValue(row: PlayerStatRow, key: StatKey) {
  const value = row[key];
  return value === null || value === undefined ? null : Number(value);
}

function teamRows(rows: PlayerStatRow[], teamName: string) {
  return rows
    .filter((row) => row.team === teamName)
    .sort((a, b) => {
      if ((a.number || 0) !== (b.number || 0)) return (a.number || 0) - (b.number || 0);
      return a.name.localeCompare(b.name);
    });
}

export default function PlayerStatsTable({ model }: { model: MatchCentreModel | null }) {
  const navigate = useNavigate();

  const rows = model?.playerStats || [];
  const homeRows = useMemo(() => teamRows(rows, model?.home.fullName || ''), [model?.home.fullName, rows]);
  const awayRows = useMemo(() => teamRows(rows, model?.away.fullName || ''), [model?.away.fullName, rows]);

  const visibleStats = useMemo(() => {
    return statOrder.filter(({ key }) =>
      rows.some((row) => {
        const value = rowStatValue(row, key);
        return value !== null && value > 0;
      }),
    );
  }, [rows]);

  const hasStatOverlay = visibleStats.length > 0;

  const handleRowClick = (row: PlayerStatRow) => {
    if (!isUuidLike(row.playerId)) return;
    navigate(`/player/${row.playerId}`);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, row: PlayerStatRow) => {
    if (!isUuidLike(row.playerId)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(`/player/${row.playerId}`);
    }
  };

  return (
    <section className="mc-playerstats">
      <div className="mc-playerstats__header">
        <div className="mc-playerstats__titleWrap">
          <div className="mc-playerstats__kicker">Match Squad</div>
          <div className="mc-playerstats__title">Player Stats</div>
        </div>
        <div className="mc-playerstats__note">
          {hasStatOverlay
            ? 'Full match roster with submitted player stats overlay.'
            : 'Full match roster is live. Match stats will appear after submission.'}
        </div>
      </div>

      <div className="mc-playerstats__groups">
        <SquadGroup
          heading={model?.home.fullName || 'Home Team'}
          subheading={`${homeRows.length} players`}
          logoUrl={model?.home.logoUrl}
          fallbackLogo={model?.home.abbreviation || 'H'}
          rows={homeRows}
          emptyText="Home squad unavailable"
          visibleStats={visibleStats}
          hasStatOverlay={hasStatOverlay}
          onRowClick={handleRowClick}
          onRowKeyDown={handleRowKeyDown}
        />

        <SquadGroup
          heading={model?.away.fullName || 'Away Team'}
          subheading={`${awayRows.length} players`}
          logoUrl={model?.away.logoUrl}
          fallbackLogo={model?.away.abbreviation || 'A'}
          rows={awayRows}
          emptyText="Away squad unavailable"
          visibleStats={visibleStats}
          hasStatOverlay={hasStatOverlay}
          onRowClick={handleRowClick}
          onRowKeyDown={handleRowKeyDown}
        />
      </div>
    </section>
  );
}

function SquadGroup({
  heading,
  subheading,
  logoUrl,
  fallbackLogo,
  rows,
  emptyText,
  visibleStats,
  hasStatOverlay,
  onRowClick,
  onRowKeyDown,
}: {
  heading: string;
  subheading: string;
  logoUrl?: string;
  fallbackLogo: string;
  rows: PlayerStatRow[];
  emptyText: string;
  visibleStats: { key: StatKey; label: string }[];
  hasStatOverlay: boolean;
  onRowClick: (row: PlayerStatRow) => void;
  onRowKeyDown: (event: KeyboardEvent<HTMLButtonElement>, row: PlayerStatRow) => void;
}) {
  return (
    <article className="mc-playerstats__group">
      <div className="mc-playerstats__groupHead">
        <div className="mc-playerstats__groupIdentity">
            <div className="mc-playerstats__groupLogo">
            <SmartImg src={logoUrl || ''} alt={heading} className="mc-playerstats__groupLogoImg" fallbackText={fallbackLogo} />
            </div>
          <div>
            <div className="mc-playerstats__groupTitle">{heading}</div>
            <div className="mc-playerstats__groupSub">{subheading}</div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mc-playerstats__empty">{emptyText}</div>
      ) : (
        <div className="mc-playerstats__list">
          {rows.map((row, index) => {
            const rowClickable = isUuidLike(row.playerId);
            return (
              <button
                key={`${row.playerId || row.name}-${index}`}
                type="button"
                className={`mc-playerstats__row ${rowClickable ? 'is-linkable' : ''}`}
                onClick={rowClickable ? () => onRowClick(row) : undefined}
                onKeyDown={(event) => onRowKeyDown(event, row)}
              >
                <div className="mc-playerstats__identity">
                  <div className="mc-playerstats__avatar">
                    {row.photoUrl ? (
                      <SmartImg src={row.photoUrl} alt={row.name} className="mc-playerstats__avatarImg" />
                    ) : (
                      <div className="mc-playerstats__avatarFallback">{initials(row.name)}</div>
                    )}
                  </div>
                  <div className="mc-playerstats__meta">
                    <div className="mc-playerstats__nameRow">
                      <span className="mc-playerstats__name">{row.name}</span>
                      {row.number ? <span className="mc-playerstats__number">#{row.number}</span> : null}
                    </div>
                    <div className="mc-playerstats__subRow">
                      {row.position ? <span className="mc-playerstats__pos">{row.position}</span> : <span className="mc-playerstats__pos">Squad</span>}
                    </div>
                  </div>
                </div>

                <div className="mc-playerstats__stats">
                  {hasStatOverlay ? (
                    visibleStats.map(({ key, label }) => {
                      const value = rowStatValue(row, key);
                      return (
                        <div key={key} className="mc-playerstats__statChip">
                          <span className="mc-playerstats__statLabel">{label}</span>
                          <span className="mc-playerstats__statValue">{value === null ? '—' : value}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="mc-playerstats__rowHint">Roster ready</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
