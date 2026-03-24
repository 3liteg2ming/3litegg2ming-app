import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Users, Search, X } from 'lucide-react';

import SmartImg from '../components/SmartImg';
import { TEAM_ASSETS, assetUrl, getTeamAssets, type TeamKey } from '../lib/teamAssets';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { useAllFixtures } from '../hooks/useFixtures';
import { computeH2HStats, type H2HResult } from '../lib/h2hStats';
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { fetchActiveCompetitionBaseline } from '../lib/seasonParticipantsRepo';
import { PLAYER_STAT_CONFIGS, TEAM_STAT_CONFIGS } from '../types/stats2';
import type { FixtureRow } from '../lib/fixturesRepo';
import type { StatLeaderCategory } from '../lib/stats-leaders-cache';

import '../styles/h2h.css';

/* ── Helpers ─────────────────────────────────────────────── */

const ALL_TEAMS = (Object.keys(TEAM_ASSETS) as TeamKey[]).sort((a, b) =>
  TEAM_ASSETS[a].name.localeCompare(TEAM_ASSETS[b].name),
);

function hexToRgba(hex: string, a: number) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.18 } } };

type CompareMode = 'players' | 'teams';

/* ── Player data types ───────────────────────────────────── */
type PlayerRow = {
  id: string;
  name: string;
  teamName: string;
  teamKey: string;
  teamLogo: string;
  teamColour: string;
  position: string;
  number: string;
  headshotUrl: string;
  stats: Record<string, number>;
};

/* ── Team data types ─────────────────────────────────────── */
type TeamRow = {
  id: string;
  name: string;
  shortName: string;
  teamKey: string;
  logoUrl: string;
  colour: string;
  stats: Record<string, number>;
};

/* ── Data loader ─────────────────────────────────────────── */
function normalizeTeamKey(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

async function loadPlayers(): Promise<PlayerRow[]> {
  const [baseline, aflPlayers] = await Promise.all([
    fetchActiveCompetitionBaseline(),
    fetchAflPlayers().catch((err) => {
      console.error('[HeadToHeadPage] Error fetching AFL players:', err);
      return [];
    }),
  ]);

  if (!aflPlayers || aflPlayers.length === 0) {
    console.warn('[HeadToHeadPage] No AFL players loaded');
    return [];
  }

  const playersByTeam = new Map<string, AflPlayer[]>();
  for (const p of aflPlayers) {
    const tk = normalizeTeamKey(p.teamKey || p.teamName || '');
    if (!playersByTeam.has(tk)) playersByTeam.set(tk, []);
    playersByTeam.get(tk)!.push(p);
  }

  const result: PlayerRow[] = [];
  const seen = new Set<string>();

  for (const team of baseline.teams) {
    const players = playersByTeam.get(normalizeTeamKey(team.teamKey)) || [];
    const ta = getTeamAssets(team.name);

    for (const p of players) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      result.push({
        id: p.id,
        name: String(p.name || '').trim() || 'Player',
        teamName: String(p.teamName || team.name),
        teamKey: team.teamKey,
        teamLogo: ta.logo,
        teamColour: ta.primary,
        position: String(p.position || ''),
        number: Number(p.number) > 0 ? String(Math.trunc(Number(p.number))) : '',
        headshotUrl: String(p.headshotUrl || ''),
        stats: {
          goals: Number(p.goals || 0),
          disposals: Number(p.disposals || 0),
          kicks: Number(p.kicks || 0),
          handballs: Number(p.handballs || 0),
          marks: Number(p.marks || 0),
          fantasyPoints: Number(p.fantasyPoints || 0) || (Number(p.disposals || 0) + Number(p.marks || 0) * 3 + Number(p.goals || 0) * 6),
        },
      });
    }
  }

  const sorted = result.sort((a, b) => a.name.localeCompare(b.name));
  console.log('[HeadToHeadPage] Loaded players:', sorted.length);
  return sorted;
}

async function loadTeams(): Promise<TeamRow[]> {
  const baseline = await fetchActiveCompetitionBaseline();
  return baseline.teams.map((t) => {
    const ta = getTeamAssets(t.name);
    return {
      id: t.id,
      name: t.name,
      shortName: t.shortName || t.name,
      teamKey: t.teamKey,
      logoUrl: ta.logo,
      colour: ta.primary,
      stats: {},
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/* ═══════════════════════════════════════════════════════════
   Player Picker Modal
   ═══════════════════════════════════════════════════════════ */
function PlayerPickerModal({
  players,
  title,
  onSelect,
  onClose,
}: {
  players: PlayerRow[];
  title: string;
  onSelect: (p: PlayerRow) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const s = search.toLowerCase();
    return players.filter(
      (p) => p.name.toLowerCase().includes(s) || p.teamName.toLowerCase().includes(s) || p.position.toLowerCase().includes(s),
    );
  }, [players, search]);

  const handleSelect = (p: PlayerRow) => {
    onSelect(p);
  };

  return (
    <div className="h2h-modal-overlay">
      <button type="button" className="h2h-modal-backdrop" onClick={onClose} aria-label="Close" />
      <div className="h2h-modal-sheet">
        {/* Header */}
        <div className="h2h-modal-header">
          <div className="h2h-modal-header-text">
            <div className="h2h-modal-label">{title}</div>
            <div className="h2h-modal-hint">{players.length} players</div>
          </div>
          <button type="button" className="h2h-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Search field */}
        <div className="h2h-modal-search-wrap">
          <div className="h2h-modal-search-box">
            <Search size={16} />
            <input
              type="text"
              className="h2h-modal-search-input"
              placeholder="Search name, team, position…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="h2h-modal-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {search && (
            <div className="h2h-modal-result-count">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="h2h-modal-list-wrap">
          {filtered.length > 0 ? (
            <div className="h2h-modal-list">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="h2h-modal-row"
                  onClick={() => handleSelect(p)}
                >
                  <div className="h2h-modal-row-avatar">
                    {p.headshotUrl ? (
                      <img src={p.headshotUrl} alt={p.name} loading="lazy" />
                    ) : (
                      <div className="h2h-modal-avatar-fallback">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                  <div className="h2h-modal-row-info">
                    <div className="h2h-modal-row-name">{p.name}</div>
                    <div className="h2h-modal-row-meta">
                      {p.teamLogo && <img src={p.teamLogo} alt="" className="h2h-modal-team-icon" />}
                      <span>{p.teamName}</span>
                      {p.position && <span className="h2h-modal-separator">•</span>}
                      {p.position && <span>{p.position}</span>}
                    </div>
                  </div>
                  {p.number && <div className="h2h-modal-row-number">#{p.number}</div>}
                </button>
              ))}
            </div>
          ) : (
            <div className="h2h-modal-empty">
              <div className="h2h-modal-empty-icon">🔍</div>
              <div className="h2h-modal-empty-title">
                {players.length === 0 ? 'No players available' : 'No matches found'}
              </div>
              <div className="h2h-modal-empty-text">
                {players.length === 0
                  ? 'Unable to load player data'
                  : `Try searching for a different name, team, or position`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Battle Bar Row
   ═══════════════════════════════════════════════════════════ */
function BattleRow({ label, leftVal, rightVal, leftColour, rightColour }: {
  label: string;
  leftVal: number;
  rightVal: number;
  leftColour: string;
  rightColour: string;
}) {
  const maxVal = Math.max(leftVal, rightVal, 1);
  const leftPct = (leftVal / maxVal) * 100;
  const rightPct = (rightVal / maxVal) * 100;
  const leftWins = leftVal > rightVal;
  const rightWins = rightVal > leftVal;
  const tie = leftVal === rightVal;

  return (
    <div className="cmpBattle__row">
      <div className="cmpBattle__barWrap cmpBattle__barWrap--left">
        <span className={`cmpBattle__val ${leftWins ? 'cmpBattle__val--win' : tie ? 'cmpBattle__val--tie' : ''}`}>{leftVal}</span>
        <div className="cmpBattle__track">
          <div
            className={`cmpBattle__bar cmpBattle__bar--left ${leftWins ? 'cmpBattle__bar--lead' : ''}`}
            style={{ width: `${leftPct}%`, '--barColour': leftColour } as React.CSSProperties}
          />
        </div>
      </div>
      <span className="cmpBattle__label">{label}</span>
      <div className="cmpBattle__barWrap cmpBattle__barWrap--right">
        <div className="cmpBattle__track">
          <div
            className={`cmpBattle__bar cmpBattle__bar--right ${rightWins ? 'cmpBattle__bar--lead' : ''}`}
            style={{ width: `${rightPct}%`, '--barColour': rightColour } as React.CSSProperties}
          />
        </div>
        <span className={`cmpBattle__val ${rightWins ? 'cmpBattle__val--win' : tie ? 'cmpBattle__val--tie' : ''}`}>{rightVal}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Player Compare Display
   ═══════════════════════════════════════════════════════════ */
function PlayerCompare({ players }: { players: PlayerRow[] }) {
  const [left, setLeft] = useState<PlayerRow | null>(null);
  const [right, setRight] = useState<PlayerRow | null>(null);
  const [pickerSlot, setPickerSlot] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (players.length >= 2 && !left && !right) {
      setLeft(players[0]);
      setRight(players[1]);
    }
  }, [players, left, right]);

  const handleSelect = useCallback((p: PlayerRow) => {
    if (pickerSlot === 'left') setLeft(p);
    else setRight(p);
    setPickerSlot(null);
  }, [pickerSlot]);

  return (
    <>
      <div className="cmpVersus">
        <div className="cmpVersus__line" />
        <span className="cmpVersus__text">VS</span>
        <div className="cmpVersus__line" />
      </div>

      <div className="cmpFighters">
        {[{ slot: 'left' as const, player: left }, { slot: 'right' as const, player: right }].map(({ slot, player }) => {
          const tint = player?.teamColour || '#283443';
          return (
            <button key={slot} type="button" className="cmpFighter" onClick={() => setPickerSlot(slot)}>
              <div className="cmpFighter__ring" style={{ borderColor: `${tint}aa`, boxShadow: `0 0 20px ${tint}33` }}>
                <div className="cmpFighter__avatar">
                  {player?.headshotUrl ? (
                    <img src={player.headshotUrl} alt={player.name} loading="lazy" />
                  ) : (
                    <div className="cmpFighter__silhouette"><User size={32} /></div>
                  )}
                </div>
              </div>
              <div className="cmpFighter__name">
                {player ? (
                  <>
                    <span className="cmpFighter__first">{player.name.split(' ')[0]}</span>
                    <span className="cmpFighter__last">{player.name.split(' ').slice(1).join(' ')}</span>
                  </>
                ) : (
                  <span className="cmpFighter__prompt">Tap to select</span>
                )}
              </div>
              {player && (
                <div className="cmpFighter__team">
                  {player.teamLogo && <img src={player.teamLogo} alt="" className="cmpFighter__teamLogo" />}
                  <span>{player.teamName}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {left && right && (
        <motion.div className="cmpBattle" variants={stagger} initial="hidden" animate="show" key={`${left.id}-${right.id}`}>
          {PLAYER_STAT_CONFIGS.map((cfg) => (
            <motion.div key={cfg.key} variants={fadeUp}>
              <BattleRow
                label={cfg.abbreviation}
                leftVal={left.stats[cfg.key] ?? 0}
                rightVal={right.stats[cfg.key] ?? 0}
                leftColour={left.teamColour}
                rightColour={right.teamColour}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {!left && !right && (
        <div className="cmpEmpty">
          <div className="cmpEmpty__text">Tap the portraits to select two players to compare</div>
        </div>
      )}

      {pickerSlot && (
        <PlayerPickerModal
          players={players}
          title={`Choose ${pickerSlot === 'left' ? 'first' : 'second'} player`}
          onSelect={handleSelect}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Team Picker Modal
   ═══════════════════════════════════════════════════════════ */
function TeamPickerModal({
  teams,
  selectedTeam,
  slot,
  onSelect,
  onClose,
}: {
  teams: TeamRow[];
  selectedTeam: TeamKey | null;
  slot: 'a' | 'b';
  onSelect: (key: TeamKey) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const slotLabel = slot === 'a' ? 'first' : 'second';
  const filtered = useMemo(() => {
    if (!search.trim()) return teams;
    const s = search.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(s) || t.shortName.toLowerCase().includes(s));
  }, [teams, search]);

  return (
    <div className="h2h-modal-overlay">
      <button type="button" className="h2h-modal-backdrop" onClick={onClose} aria-label="Close" />
      <div className="h2h-modal-sheet">
        {/* Header */}
        <div className="h2h-modal-header">
          <div className="h2h-modal-header-text">
            <div className="h2h-modal-label">Choose {slotLabel} team</div>
            <div className="h2h-modal-hint">{teams.length} teams</div>
          </div>
          <button type="button" className="h2h-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Search field */}
        <div className="h2h-modal-search-wrap">
          <div className="h2h-modal-search-box">
            <Search size={16} />
            <input
              type="text"
              className="h2h-modal-search-input"
              placeholder="Search team name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="h2h-modal-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {search && (
            <div className="h2h-modal-result-count">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Team list */}
        <div className="h2h-modal-list-wrap">
          {filtered.length > 0 ? (
            <div className="h2h-modal-list">
              {filtered.map((t) => {
                const isSelected = selectedTeam === t.teamKey;
                return (
                  <button
                    key={t.teamKey}
                    type="button"
                    className={`h2h-modal-row ${isSelected ? 'h2h-modal-row--selected' : ''}`}
                    onClick={() => onSelect(t.teamKey as TeamKey)}
                  >
                    <div className="h2h-modal-row-logo">
                      <SmartImg src={t.logoUrl} alt={t.name} />
                    </div>
                    <div className="h2h-modal-row-info">
                      <div className="h2h-modal-row-name">{t.name}</div>
                      <div className="h2h-modal-row-short">{t.shortName}</div>
                    </div>
                    {isSelected && <div className="h2h-modal-checkmark">✓</div>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h2h-modal-empty">
              <div className="h2h-modal-empty-icon">🔍</div>
              <div className="h2h-modal-empty-title">No teams found</div>
              <div className="h2h-modal-empty-text">Try a different search term</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Team Compare Display (H2H + Stats)
   ═══════════════════════════════════════════════════════════ */
function TeamCompare({ fixtures }: { fixtures: FixtureRow[] }) {
  const [params, setParams] = useSearchParams();
  const [pickerSlot, setPickerSlot] = useState<'a' | 'b' | null>(null);
  const teamA = (params.get('a') as TeamKey | null) ?? null;
  const teamB = (params.get('b') as TeamKey | null) ?? null;
  const validA = teamA && teamA in TEAM_ASSETS ? teamA : null;
  const validB = teamB && teamB in TEAM_ASSETS && teamB !== validA ? teamB : null;

  const setTeamA = useCallback((key: TeamKey | null) => {
    setParams((prev) => { const n = new URLSearchParams(prev); if (key) n.set('a', key); else n.delete('a'); return n; }, { replace: true });
  }, [setParams]);

  const setTeamB = useCallback((key: TeamKey | null) => {
    setParams((prev) => { const n = new URLSearchParams(prev); if (key) n.set('b', key); else n.delete('b'); return n; }, { replace: true });
  }, [setParams]);

  const handleTeamSelect = useCallback((slot: 'a' | 'b', key: TeamKey) => {
    if (slot === 'a') setTeamA(key);
    else setTeamB(key);
    setPickerSlot(null);
  }, [setTeamA, setTeamB]);

  const stats = useMemo(() => {
    if (!validA || !validB) return null;
    return computeH2HStats(fixtures, validA, validB);
  }, [fixtures, validA, validB]);

  const tA = validA ? TEAM_ASSETS[validA] : null;
  const tB = validB ? TEAM_ASSETS[validB] : null;

  const cssVars = useMemo(() => {
    if (!tA || !tB) return {} as React.CSSProperties;
    return {
      '--teamA': tA.colour,
      '--teamB': tB.colour,
      '--teamABg': hexToRgba(tA.colour, 0.06),
      '--teamBBg': hexToRgba(tB.colour, 0.06),
    } as React.CSSProperties;
  }, [tA, tB]);

  return (
    <div style={cssVars}>
      {/* Team selection */}
      <div className="teamSelect">
        <div className="teamSelect__slots">
          <button
            type="button"
            className="teamSelect__slot teamSelect__slot--a"
            onClick={() => setPickerSlot('a')}
          >
            {validA && tA ? (
              <>
                <SmartImg className="teamSelect__slotLogo" src={assetUrl(tA.logoPath)} alt={tA.name} />
                <div className="teamSelect__slotInfo">
                  <span className="teamSelect__slotName">{tA.name}</span>
                  <span className="teamSelect__slotTap">Tap to change</span>
                </div>
              </>
            ) : (
              <>
                <div className="teamSelect__slotLogoEmpty" />
                <div className="teamSelect__slotInfo">
                  <span className="teamSelect__slotPrompt">Pick Team A</span>
                </div>
              </>
            )}
          </button>

          <div className="teamSelect__divider">VS</div>

          <button
            type="button"
            className="teamSelect__slot teamSelect__slot--b"
            onClick={() => setPickerSlot('b')}
          >
            {validB && tB ? (
              <>
                <SmartImg className="teamSelect__slotLogo" src={assetUrl(tB.logoPath)} alt={tB.name} />
                <div className="teamSelect__slotInfo">
                  <span className="teamSelect__slotName">{tB.name}</span>
                  <span className="teamSelect__slotTap">Tap to change</span>
                </div>
              </>
            ) : (
              <>
                <div className="teamSelect__slotLogoEmpty" />
                <div className="teamSelect__slotInfo">
                  <span className="teamSelect__slotPrompt">Pick Team B</span>
                </div>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Team picker modal */}
      {pickerSlot && (
        <TeamPickerModal
          teams={Object.entries(TEAM_ASSETS).map(([key, asset]) => ({
            id: key,
            name: asset.name,
            shortName: asset.shortName,
            teamKey: key as TeamKey,
            logoUrl: assetUrl(asset.logoPath),
            colour: asset.colour,
            stats: {},
          }))}
          selectedTeam={pickerSlot === 'a' ? validA : validB}
          slot={pickerSlot}
          onSelect={(key) => handleTeamSelect(pickerSlot, key)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* H2H Stats */}
      <AnimatePresence mode="wait">
        {validA && validB && stats && tA && tB && (
          <motion.div key={`${validA}-${validB}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {stats.totalMatches === 0 ? (
              <div className="h2hEmpty">
                <div className="h2hEmpty__icon">🤝</div>
                <div className="h2hEmpty__text">{tA.name} and {tB.name} haven't met yet this season.<br />Check back after they play!</div>
              </div>
            ) : (
              <motion.div className="h2hStats" variants={stagger} initial="hidden" animate="show">
                {/* W-L-D Record */}
                <motion.div className="h2hCard" variants={fadeUp}>
                  <div className="h2hCard__title">Overall Record</div>
                  <div className="h2hRecord">
                    <div className="h2hRecord__side">
                      <span className="h2hRecord__count h2hRecord__count--a">{stats.teamAWins}</span>
                      <span className="h2hRecord__label">{tA.shortName}</span>
                    </div>
                    <div className="h2hRecord__center">
                      <span className="h2hRecord__draws">{stats.draws}</span>
                      <span className="h2hRecord__drawLabel">Draws</span>
                    </div>
                    <div className="h2hRecord__side">
                      <span className="h2hRecord__count h2hRecord__count--b">{stats.teamBWins}</span>
                      <span className="h2hRecord__label">{tB.shortName}</span>
                    </div>
                  </div>
                  {(() => {
                    const total = stats.teamAWins + stats.teamBWins + stats.draws;
                    const aPct = total > 0 ? (stats.teamAWins / total) * 100 : 0;
                    const bPct = total > 0 ? (stats.teamBWins / total) * 100 : 0;
                    const dPct = total > 0 ? (stats.draws / total) * 100 : 0;
                    return (
                      <div className="h2hWinBar">
                        <div className="h2hWinBar__fill h2hWinBar__fill--a" style={{ width: `${aPct}%` }} />
                        <div className="h2hWinBar__fill h2hWinBar__fill--draw" style={{ width: `${dPct}%` }} />
                        <div className="h2hWinBar__fill h2hWinBar__fill--b" style={{ width: `${bPct}%` }} />
                      </div>
                    );
                  })()}
                </motion.div>

                {/* Key Stats */}
                <motion.div className="h2hCard" variants={fadeUp}>
                  <div className="h2hCard__title">Key Stats</div>
                  <div className="h2hStatRow">
                    <span className="h2hStatRow__val h2hStatRow__val--a">{stats.teamATotalPoints}</span>
                    <span className="h2hStatRow__label">Total Points</span>
                    <span className="h2hStatRow__val h2hStatRow__val--b">{stats.teamBTotalPoints}</span>
                  </div>
                  <div className="h2hStatRow">
                    <span className="h2hStatRow__val" style={{ color: 'rgba(255,255,255,0.7)' }}>{stats.averageMargin}</span>
                    <span className="h2hStatRow__label">Avg Margin</span>
                    <span className="h2hStatRow__val" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>pts</span>
                  </div>
                </motion.div>

                {/* Biggest Win */}
                {stats.biggestWin && (
                  <motion.div className="h2hCard" variants={fadeUp}>
                    <div className="h2hCard__title">Biggest Win</div>
                    <div className="h2hStatRow">
                      <span className="h2hStatRow__val" style={{ color: stats.biggestWin.winner === 'A' ? 'var(--teamA)' : 'var(--teamB)' }}>
                        {stats.biggestWin.winnerScore} – {stats.biggestWin.loserScore}
                      </span>
                      <span className="h2hStatRow__label">{stats.biggestWin.winner === 'A' ? tA.name : tB.name} by {stats.biggestWin.margin}</span>
                      <span className="h2hStatRow__val" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{stats.biggestWin.roundLabel}</span>
                    </div>
                  </motion.div>
                )}

                {/* Streak */}
                {stats.currentStreak.count > 0 && stats.currentStreak.team && (
                  <motion.div className={`h2hStreak${stats.currentStreak.team === 'B' ? ' h2hStreak--b' : ''}`} variants={fadeUp}>
                    <span className="h2hStreak__icon">🔥</span>
                    <span className="h2hStreak__text">
                      <span className="h2hStreak__highlight">{stats.currentStreak.team === 'A' ? tA.name : tB.name}</span>{' '}
                      {stats.currentStreak.count === 1 ? 'won the last meeting' : `on a ${stats.currentStreak.count}-game win streak`}
                    </span>
                  </motion.div>
                )}

                {/* Last Meetings */}
                {stats.last5.length > 0 && (
                  <motion.div className="h2hCard" variants={fadeUp}>
                    <div className="h2hCard__title">{stats.meetings.length <= 5 ? 'All Meetings' : 'Last 5 Meetings'}</div>
                    <div className="h2hMeetings">
                      {stats.last5.map((m, i) => (
                        <motion.div key={m.fixtureId} className="h2hMeeting" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.15 }}>
                          <span className="h2hMeeting__round">R{m.round}</span>
                          <div className="h2hMeeting__scores">
                            <span className={`h2hMeeting__score h2hMeeting__score--a${m.winner === 'A' ? ' h2hMeeting__score--winner' : ''}`}>{m.teamAScore}</span>
                            <span className="h2hMeeting__dash">–</span>
                            <span className={`h2hMeeting__score h2hMeeting__score--b${m.winner === 'B' ? ' h2hMeeting__score--winner' : ''}`}>{m.teamBScore}</span>
                          </div>
                          <span className={`h2hMeeting__result${m.winner === 'A' ? ' h2hMeeting__result--a' : m.winner === 'B' ? ' h2hMeeting__result--b' : ' h2hMeeting__result--draw'}`}>
                            {m.winner === 'A' ? tA.shortName : m.winner === 'B' ? tB.shortName : 'Draw'}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */
export default function HeadToHeadPage() {
  const [mode, setMode] = useState<CompareMode>('players');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const competitionKey = getStoredCompetitionKey();
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);
  const { data: fixtureData } = useAllFixtures(seasonSlug, true);
  const fixtures = (Array.isArray(fixtureData) ? fixtureData : []) as FixtureRow[];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPlayers()
      .then((rows) => { if (!cancelled) setPlayers(rows); })
      .catch((err) => { 
        console.error('[HeadToHeadPage] Error loading players:', err);
        if (!cancelled) setPlayers([]); 
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h2hPage">
      <div className="h2hWrap">
        <section className="h2hHero">
          <div className="kicker">{competitionKey.toUpperCase()} • Elite Gaming</div>
          <div className="title">Compare</div>
          <div className="hint">
            {mode === 'players' ? 'Pick two players to compare their season stats' : 'Pick two teams to see their head-to-head record'}
          </div>
        </section>

        {/* Mode toggle */}
        <div className="cmpToggle">
          <button type="button" className={`cmpToggle__btn ${mode === 'players' ? 'cmpToggle__btn--active' : ''}`} onClick={() => setMode('players')}>
            <User size={14} /> Players
          </button>
          <button type="button" className={`cmpToggle__btn ${mode === 'teams' ? 'cmpToggle__btn--active' : ''}`} onClick={() => setMode('teams')}>
            <Users size={14} /> Teams
          </button>
        </div>

        {/* Content */}
        <div className="cmpContent">
          {mode === 'players' ? (
            loading ? (
              <div className="cmpEmpty"><div className="cmpEmpty__text">Loading players…</div></div>
            ) : (
              <PlayerCompare players={players} />
            )
          ) : (
            <TeamCompare fixtures={fixtures} />
          )}
        </div>

        <div className="safeBottom" />
      </div>
    </div>
  );
}
