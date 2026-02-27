import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, User, Users, Shield } from "lucide-react";
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  StatConfig,
  StatsMode,
  StatsScope,
} from "@/types/stats2";
import { getTeamAssets } from "@/lib/teamAssets";
import { usePlayerPhotos } from "@/lib/usePlayerPhoto";
import type { StatLeaderCategory } from "@/lib/stats-leaders-cache";
import "@/styles/stats-home.css";

/* ── helpers ── */
const getInitials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

/* ═══════════════════════════════════════════ */
/*                STATS HOME                  */
/* ═══════════════════════════════════════════ */
const StatsHomePage: React.FC = () => {
  const [mode, setMode] = useState<StatsMode>("players");
  const [scope, setScope] = useState<StatsScope>("total");
  const [search, setSearch] = useState("");
  const [remoteCategories, setRemoteCategories] = useState<StatLeaderCategory[]>([]);
  const [leadersLoading, setLeadersLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  // Preload all player photos from Supabase
  const playerNames = useMemo(
    () =>
      mode === "players" && remoteCategories.length
        ? remoteCategories.flatMap((c) => [c.top?.name, ...c.others.map((o) => o.name)].filter(Boolean) as string[])
        : [],
    [mode, remoteCategories]
  );
  const { photos: supabasePhotos } = usePlayerPhotos(playerNames);

  const statConfigs = mode === "players" ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;

  useEffect(() => {
    let cancelled = false;
    setLeadersLoading(true);
    import("@/lib/stats-leaders-cache")
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
        // Keep existing live data instead of dropping back to mock on empty response.
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
  }, [mode]); // preserve current categories on transient errors

  return (
    <div className="eg-stats-page pb-28">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-2xl font-black tracking-tight">Stats</h1>
        <span
          className="text-xs font-bold px-3 py-1.5 rounded-full eg-glass"
          style={{ color: "hsla(0,0%,100%,0.55)" }}
        >
          AFL 26 &bull; Season One
        </span>
      </div>

      {/* ── Mode toggle ── */}
      <div className="px-5 mt-3">
        <div className="eg-toggle-bar">
          <button
            className={`eg-toggle-btn ${mode === "players" ? "active" : ""}`}
            onClick={() => setMode("players")}
          >
            <User size={15} /> Players
          </button>
          <button
            className={`eg-toggle-btn ${mode === "teams" ? "active" : ""}`}
            onClick={() => setMode("teams")}
          >
            <Users size={15} /> Teams
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-5 mt-3">
        <div className="eg-search">
          <Search size={16} style={{ color: "hsla(0,0%,100%,0.3)" }} />
          <input
            placeholder={mode === "players" ? "Search players…" : "Search teams…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Section heading ── */}
      <div className="px-5 mt-6 mb-1">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-extrabold">Season Leaders</h2>
          <div className="eg-chip-bar">
            {(["total", "average"] as const).map((s) => (
              <button
                key={s}
                className={`eg-chip ${scope === s ? "active" : ""}`}
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
          {leadersLoading && remoteCategories.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`leader-skeleton-${i}`}
                className="eg-leader-card"
                aria-hidden="true"
                style={{ opacity: 0.9 }}
              >
                <div
                  className="eg-leader-hero"
                  style={{ background: "linear-gradient(180deg, #1a1a1f 0%, #0f1015 100%)" }}
                >
                  <div className="eg-leader-hero-overlay" />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(110deg, rgba(255,255,255,0) 25%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 75%)",
                      animation: "egShimmer 1.3s ease-in-out infinite",
                    }}
                  />
                </div>
                <div className="eg-runners" style={{ minHeight: 176 }} />
                <div className="eg-card-cta" style={{ opacity: 0.55 }}>Loading…</div>
              </div>
            ))
          ) : (
            statConfigs.map((cfg) => (
              <LeaderCard
                key={cfg.key}
                cfg={cfg}
                mode={mode}
                scope={scope}
                supabasePhotos={supabasePhotos}
                remoteCategory={remoteCategories.find((c) => c.statKey === (cfg.key as any))}
                deferFallback={leadersLoading && remoteCategories.length === 0}
              />
            ))
          )}
          {/* end spacer */}
          <div style={{ flexShrink: 0, width: 6 }} />
        </div>
      </div>

      {/* ── Compare section ── */}
      <div className="mt-6">
        <div className="eg-compare-section eg-glass">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold">
              {mode === "players" ? "Compare Players" : "Compare Teams"}
            </h3>
            <button
              onClick={() => navigate(`/stats2/compare?mode=${mode}`)}
              className="text-xs font-bold eg-gold flex items-center gap-1"
            >
              More <ArrowRight size={12} />
            </button>
          </div>
          <p className="text-xs mb-5" style={{ color: "hsla(0,0%,100%,0.4)" }}>
            Create your own head-to-head comparisons.
          </p>
          <div className="eg-compare-circles">
            <div className="flex flex-col items-center gap-2">
              <div className="eg-compare-ring">
                <div className="eg-compare-ring-inner">
                  {mode === "players" ? (
                    <User size={28} style={{ color: "hsla(0,0%,100%,0.2)" }} />
                  ) : (
                    <Shield size={28} style={{ color: "hsla(0,0%,100%,0.2)" }} />
                  )}
                </div>
              </div>
              <button
                onClick={() => navigate(`/stats2/compare?mode=${mode}`)}
                className="text-xs font-bold eg-gold"
              >
                Add {mode === "players" ? "Player" : "Team"} 1
              </button>
            </div>
            <span className="eg-compare-vs">V</span>
            <div className="flex flex-col items-center gap-2">
              <div className="eg-compare-ring">
                <div className="eg-compare-ring-inner">
                  {mode === "players" ? (
                    <User size={28} style={{ color: "hsla(0,0%,100%,0.2)" }} />
                  ) : (
                    <Shield size={28} style={{ color: "hsla(0,0%,100%,0.2)" }} />
                  )}
                </div>
              </div>
              <button
                onClick={() => navigate(`/stats2/compare?mode=${mode}`)}
                className="text-xs font-bold eg-gold"
              >
                Add {mode === "players" ? "Player" : "Team"} 2
              </button>
            </div>
          </div>
        </div>
      </div>
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
          style={{ background: "linear-gradient(180deg, #171b22 0%, #0d1117 100%)" }}
        >
          <div className="eg-leader-hero-overlay" />
          <div className="eg-leader-stat-chip">{cfg.label}</div>
          <div className="eg-leader-value">
            <span className="big-num">—</span>
          </div>
          <div className="eg-leader-name">
            <div className="first">No live data</div>
            <div className="last">yet</div>
            <div className="team-sub">Showing Supabase players only</div>
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
      ? (scope === "average" ? (leader as any).average : (leader as any).total)
      : 0;

  const leaderTeamResolved = (leader as any)?.teamResolved !== false;
  const leaderTeamRef =
    mode === "players"
      ? (leaderTeamResolved ? ((leader as any).teamKey || (leader as any).teamName || '') : '')
      : ((leader as any).name || '');
  const leaderTeamName = mode === "players" ? ((leader as any).teamName || '') : (leader as any).name;
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

  const firstName = mode === "players" ? String((leader as any).name || '').split(" ")[0] : "";
  const lastName = mode === "players" ? String((leader as any).name || '').split(" ").slice(1).join(" ") : "";
  const imgSrc = mode === "players" ? ((leader as any).headshotUrl || (leader as any).photoUrl || '') : ((leader as any).logoUrl || (leader as any).photoUrl || '');
  const leaderName = String((leader as any).name || '');

  const handleFull = () => navigate(`/stats3/leaders?mode=${mode}&stat=${cfg.key}&scope=${scope}`);

  return (
    <div className="eg-leader-card">
      {/* Hero with TEAM COLOUR background */}
      <div
        className="eg-leader-hero"
        style={{
          background: `linear-gradient(180deg, ${teamAsset.primary} 0%, ${teamAsset.dark} 100%)`,
        }}
      >
        {/* Dark overlay for Elite Gaming depth */}
        <div className="eg-leader-hero-overlay" />

        {/* Team colour glow */}
        <div
          className="eg-leader-hero-glow"
          style={{
            background: `radial-gradient(ellipse at 30% 90%, ${teamAsset.primaryHex}aa 0%, transparent 65%)`,
          }}
        />

        {/* Team logo watermark */}
        {teamAsset.logo && (
          <div className="eg-leader-team-logo">
            <img src={teamAsset.logo} alt={leaderTeamName} />
          </div>
        )}

        <div className="eg-leader-stat-chip">{cfg.label}</div>

        <div className="eg-leader-value">
          <span className="big-num">{leaderValue}</span>
          {scope === "average" && <span className="per-game">per game</span>}
        </div>

        {mode === "players" ? (
          <div className="eg-leader-name">
            <div className="first">{firstName}</div>
            <div className="last">{lastName}</div>
            <div className="team-sub">{leaderTeamName}</div>
          </div>
        ) : (
          <div className="eg-leader-name">
            <div className="team-label">{leaderName}</div>
          </div>
        )}

        {/* Headshot / Logo */}
        <div className="eg-leader-headshot">
          <HeadshotImg
            src={imgSrc}
            name={leaderName}
            large
            supabaseUrl={mode === "players" ? supabasePhotos.get(leaderName) : undefined}
          />
        </div>
      </div>

      {/* Runners 2–5 */}
      <div className="eg-runners">
        {runners.map((entry, idx) => {
          const val =
            remoteCategory?.top
              ? (scope === "average" ? (entry as any).average : (entry as any).total)
              : 0;
          const name = String((entry as any).name || '');
          const src = mode === "players" ? ((entry as any).headshotUrl || (entry as any).photoUrl || '') : ((entry as any).logoUrl || (entry as any).photoUrl || '');
          const runnerTeam = mode === "players" ? ((entry as any).teamName || "") : "";

          return (
            <div key={idx} className="eg-runner-row">
              <span className="eg-runner-rank">{idx + 2}</span>
              <div className="eg-runner-avatar">
                <HeadshotImg
                  src={src}
                  name={name}
                  supabaseUrl={mode === "players" ? supabasePhotos.get(name) : undefined}
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

      {/* CTA */}
      <button className="eg-card-cta" onClick={handleFull}>
        Full Table <ArrowRight size={13} />
      </button>
    </div>
  );
};

/* ── Headshot with initials fallback ── */
const HeadshotImg: React.FC<{ src: string; name: string; large?: boolean; supabaseUrl?: string | null }> = ({
  src,
  name,
  large,
  supabaseUrl
}) => {
  const [useFallback, setUseFallback] = useState(false);
  const [hardFailed, setHardFailed] = useState(false);

  // Fallback chain:
  // 1. Supabase photo (if available) - primary
  // 2. AFL fantasy API photo (src) - secondary fallback
  // 3. Initials avatar - final fallback
  const primarySrc = supabaseUrl || src;
  const fallbackSrc = src;

  // Determine which source to display
  let displaySrc = useFallback && fallbackSrc ? fallbackSrc : primarySrc;

  if (!displaySrc || hardFailed) {
    return large ? <div className="initials-fallback">{getInitials(name)}</div> : <span className="mini-initials">{getInitials(name)}</span>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      onError={() => {
        // If primary failed and we haven't tried fallback yet, try fallback
        if (!useFallback && primarySrc !== fallbackSrc && fallbackSrc) {
          setUseFallback(true);
          return;
        }
        // Final failure: render initials instead of browser broken-image icon/alt text
        setHardFailed(true);
      }}
    />
  );
};

export default StatsHomePage;
