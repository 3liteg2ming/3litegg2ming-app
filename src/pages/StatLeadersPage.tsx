import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { mockPlayers, mockTeams } from "@/data/stats2MockData";
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  StatsMode,
  StatsScope,
  Player,
  Team,
  PlayerStatKey,
  TeamStatKey,
} from "@/types/stats2";
import { usePlayerPhotos } from "@/lib/usePlayerPhoto";
import type { Mode as LeadersMode, StatKey as LeadersStatKey, StatLeaders } from "@/lib/stats-leaders-cache";
import "@/styles/stat-leaders.css";

const playerVal = (p: Player, key: string, scope: StatsScope) => {
  const raw = p.stats[key as PlayerStatKey];
  return scope === "average" ? +(raw / p.gamesPlayed).toFixed(1) : raw;
};
const teamVal = (t: Team, key: string, scope: StatsScope) => {
  const raw = t.stats[key as TeamStatKey];
  if (key === "goalEfficiency") return raw;
  return scope === "average" ? +(raw / t.gamesPlayed).toFixed(1) : raw;
};

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const StatLeadersPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const modeParam = (params.get("mode") as StatsMode) || "players";
  const statParam = params.get("stat") || "goals";
  const scopeParam = (params.get("scope") as StatsScope) || "total";

  const [stat, setStat] = useState(statParam);
  const [scope, setScope] = useState<StatsScope>(scopeParam);
  const [remoteLeaders, setRemoteLeaders] = useState<StatLeaders | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);

  // Preload all player photos from Supabase
  const playerNames = useMemo(
    () =>
      modeParam === "players"
        ? (remoteLeaders?.rows?.map((r) => r.name) || mockPlayers.map((p) => p.name))
        : [],
    [modeParam, remoteLeaders]
  );
  const { photos: supabasePhotos } = usePlayerPhotos(playerNames);

  const configs = modeParam === "players" ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;
  const currentConfig = configs.find((c) => c.key === stat) || configs[0];

  useEffect(() => {
    let cancelled = false;
    const mode = modeParam as LeadersMode;
    const statKey = stat as LeadersStatKey;

    const supported = ['goals', 'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitOuts', 'fantasyPoints'].includes(statKey)
      || (mode === 'teams' && ['goals', 'disposals', 'marks', 'tackles'].includes(statKey));

    if (!supported) {
      setRemoteLeaders(null);
      return;
    }

    setRemoteLoading(true);
    import("@/lib/stats-leaders-cache")
      .then((mod) => mod.fetchStatLeaders(mode, statKey))
      .then((data) => {
        if (!cancelled) setRemoteLeaders(data);
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

  const sortedFallback =
    modeParam === "players"
      ? [...mockPlayers].sort((a, b) => playerVal(b, stat, scope) - playerVal(a, stat, scope))
      : [...mockTeams].sort((a, b) => teamVal(b, stat, scope) - teamVal(a, stat, scope));

  const sorted = useMemo(() => {
    if (!remoteLeaders?.rows?.length) return sortedFallback;

    const mapped = remoteLeaders.rows.map((r) => ({
      rank: r.rank,
      name: r.name,
      teamName: r.sub || '',
      headshotUrl: r.imgUrl || '',
      logoUrl: r.imgUrl || '',
      total: r.total,
      average: r.average,
    }));
    return mapped;
  }, [remoteLeaders, sortedFallback]);

  return (
    <div className="eg-leaders-page pb-28">
      {/* Top bar */}
      <div className="eg-leaders-topbar">
        <button className="eg-leaders-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <span className="eg-leaders-title">Stat Leaders</span>
      </div>

      {/* Controls */}
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

        {/* Scope toggle */}
        <div className="eg-chip-bar">
          {(["total", "average"] as const).map((s) => (
            <button key={s} className={`eg-chip ${scope === s ? "active" : ""}`} onClick={() => setScope(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List header */}
      <div className="eg-list-header">
        <span className="eg-list-header-label" style={{ flex: 1, paddingLeft: 36 }}>
          {modeParam === "players" ? "Player" : "Team"}
        </span>
        <span className="eg-list-header-label">{currentConfig.abbreviation}</span>
      </div>

      {/* Rows */}
      <div>
        {sorted.map((entry: any, idx) => {
          const usingRemote = !!remoteLeaders?.rows?.length;
          const val = usingRemote
            ? (scope === "average" ? entry.average : entry.total)
            : modeParam === "players"
              ? playerVal(entry as Player, stat, scope)
              : teamVal(entry as Team, stat, scope);
          const name = entry.name;
          const teamName = modeParam === "players" ? (entry.teamName || undefined) : undefined;
          const src = modeParam === "players" ? (entry.headshotUrl || '') : (entry.logoUrl || '');

          return (
            <div key={idx} className={`eg-list-row ${idx < 3 ? "top-3" : ""}`}>
              <span className="eg-list-rank">{idx + 1}</span>
              <div className="eg-list-avatar">
                <AvatarImg
                  src={src}
                  name={name}
                  supabaseUrl={modeParam === "players" ? supabasePhotos.get(name) : undefined}
                />
              </div>
              <div className="eg-list-info">
                <div className="eg-list-name">{name}</div>
                {teamName && <div className="eg-list-team">{teamName}</div>}
              </div>
              <span className="eg-list-value">{val}</span>
            </div>
          );
        })}
      </div>
      {remoteLoading ? null : null}
    </div>
  );
};

const AvatarImg: React.FC<{ src: string; name: string; supabaseUrl?: string | null }> = ({
  src,
  name,
  supabaseUrl
}) => {
  const [useFallback, setUseFallback] = useState(false);

  // Fallback chain:
  // 1. Supabase photo (if available) - primary
  // 2. AFL fantasy API photo (src) - secondary fallback
  // 3. Initials avatar - final fallback
  const primarySrc = supabaseUrl || src;
  const fallbackSrc = src;

  // Determine which source to display
  let displaySrc = useFallback && fallbackSrc ? fallbackSrc : primarySrc;

  if (!displaySrc) {
    return <span className="list-initials">{getInitials(name)}</span>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      onError={() => {
        // If primary failed and we haven't tried fallback yet, try fallback
        if (!useFallback && primarySrc !== fallbackSrc && fallbackSrc) {
          setUseFallback(true);
        }
      }}
    />
  );
};

export default StatLeadersPage;
