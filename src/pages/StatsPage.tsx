import React, { useMemo, useState } from 'react';
import { ArrowRight, Search, User, Users, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import SmartImg from '../components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import type { StatLeaderCategory } from '../lib/stats-leaders-cache';
import { useStatsCategories } from '../hooks/useStatsCategories';
import { getStoredCompetitionKey } from '../lib/competitionRegistry';

import '../styles/stats-home.css';

type Mode = 'players' | 'teams';
type Scope = 'total' | 'average';

function initials(name?: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function valueText(v: number) {
  if (!Number.isFinite(v)) return '—';
  if (!Number.isInteger(v)) return String(v.toFixed(1));
  return String(v);
}

function teamKeyFromName(teamName?: string): TeamKey | null {
  const n = String(teamName || '').toLowerCase().trim();
  const entry = (Object.entries(TEAM_ASSETS) as Array<[TeamKey, any]>).find(([, v]) => {
    const nm = String(v?.name || '').toLowerCase().trim();
    return nm === n;
  });
  return entry?.[0] ?? null;
}

function teamLogoFor(teamName?: string): string | null {
  const k = teamKeyFromName(teamName);
  if (!k) return null;
  return assetUrl(TEAM_ASSETS[k].logoFile ?? '');
}

function teamColorFor(teamName?: string): string {
  const k = teamKeyFromName(teamName);
  if (!k) return 'rgba(245,196,0,0.28)'; // fallback gold haze
  const c = TEAM_ASSETS[k].colour || '#F5C400';
  return `${c}`;
}

export default function StatsPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('players');
  const [scope, setScope] = useState<Scope>('total');
  const [search, setSearch] = useState('');
  const statsCategoriesQuery = useStatsCategories(mode);
  const cats = statsCategoriesQuery.data ?? [];
  const loading = statsCategoriesQuery.isLoading;
  const competitionLabel = getStoredCompetitionKey() === 'preseason' ? 'Knockout Preseason' : 'AFL 26 Season Two';

  const filteredCats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) => String(c.label || '').toLowerCase().includes(q));
  }, [cats, search]);

  return (
    <div className="egStatsPage">
      {/* Mobile-first container */}
      <div className="egStatsWrap">
        {/* Top header */}
        <div className="egStatsHeader">
          <div className="egStatsTitleWrap">
            <h1 className="egStatsTitle">Stats</h1>
            <div className="egStatsSubtitlePill">{competitionLabel}</div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="egStatsToggleRow">
          <div className="egStatsToggle">
            <button
              className={`egStatsToggleBtn ${mode === 'players' ? 'isActive' : ''}`}
              onClick={() => setMode('players')}
              type="button"
            >
              <User size={16} /> Players
            </button>
            <button
              className={`egStatsToggleBtn ${mode === 'teams' ? 'isActive' : ''}`}
              onClick={() => setMode('teams')}
              type="button"
            >
              <Users size={16} /> Teams
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="egStatsSearchRow">
          <div className="egStatsSearch">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === 'players' ? 'Search stats…' : 'Search team stats…'}
              aria-label="Search stats"
            />
          </div>
        </div>

        {/* Section header + scope pills */}
        <div className="egStatsSectionHead">
          <div className="egStatsSectionLeft">
            <div className="egStatsH2">Season Leaders</div>
            <div className="egStatsUnderline" />
          </div>

          <div className="egStatsScope">
            <button
              className={`egStatsScopeBtn ${scope === 'total' ? 'isActive' : ''}`}
              type="button"
              onClick={() => setScope('total')}
            >
              Total
            </button>
            <button
              className={`egStatsScopeBtn ${scope === 'average' ? 'isActive' : ''}`}
              type="button"
              onClick={() => setScope('average')}
            >
              Average
            </button>
          </div>
        </div>

        {/* Carousel */}
        <div className="egStatsCarousel">
          {(loading ? Array.from({ length: 6 }) : filteredCats).map((cfg: any, i: number) => {
            if (loading) return <div key={`sk-${i}`} className="egLeaderCard egLeaderSkeleton" />;
            return (
              <LeaderCard
                key={cfg.statKey}
                cfg={cfg}
                mode={mode}
                scope={scope}
                onFullTable={() => navigate(`/stats3/leaders?mode=${mode}&stat=${cfg.statKey}&scope=${scope}`)}
              />
            );
          })}
          <div className="egCarouselEndCap" />
        </div>

        {/* Compare */}
        <div className="egCompareCard">
          <div className="egCompareTop">
            <div className="egCompareTitle">{mode === 'players' ? 'Compare Players' : 'Compare Teams'}</div>
            <button
              className="egCompareMore"
              type="button"
              onClick={() => navigate(`/stats2/compare?mode=${mode}`)}
            >
              More <ArrowRight size={14} />
            </button>
          </div>

          <div className="egCompareSub">Create your own head-to-head comparisons.</div>

          <div className="egCompareRings">
            <button className="egCompareRingBtn" type="button" onClick={() => navigate(`/stats2/compare?mode=${mode}`)}>
              <div className="egCompareRing">
                <div className="egCompareRingInner">{mode === 'players' ? <User size={26} /> : <Shield size={26} />}</div>
              </div>
              <div className="egCompareRingLabel">{mode === 'players' ? 'Add Player 1' : 'Add Team 1'}</div>
            </button>

            <div className="egCompareVS">V</div>

            <button className="egCompareRingBtn" type="button" onClick={() => navigate(`/stats2/compare?mode=${mode}`)}>
              <div className="egCompareRing">
                <div className="egCompareRingInner">{mode === 'players' ? <User size={26} /> : <Shield size={26} />}</div>
              </div>
              <div className="egCompareRingLabel">{mode === 'players' ? 'Add Player 2' : 'Add Team 2'}</div>
            </button>
          </div>
        </div>

        {/* Bottom padding so nav never covers */}
        <div className="egBottomSafePad" />
      </div>
    </div>
  );
}

function LeaderCard({
  cfg,
  mode,
  scope,
  onFullTable,
}: {
  cfg: StatLeaderCategory;
  mode: Mode;
  scope: Scope;
  onFullTable: () => void;
}) {
  const leader = cfg.top;
  const runners = (cfg.others || []).slice(0, 4);

  const leaderName = leader?.name || '—';
  const leaderSub = leader?.teamName || '';
  const leaderValue = valueText(scope === 'average' ? leader?.valueAvg ?? NaN : leader?.valueTotal ?? NaN);
  const imgUrl = leader?.photoUrl || '';

  const glow = mode === 'players' ? teamColorFor(leaderSub) : teamColorFor(leaderName);
  const teamLogo = mode === 'players' ? teamLogoFor(leaderSub) : teamLogoFor(leaderName);

  const first = mode === 'players' ? leaderName.split(' ')[0] || '' : '';
  const last = mode === 'players' ? leaderName.split(' ').slice(1).join(' ') : '';

  return (
    <div className="egLeaderCard">
      <div className="egLeaderHero">
        <div className="egLeaderGlow" style={{ background: `radial-gradient(ellipse at 70% 40%, ${glow} 0%, rgba(0,0,0,0) 70%)` }} />

        <div className="egLeaderTopRow">
          <div className="egLeaderChip">{cfg.label}</div>
          {teamLogo ? (
            <div className="egLeaderTeamBadge" aria-label="Team">
              <SmartImg src={teamLogo} alt="" className="egLeaderTeamLogo" />
            </div>
          ) : (
            <div className="egLeaderTeamBadge isGhost">{initials(mode === 'players' ? leaderSub : leaderName)}</div>
          )}
        </div>

        <div className="egLeaderMain">
          <div className="egLeaderValueBlock">
            <div className="egLeaderValue">{leaderValue}</div>
            {scope === 'average' && <div className="egLeaderPer">PER GAME</div>}
          </div>

          <div className="egLeaderNameBlock">
            {mode === 'players' ? (
              <>
                <div className="egLeaderFirst">{first}</div>
                <div className="egLeaderLast">{last}</div>
                <div className="egLeaderSub">{leaderSub || '—'}</div>
              </>
            ) : (
              <>
                <div className="egLeaderTeamName">{leaderName}</div>
                <div className="egLeaderSub">{'Season Leaders'}</div>
              </>
            )}
          </div>
        </div>

        {/* Headshot / Logo cut-out (fixture-card vibe) */}
        <div className="egLeaderCutout" aria-hidden="true">
          {imgUrl ? (
            <img src={imgUrl} alt="" />
          ) : (
            <div className="egLeaderCutoutFallback">{initials(leaderName)}</div>
          )}
        </div>
      </div>

      <div className="egLeaderList">
        {(runners.length ? runners : Array.from({ length: 4 })).map((r: any, idx: number) => {
          if (!r) {
            return (
              <div key={`empty-${idx}`} className="egLeaderRow egLeaderRowGhost">
                <div className="egLeaderRank">{idx + 2}</div>
                <div className="egLeaderMiniAvatar" />
                <div className="egLeaderRowName">—</div>
                <div className="egLeaderRowVal">—</div>
              </div>
            );
          }

          const nm = r?.name || '—';
          const sub = r?.teamName || '';
          const val = valueText(scope === 'average' ? r?.valueAvg ?? NaN : r?.valueTotal ?? NaN);
          const img = r?.photoUrl || '';

          const tLogo = mode === 'players' ? teamLogoFor(sub) : teamLogoFor(nm);

          return (
            <div key={`${cfg.statKey}-${idx}-${nm}`} className="egLeaderRow">
              <div className="egLeaderRank">{idx + 2}</div>

              <div className="egLeaderMiniAvatar">
                {img ? <img src={img} alt="" /> : <div className="egMiniInit">{initials(nm)}</div>}
              </div>

              <div className="egLeaderRowInfo">
                <div className="egLeaderRowName">{nm}</div>
                <div className="egLeaderRowSub">
                  {tLogo ? <SmartImg src={tLogo} alt="" className="egMiniTeamLogo" /> : <span className="egMiniTeamDot" />}
                  <span className="egLeaderRowSubText">{sub || (mode === 'teams' ? '—' : '')}</span>
                </div>
              </div>

              <div className="egLeaderRowVal">{val}</div>
            </div>
          );
        })}
      </div>

      <button className="egLeaderCTA" type="button" onClick={onFullTable}>
        Full Table <ArrowRight size={16} />
      </button>
    </div>
  );
}
