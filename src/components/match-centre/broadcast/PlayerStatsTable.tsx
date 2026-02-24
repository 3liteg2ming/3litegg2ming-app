import { useMemo, useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';

type SortKey = keyof PlayerStatRow;
type SortDir = 'asc' | 'desc';

const statColumns: { key: SortKey; label: string }[] = [
  { key: 'AF', label: 'AF' },
  { key: 'G', label: 'G' },
  { key: 'B', label: 'B' },
  { key: 'D', label: 'D' },
  { key: 'K', label: 'K' },
  { key: 'H', label: 'H' },
  { key: 'M', label: 'M' },
  { key: 'T', label: 'T' },
  { key: 'HO', label: 'HO' },
  { key: 'CLR', label: 'CLR' },
  { key: 'MG', label: 'MG' },
  { key: 'GA', label: 'GA' },
  { key: 'TOG', label: 'ToG%' },
];

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[parts.length - 1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

export default function PlayerStatsTable({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const homeName = model?.home?.fullName || 'Home';
  const awayName = model?.away?.fullName || 'Away';

  const teamOptions = useMemo(() => ['Both', homeName, awayName], [homeName, awayName]);

  const [teamFilter, setTeamFilter] = useState<string>('Both');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('G');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<'match' | 'season'>('match');

  const base = model?.playerStats || [];

  const filtered = useMemo(() => {
    let data = [...base];
    if (teamFilter !== 'Both') data = data.filter((p) => p.team === teamFilter);

    data.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return String(av).localeCompare(String(bv)) * (sortDir === 'desc' ? -1 : 1);
    });

    return data;
  }, [base, teamFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-6">
        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
          <Star className="w-6 h-6" /> Player Stats
        </h2>
        <p className="text-muted-foreground text-sm mt-1">See how the players are performing...</p>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-primary font-bold text-xs uppercase tracking-wider">Stats</span>
            <p className="font-bold text-foreground">Basic ▾</p>
          </div>

          <div className="relative">
            <div className="text-sm cursor-pointer select-none" onClick={() => setShowTeamDropdown((s) => !s)}>
              <span className="text-primary font-bold text-xs uppercase tracking-wider">Teams</span>
              <p className="font-bold text-foreground flex items-center gap-1">
                {teamFilter} <ChevronDown className="w-4 h-4 opacity-60" />
              </p>
            </div>

            {showTeamDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-border z-50 min-w-[180px] overflow-hidden">
                {teamOptions.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTeamFilter(t);
                      setShowTeamDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-semibold flex items-center justify-between transition-colors ${
                      teamFilter === t ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {t}
                    {teamFilter === t && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center rounded-full border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('match')}
            className={`px-5 py-2 text-sm font-bold transition-colors ${
              viewMode === 'match' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-foreground hover:bg-muted'
            }`}
          >
            Match
          </button>
          <button
            onClick={() => setViewMode('season')}
            className={`px-5 py-2 text-sm font-bold transition-colors ${
              viewMode === 'season' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-foreground hover:bg-muted'
            }`}
          >
            Season avg.
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border/50 overflow-hidden">
        {loading && !model ? (
          <div className="p-8 text-center">
            <div className="text-xl font-black text-foreground">Loading player stats…</div>
            <div className="mt-2 text-sm text-muted-foreground">Fetching match centre data.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-xl font-black text-foreground">No player stats yet</div>
            <div className="mt-2 text-sm text-muted-foreground">
              This will populate after match submissions (goal kickers + OCR stats).
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-white sticky top-0 z-10">
                <tr className="border-b border-border/50">
                  <th className="text-center px-3 py-3 text-muted-foreground font-bold">#</th>
                  <th className="text-left px-3 py-3 text-foreground font-black">Player</th>
                  {statColumns.map((col) => (
                    <th
                      key={col.key}
                      className="text-center px-2 py-3 text-foreground font-black cursor-pointer select-none hover:text-primary transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && <span className="ml-0.5">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((player) => {
                  const isHome = player.team === homeName;
                  const badgeColor = isHome ? (model?.home?.color || '#111') : (model?.away?.color || '#b00020');

                  const first = player.name.split(' ')[0] ?? player.name;
                  const last = player.name.split(' ').slice(1).join(' ');

                  return (
                    <tr
                      key={`${player.name}-${player.team}`}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <td className="text-center px-3 py-3">
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold"
                          style={{ backgroundColor: badgeColor }}
                        >
                          {player.number || '—'}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border/60 flex-shrink-0">
                            {player.photoUrl ? (
                              <SmartImg
                                src={player.photoUrl}
                                alt={player.name}
                                className="w-full h-full object-cover"
                                fallbackText={initials(player.name)}
                              />
                            ) : (
                              <span className="text-[11px] font-black text-foreground/70">{initials(player.name)}</span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-foreground whitespace-nowrap truncate max-w-[260px]">
                              <span className="font-normal">{first} </span>
                              <span className="font-bold">{last}</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">
                              {player.team}
                            </p>
                          </div>
                        </div>
                      </td>

                      {statColumns.map((col) => (
                        <td key={col.key} className="text-center px-2 py-3 tabular-nums text-foreground/80">
                          {viewMode === 'match' ? (player[col.key] as number) : (player[col.key] as number)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}