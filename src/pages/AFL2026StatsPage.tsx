import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, User, Users, Shield } from "lucide-react";
import { mockPlayers, mockTeams } from "@/data/stats2MockData";
import {
  PLAYER_STAT_CONFIGS,
  TEAM_STAT_CONFIGS,
  StatConfig,
  StatsMode,
  StatsScope,
  Player,
  Team,
  PlayerStatKey,
  TeamStatKey,
} from "@/types/stats2";
import { getTeamAssets } from "@/lib/teamAssets";
import "@/styles/stats-home.css";

/* ── helpers ── */
const getInitials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const playerVal = (p: Player, key: string, scope: StatsScope) => {
  const raw = p.stats[key as PlayerStatKey];
  return scope === "average" ? +(raw / p.gamesPlayed).toFixed(1) : raw;
};

const teamVal = (t: Team, key: string, scope: StatsScope) => {
  const raw = t.stats[key as TeamStatKey];
  if (key === "goalEfficiency") return raw;
  return scope === "average" ? +(raw / t.gamesPlayed).toFixed(1) : raw;
};

/* ═══════════════════════════════════════════ */
/*                STATS HOME                  */
/* ═══════════════════════════════════════════ */
const StatsHomePage: React.FC = () => {
  const [mode, setMode] = useState<StatsMode>("players");
  const [scope, setScope] = useState<StatsScope>("total");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const statConfigs = mode === "players" ? PLAYER_STAT_CONFIGS : TEAM_STAT_CONFIGS;

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
          {statConfigs.map((cfg) => (
            <LeaderCard key={cfg.key} cfg={cfg} mode={mode} scope={scope} />
          ))}
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
}

const LeaderCard: React.FC<LeaderCardProps> = ({ cfg, mode, scope }) => {
  const navigate = useNavigate();

  const sorted =
    mode === "players"
      ? [...mockPlayers]
          .sort((a, b) => playerVal(b, cfg.key, scope) - playerVal(a, cfg.key, scope))
          .slice(0, 5)
      : [...mockTeams]
          .sort((a, b) => teamVal(b, cfg.key, scope) - teamVal(a, cfg.key, scope))
          .slice(0, 5);

  const leader = sorted[0];
  const runners = sorted.slice(1);
  const leaderValue =
    mode === "players" ? playerVal(leader as Player, cfg.key, scope) : teamVal(leader as Team, cfg.key, scope);

  const leaderTeamName = mode === "players" ? (leader as Player).teamName : (leader as Team).name;
  const teamAsset = getTeamAssets(leaderTeamName);

  const firstName = mode === "players" ? (leader as Player).name.split(" ")[0] : "";
  const lastName = mode === "players" ? (leader as Player).name.split(" ").slice(1).join(" ") : "";
  const imgSrc = mode === "players" ? (leader as Player).headshotUrl : (leader as Team).logoUrl;
  const leaderName = mode === "players" ? (leader as Player).name : (leader as Team).name;

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
          <HeadshotImg src={imgSrc} name={leaderName} large />
        </div>
      </div>

      {/* Runners 2–5 */}
      <div className="eg-runners">
        {runners.map((entry, idx) => {
          const val =
            mode === "players"
              ? playerVal(entry as Player, cfg.key, scope)
              : teamVal(entry as Team, cfg.key, scope);
          const name = mode === "players" ? (entry as Player).name : (entry as Team).name;
          const src = mode === "players" ? (entry as Player).headshotUrl : (entry as Team).logoUrl;
          const runnerTeam = mode === "players" ? (entry as Player).teamName : "";

          return (
            <div key={idx} className="eg-runner-row">
              <span className="eg-runner-rank">{idx + 2}</span>
              <div className="eg-runner-avatar">
                <HeadshotImg src={src} name={name} />
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
const HeadshotImg: React.FC<{ src: string; name: string; large?: boolean }> = ({ src, name, large }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return large ? <div className="initials-fallback">{getInitials(name)}</div> : <span className="mini-initials">{getInitials(name)}</span>;
  }
  return <img src={src} alt={name} onError={() => setFailed(true)} />;
};

export default StatsHomePage;
