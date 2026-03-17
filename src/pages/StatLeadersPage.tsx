import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  StatsMode,
  StatsScope,
} from '@/types/stats2';
import { usePlayerPhotos } from '@/lib/usePlayerPhoto';
import type { Mode as LeadersMode, StatKey as LeadersStatKey, StatLeaders } from '@/lib/stats-leaders-cache';
import { fetchAflPlayers } from '@/data/aflPlayers';
import { fetchActiveCompetitionBaseline } from '@/lib/seasonParticipantsRepo';
import { assetUrl, getTeamAssets } from '@/lib/teamAssets';
import '@/styles/stat-leaders.css';

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const StatLeadersPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const modeParam = (params.get('mode') as StatsMode) || 'players';
  const statParam = params.get('stat') || 'goals';
  const scopeParam = (params.get('scope') as StatsScope) || 'total';

  const [stat, setStat] = useState(statParam);
  const [scope, setScope] = useState<StatsScope>(scopeParam);
  const [remoteLeaders, setRemoteLeaders] = useState<StatLeaders | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [fallbackRosterRows, setFallbackRosterRows] = useState<any[]>([]);

  const playerNames = useMemo(
    () =>
      modeParam === 'players'
        ? (remoteLeaders?.rows || fallbackRosterRows)?.map((r) => r.name) || []
        : [],
    [modeParam, remoteLeaders, fallbackRosterRows],
  );
  const { photos: supabasePhotos } = usePlayerPhotos(playerNames);

  const configs = modeParam === 'players' ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;
  const currentConfig = configs.find((c) => c.key === stat) || configs[0];

  useEffect(() => {
    let cancelled = false;
    const mode = modeParam as LeadersMode;
    const statKey = stat as LeadersStatKey;

    const supported =
      ['goals', 'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitOuts', 'fantasyPoints'].includes(statKey) ||
      (mode === 'teams' && ['goals', 'disposals', 'marks', 'tackles'].includes(statKey));

    if (!supported) {
      setRemoteLeaders(null);
      setRemoteLoading(false);
      return;
    }

    setRemoteLeaders(null);
    setRemoteLoading(true);
    setFallbackRosterRows([]);

    import('@/lib/stats-leaders-cache')
      .then((mod) => mod.fetchStatLeaders(mode, statKey))
      .then((data) => {
        if (!cancelled) setRemoteLeaders(data || null);
      })
      .catch(() => {
        if (!cancelled) setRemoteLeaders(null);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modeParam, stat]);

  useEffect(() => {
    let cancelled = false;

    const buildFallbackRoster = async () => {
      const mode = modeParam as LeadersMode;
      const statKey = stat as LeadersStatKey;

      if (remoteLeaders?.rows && remoteLeaders.rows.length > 0) {
        // If we have remote data, don't build fallback
        setFallbackRosterRows([]);
        return;
      }

      if (mode === 'players') {
        const [allAflPlayers, baseline] = await Promise.all([
          fetchAflPlayers().catch(() => []),
          fetchActiveCompetitionBaseline().catch(() => ({ teams: [] })),
        ]);

        const playersByTeam = new Map<string, typeof allAflPlayers>();
        for (const player of allAflPlayers) {
          const teamKey = String(player.teamKey || player.teamName || '').toLowerCase();
          if (!playersByTeam.has(teamKey)) {
            playersByTeam.set(teamKey, []);
          }
          playersByTeam.get(teamKey)!.push(player);
        }

        const rows: any[] = [];
        const seen = new Set<string>();

        for (const team of (baseline.teams || [])) {
          const teamPlayers = playersByTeam.get(team.teamKey.toLowerCase()) || [];
          for (const player of teamPlayers) {
            if (seen.has(player.id)) continue;
            seen.add(player.id);
            rows.push({
              playerId: String(player.id || ''),
              rank: rows.length + 1,
              name: String(player.name || '').trim() || 'Player',
              teamName: String(player.teamName || team.name),
              headshotUrl: String(player.headshotUrl || '').trim(),
              logoUrl: String(player.headshotUrl || '').trim(),
              total: 0,
              average: 0,
            });
          }
        }

        if (!cancelled) {
          setFallbackRosterRows(rows.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } else {
        const baseline = await fetchActiveCompetitionBaseline().catch(() => ({ teams: [] }));
        const rows = (baseline.teams || []).map((team, idx) => ({
          playerId: team.id,
          rank: idx + 1,
          name: team.name,
          teamName: team.name,
          headshotUrl: '',
          logoUrl: assetUrl(team.logoUrl || '') || '',
          total: 0,
          average: 0,
        }));

        if (!cancelled) {
          setFallbackRosterRows(rows);
        }
      }
    };

    buildFallbackRoster().catch(() => {
      if (!cancelled) setFallbackRosterRows([]);
    });

    return () => {
      cancelled = true;
    };
  }, [modeParam, stat, remoteLeaders]);

  const rows = useMemo(() => {
    if (remoteLeaders?.rows?.length) {
      return remoteLeaders.rows.map((r) => ({
        playerId: (r as any).playerId || '',
        rank: r.rank,
        name: r.name,
        teamName: r.sub || '',
        headshotUrl: r.imgUrl || '',
        logoUrl: r.imgUrl || '',
        total: r.total,
        average: r.average,
      }));
    }
    // Use fallback roster when no remote data
    return fallbackRosterRows;
  }, [remoteLeaders, fallbackRosterRows]);

  const isValidPlayerId = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

  return (
    <div className="eg-leaders-page pb-28">
      <div className="eg-leaders-topbar">
        <button className="eg-leaders-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <span className="eg-leaders-title">Stat Leaders</span>
      </div>

      <div className="eg-leaders-controls">
        <div className="eg-leaders-row">
          <select className="eg-stat-select" value={stat} onChange={(e) => setStat(e.target.value)}>
            {configs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="eg-filter-btn">
            <SlidersHorizontal size={14} /> Filter
          </button>
        </div>

        <div className="eg-chip-bar">
          {(['total', 'average'] as const).map((s) => (
            <button key={s} className={`eg-chip ${scope === s ? 'active' : ''}`} onClick={() => setScope(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="eg-list-header">
        <span className="eg-list-header-label" style={{ flex: 1, paddingLeft: 36 }}>
          {modeParam === 'players' ? 'Player' : 'Team'}
        </span>
        <span className="eg-list-header-label">{currentConfig.abbreviation}</span>
      </div>

      <div>
        {rows.map((entry: any, idx) => {
          const val = scope === 'average' ? entry.average : entry.total;
          const name = entry.name;
          const teamName = modeParam === 'players' ? (entry.teamName || undefined) : undefined;
          const src = modeParam === 'players' ? (entry.headshotUrl || '') : (entry.logoUrl || '');
          const canOpenPlayer = modeParam === 'players' && isValidPlayerId(entry.playerId);
          const openPlayer = () => {
            if (canOpenPlayer) navigate(`/player/${entry.playerId}`);
          };

          return (
            <div key={idx} className={`eg-list-row ${idx < 3 ? 'top-3' : ''}`}>
              <span className="eg-list-rank">{idx + 1}</span>
              <div
                className="eg-list-avatar"
                onClick={canOpenPlayer ? openPlayer : undefined}
                role={canOpenPlayer ? 'button' : undefined}
                tabIndex={canOpenPlayer ? 0 : undefined}
                onKeyDown={
                  canOpenPlayer
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openPlayer();
                        }
                      }
                    : undefined
                }
              >
                <AvatarImg
                  src={src}
                  name={name}
                  supabaseUrl={modeParam === 'players' ? supabasePhotos.get(name) : undefined}
                />
              </div>
              <div
                className="eg-list-info"
                onClick={canOpenPlayer ? openPlayer : undefined}
                role={canOpenPlayer ? 'button' : undefined}
                tabIndex={canOpenPlayer ? 0 : undefined}
                onKeyDown={
                  canOpenPlayer
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openPlayer();
                        }
                      }
                    : undefined
                }
              >
                <div className="eg-list-name">{name}</div>
                {teamName && <div className="eg-list-team">{teamName}</div>}
              </div>
              <span className="eg-list-value">{val}</span>
            </div>
          );
        })}

        {!remoteLoading && rows.length === 0 && fallbackRosterRows.length === 0 && (
          <div className="eg-list-row">
            <span className="eg-list-rank">—</span>
            <div className="eg-list-info">
              <div className="eg-list-name">Unable to load roster</div>
              <div className="eg-list-team">Check your connection and try again</div>
            </div>
            <span className="eg-list-value">—</span>
          </div>
        )}
      </div>
    </div>
  );
};

const AvatarImg: React.FC<{ src: string; name: string; supabaseUrl?: string | null }> = ({
  src,
  name,
  supabaseUrl,
}) => {
  const [useFallback, setUseFallback] = useState(false);

  const primarySrc = supabaseUrl || src;
  const fallbackSrc = src;

  const displaySrc = useFallback && fallbackSrc ? fallbackSrc : primarySrc;

  if (!displaySrc) {
    return <span className="list-initials">{getInitials(name)}</span>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      onError={() => {
        if (!useFallback && primarySrc !== fallbackSrc && fallbackSrc) {
          setUseFallback(true);
        }
      }}
    />
  );
};

export default StatLeadersPage;
