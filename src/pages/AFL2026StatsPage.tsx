import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Users, Shield, X, ArrowRight } from 'lucide-react';
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  StatConfig,
  StatsMode,
  StatsScope,
} from '@/types/stats2';
import { fetchAflPlayers } from '@/data/aflPlayers';
import { assetUrl, getTeamAssets } from '@/lib/teamAssets';
import { supabase } from '@/lib/supabaseClient';
import { usePlayerPhotos } from '@/lib/usePlayerPhoto';
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

type EgTeamJoinRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
};

type EgPlayerRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  number?: number | string | null;
  position?: string | null;
  headshot_url?: string | null;
  team_id?: string | null;
  eg_teams?: EgTeamJoinRow | EgTeamJoinRow[] | null;
};

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
};

type StatsTeamRow = {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
};

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

function maybeTeamJoin(joined: EgPlayerRow['eg_teams']): EgTeamJoinRow | null {
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0] || null;
  return joined;
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

function resolveTeamColors(team: EgTeamJoinRow | null, teamLabel: string) {
  const fromDbPrimary = String(team?.primary_color || '').trim();
  const fromDbSecondary = String(team?.secondary_color || '').trim();
  if (fromDbPrimary || fromDbSecondary) {
    return {
      primary: fromDbPrimary || fromDbSecondary || '#2b3444',
      secondary: fromDbSecondary || fromDbPrimary || '#6e7f98',
    };
  }

  const keyFromSlug = normalizeTeamKey(String(team?.slug || ''));
  const keyFromName = normalizeTeamKey(String(team?.name || teamLabel || ''));
  const match = TEAM_TINT_FALLBACK[keyFromSlug] || TEAM_TINT_FALLBACK[keyFromName];
  if (match) return match;

  return { primary: '#283443', secondary: '#6d8098' };
}

function resolvePlayerName(row: EgPlayerRow): string {
  const display = String(row.display_name || '').trim();
  const full = String(row.full_name || '').trim();
  const name = String(row.name || '').trim();
  return display || full || name || 'Player';
}

async function fetchStatsPlayersFromDb(): Promise<StatsPlayerRow[]> {
  const selectAttempts = [
    'id,name,full_name,display_name,number,position,headshot_url,team_id,eg_teams:team_id(id,name,slug,logo_url,primary_color,secondary_color)',
    'id,name,display_name,number,position,headshot_url,team_id,eg_teams:team_id(id,name,slug,logo_url)',
    'id,name,number,position,headshot_url,team_id,eg_teams:team_id(id,name,slug,logo_url)',
  ] as const;

  let rows: EgPlayerRow[] = [];
  let lastError: string | null = null;

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from('eg_players').select(select).limit(3000);
    if (!error) {
      rows = ((data || []) as unknown[]) as EgPlayerRow[];
      lastError = null;
      break;
    }

    lastError = error.message;
    if (!error.message.toLowerCase().includes('column')) {
      throw new Error(error.message);
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }

  const mapped = rows
    .filter((row) => String(row.id || '').trim())
    .map((row) => {
      const team = maybeTeamJoin(row.eg_teams);
      const dbTeamName = String(team?.name || '').trim();
      const teamName = dbTeamName || 'Unassigned';
      const isUnassignedTeam = teamName === 'Unassigned';

      const logo = isUnassignedTeam ? '' : resolveLogoUrl(team?.logo_url);

      const tint = isUnassignedTeam
        ? { primary: '#2a2f38', secondary: '#4f5563' }
        : resolveTeamColors(team, teamName);

      return {
        id: String(row.id),
        name: resolvePlayerName(row),
        teamName,
        teamLogo: logo || undefined,
        teamPrimaryColor: tint.primary,
        teamSecondaryColor: tint.secondary,
        position: String(row.position || '').trim(),
        number: parsePlayerNumber(row.number),
        headshotUrl: String(row.headshot_url || '').trim(),
      } satisfies StatsPlayerRow;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return mapped;
}

async function fetchStatsTeamsFromDb(): Promise<StatsTeamRow[]> {
  const selectAttempts = [
    'id,name,short_name,logo_url',
    'id,name,logo_url',
    'id,name',
  ] as const;

  let rows: Array<Record<string, unknown>> = [];
  let lastError: string | null = null;

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from('eg_teams').select(select).limit(200);
    if (!error) {
      rows = ((data || []) as unknown[]) as Array<Record<string, unknown>>;
      lastError = null;
      break;
    }
    lastError = error.message;
    if (!error.message.toLowerCase().includes('column')) {
      throw new Error(error.message);
    }
  }

  if (lastError) throw new Error(lastError);

  return rows
    .map((row) => {
      const id = String(row.id || '').trim();
      const name = String(row.name || '').trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        shortName: String(row.short_name || '').trim() || name,
        logoUrl: resolveLogoUrl(String(row.logo_url || '')),
      } satisfies StatsTeamRow;
    })
    .filter((value): value is StatsTeamRow => value !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ═══════════════════════════════════════════ */
/*                STATS HOME                  */
/* ═══════════════════════════════════════════ */
const StatsHomePage: React.FC = () => {
  const [mode, setMode] = useState<StatsMode>('players');
  const [scope, setScope] = useState<StatsScope>('total');
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDirectory, setShowPlayerDirectory] = useState(false);
  const [remoteCategories, setRemoteCategories] = useState<StatLeaderCategory[]>([]);
  const [leadersLoading, setLeadersLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<StatsPlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState<boolean>(true);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [teams, setTeams] = useState<StatsTeamRow[]>([]);
  const [comparePlayers, setComparePlayers] = useState<Array<{ id: string; name: string; teamName: string; headshotUrl: string }>>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSearch, setCompareSearch] = useState('');
  const [compareSlot, setCompareSlot] = useState<'one' | 'two'>('one');
  const [comparePlayerOneId, setComparePlayerOneId] = useState<string>('');
  const [comparePlayerTwoId, setComparePlayerTwoId] = useState<string>('');
  const [compareTeamOneId, setCompareTeamOneId] = useState<string>('');
  const [compareTeamTwoId, setCompareTeamTwoId] = useState<string>('');
  const navigate = useNavigate();

  const playerNames = useMemo(
    () =>
      mode === 'players' && remoteCategories.length
        ? remoteCategories.flatMap((c) => [c.top?.name, ...c.others.map((o) => o.name)].filter(Boolean) as string[])
        : [],
    [mode, remoteCategories],
  );
  const { photos: supabasePhotos } = usePlayerPhotos(playerNames);

  const statConfigs = mode === 'players' ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        String(p.number || '').includes(q)
      );
    });
  }, [players, playerSearch]);

  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    setPlayersError(null);

    fetchStatsPlayersFromDb()
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
    fetchAflPlayers()
      .then((rows) => {
        if (cancelled) return;
        setComparePlayers(
          (rows || [])
            .map((row) => ({
              id: String(row.id || '').trim(),
              name: String(row.name || '').trim(),
              teamName: String(row.teamName || 'Unassigned').trim(),
              headshotUrl: String(row.headshotUrl || '').trim(),
            }))
            .filter((row) => row.id && row.name)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setComparePlayers([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStatsTeamsFromDb()
      .then((rows) => {
        if (cancelled) return;
        setTeams(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setTeams([]);
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

  const comparePool = useMemo(() => {
    const playerSource = (comparePlayers.length > 0 ? comparePlayers : players).map((p) => ({
      id: p.id,
      name: p.name,
      sub: p.teamName,
      image: 'headshotUrl' in p ? p.headshotUrl : '',
    }));

    const source = mode === 'players' ? playerSource : teams.map((t) => ({
      id: t.id,
      name: t.name,
      sub: t.shortName,
      image: t.logoUrl,
    }));

    const q = compareSearch.trim().toLowerCase();
    if (!q) return source.slice(0, 120);
    return source
      .filter((item) => item.name.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q))
      .slice(0, 120);
  }, [comparePlayers, compareSearch, mode, players, teams]);

  const comparePreview = useMemo(() => {
    if (mode === 'players') {
      const one = players.find((p) => p.id === comparePlayerOneId) || null;
      const two = players.find((p) => p.id === comparePlayerTwoId) || null;
      return { one, two };
    }
    const one = teams.find((t) => t.id === compareTeamOneId) || null;
    const two = teams.find((t) => t.id === compareTeamTwoId) || null;
    return { one, two };
  }, [comparePlayerOneId, comparePlayerTwoId, compareTeamOneId, compareTeamTwoId, mode, players, teams]);

  return (
    <div className="eg-stats-page pb-28">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-2xl font-black tracking-tight">Stats</h1>
        <span
          className="text-xs font-bold px-3 py-1.5 rounded-full eg-glass"
          style={{ color: 'hsla(0,0%,100%,0.55)' }}
        >
          AFL 26 &bull; Season One
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
                  supabasePhotos={supabasePhotos}
                  remoteCategory={remoteCategories.find((c) => c.statKey === (cfg.key as any))}
                  deferFallback={leadersLoading && remoteCategories.length === 0}
                />
              ))}
          <div style={{ flexShrink: 0, width: 6 }} />
        </div>
      </div>

      {/* ── Player directory (below leaders) ── */}
      {mode === 'players' ? (
        <div className="px-5 mt-5">
          <div className="eg-player-directory eg-glass">
            <div className="eg-player-directory__header">
              <div>
                <h3>Player Search</h3>
                <p>Browse players, teams and jumper numbers.</p>
              </div>
              <button
                type="button"
                className="eg-player-directory__toggle"
                onClick={() => setShowPlayerDirectory((v) => !v)}
              >
                {showPlayerDirectory ? 'Hide' : 'Full Table'}
              </button>
            </div>

            {showPlayerDirectory ? (
              <>
                <div className="eg-search eg-player-directory__search">
                  <Search size={16} style={{ color: 'hsla(0,0%,100%,0.3)' }} />
                  <input
                    placeholder="Search players, teams, numbers…"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                  />
                </div>

                <div className="eg-player-list">
                  {playersLoading ? (
                    <div className="eg-player-list__state">Loading players…</div>
                  ) : playersError ? (
                    <div className="eg-player-list__state">Unable to load players right now.</div>
                  ) : filteredPlayers.length === 0 ? (
                    <div className="eg-player-list__state">No players found in database.</div>
                  ) : (
                    filteredPlayers.slice(0, 120).map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className="eg-player-row"
                        style={
                          {
                            ['--eg-player-team-primary' as any]: player.teamPrimaryColor,
                            ['--eg-player-team-secondary' as any]: player.teamSecondaryColor,
                          } as React.CSSProperties
                        }
                        onClick={() => navigate(`/player/${player.id}`)}
                      >
                        <div className="eg-player-row__avatar">
                          {player.headshotUrl ? (
                            <img src={player.headshotUrl} alt={player.name} loading="lazy" decoding="async" />
                          ) : (
                            <span className="mini-initials">{getInitials(player.name)}</span>
                          )}
                        </div>
                        <div className="eg-player-row__meta">
                          <span className="eg-player-row__name">{player.name}</span>
                          <span className="eg-player-row__sub">
                            {player.teamLogo ? (
                              <img
                                className="eg-player-row__teamLogo"
                                src={player.teamLogo}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                aria-hidden="true"
                              />
                            ) : null}
                            {player.teamName}
                            {player.position ? ` • ${player.position}` : ''}
                          </span>
                        </div>
                        <span className="eg-player-row__number">
                          {player.number === '—' || Number(player.number) === 0 ? '—' : `#${player.number}`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Compare section ── */}
      <div className="mt-6">
        <div className="eg-compare-section eg-glass">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold">
              {mode === 'players' ? 'Compare Players' : 'Compare Teams'}
            </h3>
            <button
              onClick={() => {
                setCompareSlot('one');
                setCompareSearch('');
                setCompareOpen(true);
              }}
              className="text-xs font-bold eg-gold flex items-center gap-1"
            >
              Open Picker
            </button>
          </div>
          <p className="text-xs mb-5" style={{ color: 'hsla(0,0%,100%,0.4)' }}>
            Pick two {mode === 'players' ? 'players' : 'teams'} and preview head-to-head in-page.
          </p>
          <div className="eg-compare-circles">
            <div className="flex flex-col items-center gap-2">
              <div className="eg-compare-ring">
                <div className="eg-compare-ring-inner">
                  {mode === 'players' ? (
                    <User size={28} style={{ color: 'hsla(0,0%,100%,0.2)' }} />
                  ) : (
                    <Shield size={28} style={{ color: 'hsla(0,0%,100%,0.2)' }} />
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setCompareSlot('one');
                  setCompareSearch('');
                  setCompareOpen(true);
                }}
                className="text-xs font-bold eg-gold"
              >
                {comparePreview.one?.name || `Add ${mode === 'players' ? 'Player' : 'Team'} 1`}
              </button>
            </div>
            <span className="eg-compare-vs">V</span>
            <div className="flex flex-col items-center gap-2">
              <div className="eg-compare-ring">
                <div className="eg-compare-ring-inner">
                  {mode === 'players' ? (
                    <User size={28} style={{ color: 'hsla(0,0%,100%,0.2)' }} />
                  ) : (
                    <Shield size={28} style={{ color: 'hsla(0,0%,100%,0.2)' }} />
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setCompareSlot('two');
                  setCompareSearch('');
                  setCompareOpen(true);
                }}
                className="text-xs font-bold eg-gold"
              >
                {comparePreview.two?.name || `Add ${mode === 'players' ? 'Player' : 'Team'} 2`}
              </button>
            </div>
          </div>

          {(comparePreview.one || comparePreview.two) ? (
            <div className="eg-compare-preview">
              <div className="eg-compare-preview__row">
                <span>{comparePreview.one?.name || 'Select first'}</span>
                <strong>vs</strong>
                <span>{comparePreview.two?.name || 'Select second'}</span>
              </div>
              <div className="eg-compare-preview__sub">Comparison tools coming soon. Selections are saved in-page.</div>
            </div>
          ) : null}
        </div>
      </div>

      {compareOpen ? (
        <div className="eg-compare-modal" role="dialog" aria-modal="true" aria-label="Compare picker">
          <div className="eg-compare-modal__backdrop" onClick={() => setCompareOpen(false)} />
          <div className="eg-compare-modal__sheet eg-glass">
            <div className="eg-compare-modal__head">
              <h4>Select {mode === 'players' ? 'Player' : 'Team'} {compareSlot === 'one' ? '1' : '2'}</h4>
              <button type="button" className="eg-compare-modal__close" onClick={() => setCompareOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="eg-search">
              <Search size={16} style={{ color: 'hsla(0,0%,100%,0.3)' }} />
              <input
                placeholder={`Search ${mode === 'players' ? 'players' : 'teams'}...`}
                value={compareSearch}
                onChange={(event) => setCompareSearch(event.target.value)}
              />
            </label>
            <div className="eg-compare-modal__list">
              {comparePool.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="eg-compare-modal__item"
                  onClick={() => {
                    if (mode === 'players') {
                      if (compareSlot === 'one') setComparePlayerOneId(item.id);
                      else setComparePlayerTwoId(item.id);
                    } else {
                      if (compareSlot === 'one') setCompareTeamOneId(item.id);
                      else setCompareTeamTwoId(item.id);
                    }
                    setCompareOpen(false);
                  }}
                >
                  <div className="eg-compare-modal__avatar">
                    {item.image ? <img src={item.image} alt={item.name} loading="lazy" decoding="async" /> : <span>{getInitials(item.name)}</span>}
                  </div>
                  <div className="eg-compare-modal__meta">
                    <span>{item.name}</span>
                    <small>{item.sub}</small>
                  </div>
                </button>
              ))}
              {!comparePool.length ? <div className="eg-player-list__state">No results.</div> : null}
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
  cfg: StatConfig;
  mode: StatsMode;
  scope: StatsScope;
  supabasePhotos?: Map<string, string | null>;
  remoteCategory?: StatLeaderCategory;
  deferFallback?: boolean;
}

const LeaderCard: React.FC<LeaderCardProps> = ({
  cfg,
  mode,
  scope,
  supabasePhotos = new Map(),
  remoteCategory,
  deferFallback = false,
}) => {
  const navigate = useNavigate();

  const sorted = useMemo(() => {
    if (deferFallback && !remoteCategory?.top) return [];
    if (!remoteCategory?.top) return [];

    const rows = [remoteCategory.top, ...remoteCategory.others].slice(0, 5);
    return rows.map((r) => ({
      name: r.name,
      teamName: r.teamName,
      teamKey: r.teamKey,
      teamResolved: (r as any).teamResolved !== false,
      headshotUrl: r.photoUrl || '',
      logoUrl: r.photoUrl || '',
      total: r.valueTotal,
      average: r.valueAvg,
    }));
  }, [deferFallback, remoteCategory]);

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
  const leaderPlayerId = mode === 'players' ? String((remoteCategory?.top as any)?.id || '') : '';
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

        {teamAsset.logo && (
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
            supabaseUrl={mode === 'players' ? supabasePhotos.get(leaderName) : undefined}
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
                  supabaseUrl={mode === 'players' ? supabasePhotos.get(name) : undefined}
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

const HeadshotImg: React.FC<{ src: string; name: string; large?: boolean; supabaseUrl?: string | null }> = ({
  src,
  name,
  large,
  supabaseUrl,
}) => {
  const [useFallback, setUseFallback] = useState(false);
  const [hardFailed, setHardFailed] = useState(false);

  const primarySrc = supabaseUrl || src;
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
