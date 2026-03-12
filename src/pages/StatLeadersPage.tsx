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

  const playerNames = useMemo(
    () =>
      modeParam === 'players'
        ? remoteLeaders?.rows?.map((r) => r.name) || []
        : [],
    [modeParam, remoteLeaders],
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

  const rows = useMemo(() => {
    if (!remoteLeaders?.rows?.length) return [];
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
  }, [remoteLeaders]);

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

        {!remoteLoading && rows.length === 0 && (
          <div className="eg-list-row">
            <span className="eg-list-rank">—</span>
            <div className="eg-list-info">
              <div className="eg-list-name">No live season data yet</div>
              <div className="eg-list-team">Awaiting submitted match data for this category</div>
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
