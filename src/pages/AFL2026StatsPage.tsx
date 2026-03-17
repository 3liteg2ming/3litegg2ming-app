import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Users, ArrowRight, Search, X } from 'lucide-react';
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  PlayerStatConfig,
  TeamStatConfig,
  StatsMode,
  StatsScope,
} from '@/types/stats2';
import { fetchAflPlayers } from '@/data/aflPlayers';
import { getStoredCompetitionKey } from '@/lib/competitionRegistry';
import { fetchActiveCompetitionBaseline } from '@/lib/seasonParticipantsRepo';
import { assetUrl, getTeamAssets } from '@/lib/teamAssets';
import type { StatLeaderCategory } from '@/lib/stats-leaders-cache';
import '@/styles/stats-home.css';

/* ── helpers ── */
const getInitials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

type StatsPlayerRow = {
  id: string;
  name: string;
  teamName: string;
  teamLogo?: string;
  teamPrimaryColor: string;
  teamSecondaryColor: string;
  position: string;
  number: string;
  headshotUrl: string;
  gamesPlayed: number;
  stats: Record<(typeof PLAYER_STAT_CONFIGS)[number]['key'], number>;
};

type StatsTeamRow = {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
  gamesPlayed: number;
  stats: Record<(typeof TEAM_STAT_CONFIGS)[number]['key'], number>;
};

type CompareSlot = 'left' | 'right';

const TEAM_TINT_FALLBACK: Record<string, { primary: string; secondary: string }> = {
  adelaide: { primary: '#002b5c', secondary: '#f3c346' },
  brisbane: { primary: '#7d1f43', secondary: '#2e76bc' },
  carlton: { primary: '#0d2e77', secondary: '#6ca8ff' },
  collingwood: { primary: '#2f2f31', secondary: '#8f9397' },
  essendon: { primary: '#c6252e', secondary: '#1f1f1f' },
  fremantle: { primary: '#2f195f', secondary: '#9a82d8' },
  geelong: { primary: '#0d3166', secondary: '#5d88c8' },
  goldcoast: { primary: '#bf2730', secondary: '#f2be3f' },
  gws: { primary: '#f06d2f', secondary: '#4f5964' },
  hawthorn: { primary: '#5a3418', secondary: '#c8a96f' },
  melbourne: { primary: '#0a1f4d', secondary: '#e33542' },
  northmelbourne: { primary: '#1b57b5', secondary: '#ffffff' },
  portadelaide: { primary: '#0f2433', secondary: '#73b5d9' },
  richmond: { primary: '#232323', secondary: '#ffd139' },
  stkilda: { primary: '#c22d36', secondary: '#202020' },
  st_kilda: { primary: '#c22d36', secondary: '#202020' },
  sydney: { primary: '#d12b3b', secondary: '#f5f5f5' },
  westcoast: { primary: '#063b88', secondary: '#f2b31f' },
  westernbulldogs: { primary: '#0f3f92', secondary: '#d23c4f' },
};

function normalizeTeamKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parsePlayerNumber(value: number | string | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  return String(Math.trunc(numeric));
}

function resolveLogoUrl(raw: string | null | undefined): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  return assetUrl(clean);
}

function resolveTeamColors(teamLabel: string) {
  const keyFromName = normalizeTeamKey(String(teamLabel || ''));
  const match = TEAM_TINT_FALLBACK[keyFromName];
  if (match) return match;

  return { primary: '#283443', secondary: '#6d8098' };
}

async function buildStatsPlayersFromDb(): Promise<StatsPlayerRow[]> {
  // Fetch the full competition roster
  const baseline = await fetchActiveCompetitionBaseline();
  const allAflPlayers = await fetchAflPlayers();

  // Build a map of players by ID for quick lookup
  const playerMap = new Map<string, typeof allAflPlayers[0]>();
  for (const p of allAflPlayers) {
    playerMap.set(p.id, p);
  }

  // Build a map of players by team for quick lookup
  const playersByTeam = new Map<string, typeof allAflPlayers>();
  for (const player of allAflPlayers) {
    const teamKey = String(player.teamKey || player.teamName || '').toLowerCase();
    if (!playersByTeam.has(teamKey)) {
      playersByTeam.set(teamKey, []);
    }
    playersByTeam.get(teamKey)!.push(player);
  }

  // Create result array that includes all players from all teams in the baseline
  const result: StatsPlayerRow[] = [];
  const seen = new Set<string>();

  // Go through baseline teams and include all their players
  for (const team of baseline.teams) {
    const teamPlayers = playersByTeam.get(team.teamKey.toLowerCase()) || [];

    for (const player of teamPlayers) {
      if (seen.has(player.id)) continue;
      seen.add(player.id);

      const tint = resolveTeamColors(player.teamName || team.name);

      result.push({
        id: String(player.id || ''),
        name: String(player.name || '').trim() || 'Player',
        teamName: String(player.teamName || team.name),
        teamLogo: resolveLogoUrl(
          player.teamName ? (getTeamAssets(player.teamName)?.logo || '') : (team.logoUrl || '')
        ) || undefined,
        teamPrimaryColor: tint.primary,
        teamSecondaryColor: tint.secondary,
        position: String(player.position || '').trim(),
        number: parsePlayerNumber(player.number),
        headshotUrl: String(player.headshotUrl || '').trim(),
        gamesPlayed: Number(player.gamesPlayed || 0),
        stats: {
          goals: Number(player.goals || 0),
          disposals: Number(player.disposals || 0),
          marks: Number(player.marks || 0),
          tackles: Number(player.tackles || 0),
          clearances: Number(player.clearances || 0),
          fantasyPoints:
            Number(player.fantasyPoints || 0) ||
            Number(player.disposals || 0) +
              Number(player.marks || 0) * 3 +
              Number(player.tackles || 0) * 4 +
              Number(player.goals || 0) * 6,
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function buildStatsTeamsFromDb(): Promise<StatsTeamRow[]> {
  const baseline = await fetchActiveCompetitionBaseline();
  return baseline.teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName || team.name,
      logoUrl: resolveLogoUrl(team.logoUrl || ''),
      gamesPlayed: 0,
      stats: Object.fromEntries(TEAM_STAT_CONFIGS.map((cfg) => [cfg.key, 0])) as StatsTeamRow['stats'],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ═══════════════════════════════════════════ */
/*                STATS HOME                  */
/* ═══════════════════════════════════════════ */
const StatsHomePage: React.FC = () => {
  const [mode, setMode] = useState<StatsMode>('players');
  const [scope, setScope] = useState<StatsScope>('total');
  const [remoteCategories, setRemoteCategories] = useState<StatLeaderCategory[]>([]);
  const [leadersLoading, setLeadersLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<StatsPlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState<boolean>(true);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [teams, setTeams] = useState<StatsTeamRow[]>([]);
  const [teamsLoading, setTeamsLoading] = useState<boolean>(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [playerCompareIds, setPlayerCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [teamCompareIds, setTeamCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [playerPickerSlot, setPlayerPickerSlot] = useState<CompareSlot | null>(null);
  const [teamPickerSlot, setTeamPickerSlot] = useState<CompareSlot | null>(null);
  const [playerPickerSearch, setPlayerPickerSearch] = useState<string>('');
  const [teamPickerSearch, setTeamPickerSearch] = useState<string>('');
  const navigate = useNavigate();
  const competitionLabel = getStoredCompetitionKey() === 'preseason' ? 'Knockout Preseason' : 'AFL 26 Season Two';

  const statConfigs = mode === 'players' ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;

  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    setPlayersError(null);

    buildStatsPlayersFromDb()
      .then((rows) => {
        if (cancelled) return;
        setPlayers(rows);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setPlayers([]);
        setPlayersError(error?.message || 'Unable to load players');
      })
      .finally(() => {
        if (!cancelled) setPlayersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    setTeamsError(null);
    buildStatsTeamsFromDb()
      .then((rows) => {
        if (cancelled) return;
        setTeams(rows);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setTeams([]);
        setTeamsError(error?.message || 'Unable to load teams');
      })
      .finally(() => {
        if (!cancelled) setTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLeadersLoading(true);
    import('@/lib/stats-leaders-cache')
      .then(async (mod) => {
        const cached = mod.peekLeaderCategoriesCache(mode) || [];
        if (!cancelled && cached.length > 0) {
          setRemoteCategories(cached);
          setLeadersLoading(false);
        }
        return mod.fetchLeaderCategories(mode);
      })
      .then((rows) => {
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setRemoteCategories(rows);
          return;
        }
        if (remoteCategories.length === 0) setRemoteCategories([]);
      })
      .catch(() => {
        // Preserve last good data on transient fetch errors.
      })
      .finally(() => {
        if (!cancelled) setLeadersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (players.length === 0) return;
    setPlayerCompareIds((current) => [
      current[0] || players[0]?.id || null,
      current[1] || players[1]?.id || players[0]?.id || null,
    ]);
  }, [players]);

  useEffect(() => {
    if (teams.length === 0) return;
    setTeamCompareIds((current) => [
      current[0] || teams[0]?.id || null,
      current[1] || teams[1]?.id || teams[0]?.id || null,
    ]);
  }, [teams]);

  const comparePlayers = useMemo(
    () => playerCompareIds.map((id) => players.find((row) => row.id === id) || null) as [StatsPlayerRow | null, StatsPlayerRow | null],
    [playerCompareIds, players],
  );

  const compareTeams = useMemo(
    () => teamCompareIds.map((id) => teams.find((row) => row.id === id) || null) as [StatsTeamRow | null, StatsTeamRow | null],
    [teamCompareIds, teams],
  );

  const filteredPlayers = useMemo(() => {
    if (!playerPickerSearch.trim()) return players;
    const search = playerPickerSearch.toLowerCase();
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.teamName.toLowerCase().includes(search) ||
        p.position.toLowerCase().includes(search)
    );
  }, [players, playerPickerSearch]);

  const filteredTeams = useMemo(() => {
    if (!teamPickerSearch.trim()) return teams;
    const search = teamPickerSearch.toLowerCase();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.shortName.toLowerCase().includes(search)
    );
  }, [teams, teamPickerSearch]);

  const selectComparedPlayer = (slot: CompareSlot, id: string) => {
    setPlayerCompareIds((current) => (slot === 'left' ? [id, current[1] || id] : [current[0] || id, id]));
    setPlayerPickerSlot(null);
    setPlayerPickerSearch('');
  };

  const selectComparedTeam = (slot: CompareSlot, id: string) => {
    setTeamCompareIds((current) => (slot === 'left' ? [id, current[1] || id] : [current[0] || id, id]));
    setTeamPickerSlot(null);
    setTeamPickerSearch('');
  };

  return (
    <div className="eg-stats-page pb-28">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-2xl font-black tracking-tight">Stats</h1>
        <span
          className="text-xs font-bold px-3 py-1.5 rounded-full eg-glass"
          style={{ color: 'hsla(0,0%,100%,0.55)' }}
        >
          {competitionLabel}
        </span>
      </div>

      {/* ── Mode toggle ── */}
      <div className="px-5 mt-3">
        <div className="eg-toggle-bar">
          <button
            className={`eg-toggle-btn ${mode === 'players' ? 'active' : ''}`}
            onClick={() => setMode('players')}
          >
            <User size={15} /> Players
          </button>
          <button
            className={`eg-toggle-btn ${mode === 'teams' ? 'active' : ''}`}
            onClick={() => setMode('teams')}
          >
            <Users size={15} /> Teams
          </button>
        </div>
      </div>

      {/* ── Section heading ── */}
      <div className="px-5 mt-6 mb-1">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-extrabold">Season Leaders</h2>
          <div className="eg-chip-bar">
            {(['total', 'average'] as const).map((s) => (
              <button
                key={s}
                className={`eg-chip ${scope === s ? 'active' : ''}`}
                onClick={() => setScope(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="eg-gradient-line mt-2" />
      </div>

      {/* ── Carousel ── */}
      <div className="mt-4">
        <div className="eg-carousel">
          {leadersLoading && remoteCategories.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`leader-skeleton-${i}`}
                  className="eg-leader-card"
                  aria-hidden="true"
                  style={{ opacity: 0.9 }}
                >
                  <div
                    className="eg-leader-hero"
                    style={{ background: 'linear-gradient(180deg, #1a1a1f 0%, #0f1015 100%)' }}
                  >
                    <div className="eg-leader-hero-overlay" />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(110deg, rgba(255,255,255,0) 25%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 75%)',
                        animation: 'egShimmer 1.3s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <div className="eg-runners" style={{ minHeight: 176 }} />
                  <div className="eg-card-cta" style={{ opacity: 0.55 }}>
                    Loading…
                  </div>
                </div>
              ))
            : statConfigs.map((cfg) => (
                <LeaderCard
                  key={cfg.key}
                  cfg={cfg}
                  mode={mode}
                  scope={scope}
                  remoteCategory={remoteCategories.find((c) => c.statKey === (cfg.key as any))}
                  allPlayers={mode === 'players' ? players : []}
                  allTeams={mode === 'teams' ? teams : []}
                  deferFallback={leadersLoading && remoteCategories.length === 0}
                />
              ))}
          <div style={{ flexShrink: 0, width: 6 }} />
        </div>
      </div>

      <div className="px-5 mt-5">
        {mode === 'players' ? (
          <div className="eg-compare-section eg-glass">
            <div className="egCompareHeaderRow">
              <div>
                <div className="egCompareTitle">Compare Players</div>
                <p className="egCompareSub">Use the full competition roster to compare two players side by side.</p>
              </div>
              <button type="button" className="egCompareMore" onClick={() => setPlayerPickerSlot('left')}>
                Choose Players <ArrowRight size={13} />
              </button>
            </div>

            <div className="egCompareCards">
              {(['left', 'right'] as const).map((slot, index) => {
                const player = comparePlayers[index];
                return (
                  <button
                    key={slot}
                    type="button"
                    className="egCompareCard"
                    onClick={() => setPlayerPickerSlot(slot)}
                  >
                    <div className="egCompareCard__avatar">
                      {player?.headshotUrl ? (
                        <img src={player.headshotUrl} alt={player.name} loading="lazy" decoding="async" />
                      ) : (
                        <span className="mini-initials">{getInitials(player?.name || slot)}</span>
                      )}
                    </div>
                    <div className="egCompareCard__meta">
                      <strong>{player?.name || 'Select player'}</strong>
                      <span>{player ? `${player.teamName}${player.position ? ` • ${player.position}` : ''}` : 'Tap to choose from the roster'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="egCompareStats">
              {PLAYER_STAT_CONFIGS.map((cfg) => (
                <div key={cfg.key} className="egCompareStatRow">
                  <span className="egCompareStatRow__value">{comparePlayers[0]?.stats[cfg.key] ?? 0}</span>
                  <span className="egCompareStatRow__label">{cfg.label}</span>
                  <span className="egCompareStatRow__value egCompareStatRow__value--right">{comparePlayers[1]?.stats[cfg.key] ?? 0}</span>
                </div>
              ))}
            </div>

            <div className="egCompareRosterMeta">
              {playersLoading ? 'Loading roster…' : playersError ? 'Unable to load players right now.' : `${players.length} players available`}
            </div>
          </div>
        ) : (
          <div className="eg-compare-section eg-glass">
            <div className="egCompareHeaderRow">
              <div>
                <div className="egCompareTitle">Compare Teams</div>
                <p className="egCompareSub">Compare clubs from the active competition baseline, even before richer team stats arrive.</p>
              </div>
              <button type="button" className="egCompareMore" onClick={() => setTeamPickerSlot('left')}>
                Choose Teams <ArrowRight size={13} />
              </button>
            </div>

            <div className="egCompareCards">
              {(['left', 'right'] as const).map((slot, index) => {
                const team = compareTeams[index];
                return (
                  <button
                    key={slot}
                    type="button"
                    className="egCompareCard egCompareCard--team"
                    onClick={() => setTeamPickerSlot(slot)}
                  >
                    <div className="egCompareCard__avatar egCompareCard__avatar--team">
                      {team?.logoUrl ? (
                        <img src={team.logoUrl} alt={team.name} loading="lazy" decoding="async" />
                      ) : (
                        <span className="mini-initials">{getInitials(team?.shortName || slot)}</span>
                      )}
                    </div>
                    <div className="egCompareCard__meta">
                      <strong>{team?.name || 'Select team'}</strong>
                      <span>{team ? `${team.shortName} • ${team.gamesPlayed} matches` : 'Tap to choose from the competition'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="egCompareStats">
              {TEAM_STAT_CONFIGS.map((cfg) => (
                <div key={cfg.key} className="egCompareStatRow">
                  <span className="egCompareStatRow__value">{compareTeams[0]?.stats[cfg.key] ?? 0}</span>
                  <span className="egCompareStatRow__label">{cfg.label}</span>
                  <span className="egCompareStatRow__value egCompareStatRow__value--right">{compareTeams[1]?.stats[cfg.key] ?? 0}</span>
                </div>
              ))}
            </div>

            <div className="egCompareRosterMeta">
              {teamsLoading ? 'Loading clubs…' : teamsError ? 'Unable to load teams right now.' : `${teams.length} teams available`}
            </div>
          </div>
        )}
      </div>

      {playerPickerSlot ? (
        <div className="eg-compare-modal">
          <button type="button" className="eg-compare-modal__backdrop" onClick={() => {
            setPlayerPickerSlot(null);
            setPlayerPickerSearch('');
          }} aria-label="Close player picker" />
          <div className="eg-compare-modal__sheet eg-glass">
            <div className="eg-compare-modal__head">
              <h4>{playerPickerSlot === 'left' ? 'Select left player' : 'Select right player'}</h4>
              <button type="button" className="eg-compare-modal__close" onClick={() => {
                setPlayerPickerSlot(null);
                setPlayerPickerSearch('');
              }}>×</button>
            </div>
            <div className="eg-compare-modal__search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name, team, or position…"
                value={playerPickerSearch}
                onChange={(e) => setPlayerPickerSearch(e.target.value)}
                autoFocus
              />
              {playerPickerSearch && (
                <button
                  type="button"
                  onClick={() => setPlayerPickerSearch('')}
                  className="eg-compare-modal__search-clear"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="eg-compare-modal__list">
              {filteredPlayers.length > 0 ? (
                filteredPlayers.map((player) => (
                  <button key={player.id} type="button" className="eg-compare-modal__item" onClick={() => selectComparedPlayer(playerPickerSlot, player.id)}>
                    <div className="eg-compare-modal__avatar">
                      {player.headshotUrl ? <img src={player.headshotUrl} alt={player.name} loading="lazy" decoding="async" /> : <span className="mini-initials">{getInitials(player.name)}</span>}
                    </div>
                    <div className="eg-compare-modal__meta">
                      <span>{player.name}</span>
                      <small>{player.teamName}{player.position ? ` • ${player.position}` : ''}</small>
                    </div>
                  </button>
                ))
              ) : (
                <div className="eg-compare-modal__empty">
                  No players match your search
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {teamPickerSlot ? (
        <div className="eg-compare-modal">
          <button type="button" className="eg-compare-modal__backdrop" onClick={() => {
            setTeamPickerSlot(null);
            setTeamPickerSearch('');
          }} aria-label="Close team picker" />
          <div className="eg-compare-modal__sheet eg-glass">
            <div className="eg-compare-modal__head">
              <h4>{teamPickerSlot === 'left' ? 'Select left team' : 'Select right team'}</h4>
              <button type="button" className="eg-compare-modal__close" onClick={() => {
                setTeamPickerSlot(null);
                setTeamPickerSearch('');
              }}>×</button>
            </div>
            <div className="eg-compare-modal__search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by team name…"
                value={teamPickerSearch}
                onChange={(e) => setTeamPickerSearch(e.target.value)}
                autoFocus
              />
              {teamPickerSearch && (
                <button
                  type="button"
                  onClick={() => setTeamPickerSearch('')}
                  className="eg-compare-modal__search-clear"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="eg-compare-modal__list">
              {filteredTeams.length > 0 ? (
                filteredTeams.map((team) => (
                  <button key={team.id} type="button" className="eg-compare-modal__item" onClick={() => selectComparedTeam(teamPickerSlot, team.id)}>
                    <div className="eg-compare-modal__avatar">
                      {team.logoUrl ? <img src={team.logoUrl} alt={team.name} loading="lazy" decoding="async" /> : <span className="mini-initials">{getInitials(team.name)}</span>}
                    </div>
                    <div className="eg-compare-modal__meta">
                      <span>{team.name}</span>
                      <small>{team.shortName}</small>
                    </div>
                  </button>
                ))
              ) : (
                <div className="eg-compare-modal__empty">
                  No teams match your search
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/* ═══════════════════════════════════════════ */
/*               LEADER CARD                  */
/* ═══════════════════════════════════════════ */
interface LeaderCardProps {
  cfg: PlayerStatConfig | TeamStatConfig;
  mode: StatsMode;
  scope: StatsScope;
  remoteCategory?: StatLeaderCategory;
  allPlayers: StatsPlayerRow[];
  allTeams: StatsTeamRow[];
  deferFallback?: boolean;
}

const LeaderCard: React.FC<LeaderCardProps> = ({
  cfg,
  mode,
  scope,
  remoteCategory,
  allPlayers,
  allTeams,
  deferFallback = false,
}) => {
  const navigate = useNavigate();

  // Get roster based on mode
  const roster = mode === 'players' ? allPlayers : allTeams;

  const sorted = useMemo(() => {
    if (deferFallback && !remoteCategory?.top) return [];
    if (!remoteCategory?.top) {
      // No remote stats yet, sort roster alphabetically
      if (mode === 'players') {
        return (allPlayers || []).slice(0, 5).map((p) => ({
          id: p.id,
          name: p.name,
          teamName: p.teamName,
          teamKey: p.teamName,
          teamResolved: true,
          headshotUrl: p.headshotUrl || '',
          logoUrl: '',
          total: 0,
          average: 0,
        }));
      } else {
        return (allTeams || []).slice(0, 5).map((t) => ({
          id: t.id,
          name: t.name,
          teamName: t.name,
          teamKey: t.name,
          teamResolved: true,
          headshotUrl: '',
          logoUrl: t.logoUrl || '',
          total: 0,
          average: 0,
        }));
      }
    }

    const rows = [remoteCategory.top, ...remoteCategory.others].slice(0, 5);
    return rows.map((r) => ({
      id: r.id || '',
      name: r.name,
      teamName: r.teamName,
      teamKey: r.teamKey,
      teamResolved: (r as any).teamResolved !== false,
      headshotUrl: r.photoUrl || '',
      logoUrl: r.photoUrl || '',
      total: r.valueTotal,
      average: r.valueAvg,
    }));
  }, [deferFallback, remoteCategory, allPlayers, allTeams, mode]);

  const leader = sorted[0];
  if (!leader) {
    return (
      <div className="eg-leader-card" aria-label={`${cfg.label} unavailable`}>
        <div
          className="eg-leader-hero"
          style={{ background: 'linear-gradient(180deg, #171b22 0%, #0d1117 100%)' }}
        >
          <div className="eg-leader-hero-overlay" />
          <div className="eg-leader-stat-chip">{cfg.label}</div>
          <div className="eg-leader-value">
            <span className="big-num">—</span>
          </div>
          <div className="eg-leader-name">
            <div className="first">No stats</div>
            <div className="last">submitted yet</div>
            <div className="team-sub">Submit Results to populate leaders</div>
          </div>
        </div>
        <div className="eg-runners" style={{ minHeight: 180 }} />
        <button className="eg-card-cta" onClick={() => navigate(`/stats3/leaders?mode=${mode}&stat=${cfg.key}&scope=${scope}`)}>
          Full Table <ArrowRight size={13} />
        </button>
      </div>
    );
  }
  const runners = sorted.slice(1);
  const leaderValue =
    remoteCategory?.top
      ? (scope === 'average' ? (leader as any).average : (leader as any).total)
      : 0;

  const leaderTeamResolved = (leader as any)?.teamResolved !== false;
  const leaderTeamRef =
    mode === 'players'
      ? (leaderTeamResolved ? ((leader as any).teamKey || (leader as any).teamName || '') : '')
      : ((leader as any).name || '');
  const leaderTeamName = mode === 'players' ? ((leader as any).teamName || '') : (leader as any).name;
  const teamAsset = leaderTeamRef
    ? getTeamAssets(leaderTeamRef)
    : {
        key: 'unknown',
        name: leaderTeamName || 'Unknown Team',
        primary: '#1f2937',
        primaryHex: '#1f2937',
        dark: '#111827',
        logo: '',
      };

  const firstName = mode === 'players' ? String((leader as any).name || '').split(' ')[0] : '';
  const lastName = mode === 'players' ? String((leader as any).name || '').split(' ').slice(1).join(' ') : '';
  const imgSrc = mode === 'players' ? ((leader as any).headshotUrl || (leader as any).photoUrl || '') : ((leader as any).logoUrl || (leader as any).photoUrl || '');
  const leaderName = String((leader as any).name || '');
  const leaderPlayerId = mode === 'players' ? String((remoteCategory?.top as any)?.id || (leader as any).id || '') : '';
  const leaderClickable = mode === 'players' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leaderPlayerId);

  const handleFull = () => navigate(`/stats3/leaders?mode=${mode}&stat=${cfg.key}&scope=${scope}`);

  return (
    <div className="eg-leader-card">
      <div
        className="eg-leader-hero"
        style={{
          background: `linear-gradient(180deg, ${teamAsset.primary} 0%, ${teamAsset.dark} 100%)`,
        }}
      >
        <div className="eg-leader-hero-overlay" />

        <div
          className="eg-leader-hero-glow"
          style={{
            background: `radial-gradient(ellipse at 30% 90%, ${teamAsset.primaryHex}aa 0%, transparent 65%)`,
          }}
        />

        {mode === 'players' && teamAsset.logo && (
          <div className="eg-leader-team-logo">
            <img src={teamAsset.logo} alt={leaderTeamName} />
          </div>
        )}

        <div className="eg-leader-stat-chip">{cfg.label}</div>

        <div className="eg-leader-value">
          <span className="big-num">{leaderValue}</span>
          {scope === 'average' && <span className="per-game">per game</span>}
        </div>

        {mode === 'players' ? (
          <div className="eg-leader-name">
            <div className="first">{firstName}</div>
            <div
              className={`last ${leaderClickable ? 'is-link' : ''}`}
              role={leaderClickable ? 'button' : undefined}
              tabIndex={leaderClickable ? 0 : undefined}
              onClick={leaderClickable ? () => navigate(`/player/${leaderPlayerId}`) : undefined}
              onKeyDown={leaderClickable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/player/${leaderPlayerId}`);
                }
              } : undefined}
            >
              {lastName}
            </div>
            <div className="team-sub">{leaderTeamName}</div>
          </div>
        ) : (
          <div className="eg-leader-name">
            <div className="team-label">{leaderName}</div>
          </div>
        )}

        <div
          className={`eg-leader-headshot ${leaderClickable ? 'is-link' : ''}`}
          role={leaderClickable ? 'button' : undefined}
          tabIndex={leaderClickable ? 0 : undefined}
          onClick={leaderClickable ? () => navigate(`/player/${leaderPlayerId}`) : undefined}
          onKeyDown={leaderClickable ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate(`/player/${leaderPlayerId}`);
            }
          } : undefined}
        >
          <HeadshotImg
            src={imgSrc}
            name={leaderName}
            large
          />
        </div>
      </div>

      <div className="eg-runners">
        {runners.map((entry, idx) => {
          const val =
            remoteCategory?.top
              ? (scope === 'average' ? (entry as any).average : (entry as any).total)
              : 0;
          const name = String((entry as any).name || '');
          const src = mode === 'players' ? ((entry as any).headshotUrl || (entry as any).photoUrl || '') : ((entry as any).logoUrl || (entry as any).photoUrl || '');
          const runnerTeam = mode === 'players' ? ((entry as any).teamName || '') : '';

          return (
            <div key={idx} className="eg-runner-row">
              <span className="eg-runner-rank">{idx + 2}</span>
              <div
                className={`eg-runner-avatar ${
                  mode === 'players' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String((entry as any).id || ''))
                    ? 'is-link'
                    : ''
                }`}
                role={
                  mode === 'players' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String((entry as any).id || ''))
                    ? 'button'
                    : undefined
                }
                tabIndex={
                  mode === 'players' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String((entry as any).id || ''))
                    ? 0
                    : undefined
                }
                onClick={() => {
                  const pid = String((entry as any).id || '');
                  if (mode === 'players' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid)) {
                    navigate(`/player/${pid}`);
                  }
                }}
              >
                <HeadshotImg
                  src={src}
                  name={name}
                />
              </div>
              <div className="eg-runner-info">
                <span className="eg-runner-name">{name}</span>
                {runnerTeam && <span className="eg-runner-team">{runnerTeam}</span>}
              </div>
              <span className="eg-runner-val">{val}</span>
            </div>
          );
        })}
      </div>

      <button className="eg-card-cta" onClick={handleFull}>
        Full Table <ArrowRight size={13} />
      </button>
    </div>
  );
};

const HeadshotImg: React.FC<{ src: string; name: string; large?: boolean }> = ({
  src,
  name,
  large,
}) => {
  const [useFallback, setUseFallback] = useState(false);
  const [hardFailed, setHardFailed] = useState(false);

  const primarySrc = src;
  const fallbackSrc = src;

  const displaySrc = useFallback && fallbackSrc ? fallbackSrc : primarySrc;

  if (!displaySrc || hardFailed) {
    return large ? <div className="initials-fallback">{getInitials(name)}</div> : <span className="mini-initials">{getInitials(name)}</span>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      onError={() => {
        if (!useFallback && primarySrc !== fallbackSrc && fallbackSrc) {
          setUseFallback(true);
          return;
        }
        setHardFailed(true);
      }}
    />
  );
};

export default StatsHomePage;
