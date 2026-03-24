import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, User, Users, X } from 'lucide-react';

import { getStoredCompetitionKey } from '../lib/competitionRegistry';
import { PLAYER_STAT_CONFIGS, TEAM_STAT_CONFIGS } from '../types/stats2';
import {
  loadComparePlayers,
  loadCompareTeams,
  safeNum,
  initials,
  hexToRgba,
  matchesLabel,
  type ComparePlayerRow,
  type CompareTeamRow,
} from '../lib/compareData';
import type { TeamKey } from '../lib/teamAssets';

import '../styles/h2h.css';

type CompareMode = 'players' | 'teams';
type PickerSlot = 'left' | 'right';

/* ── Shared sub-components ── */

function CompareSlotCard({
  title,
  subtitle,
  image,
  colour,
  placeholder,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  image?: string | null;
  colour: string;
  placeholder: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="egCompareSlot" onClick={onClick}>
      <div
        className="egCompareSlot__avatar"
        style={{
          borderColor: hexToRgba(colour, 0.35),
          boxShadow: `0 0 0 1px ${hexToRgba(colour, 0.16)}, 0 12px 28px ${hexToRgba(colour, 0.18)}`,
        }}
      >
        {image ? <img src={image} alt={title} loading="lazy" /> : <div className="egCompareSlot__fallback">{icon}</div>}
      </div>
      <div className="egCompareSlot__title">{title || placeholder}</div>
      <div className="egCompareSlot__subtitle">{subtitle || 'Tap to select'}</div>
    </button>
  );
}

function BattleRow({
  label,
  leftValue,
  rightValue,
  leftColour,
  rightColour,
}: {
  label: string;
  leftValue: number;
  rightValue: number;
  leftColour: string;
  rightColour: string;
}) {
  const maxValue = Math.max(leftValue, rightValue, 1);
  const leftPct = (leftValue / maxValue) * 100;
  const rightPct = (rightValue / maxValue) * 100;
  const leftWins = leftValue > rightValue;
  const rightWins = rightValue > leftValue;

  return (
    <div className="egCompareBattleRow">
      <div className="egCompareBattleRow__side egCompareBattleRow__side--left">
        <span className={`egCompareBattleRow__value ${leftWins ? 'isLeader' : ''}`}>{leftValue}</span>
        <div className="egCompareBattleRow__track">
          <div
            className={`egCompareBattleRow__fill ${leftWins ? 'isLeader' : ''}`}
            style={{ width: `${leftPct}%`, background: `linear-gradient(90deg, ${hexToRgba(leftColour, 0.35)}, ${leftColour})` }}
          />
        </div>
      </div>
      <div className="egCompareBattleRow__label">{label}</div>
      <div className="egCompareBattleRow__side egCompareBattleRow__side--right">
        <div className="egCompareBattleRow__track egCompareBattleRow__track--right">
          <div
            className={`egCompareBattleRow__fill ${rightWins ? 'isLeader' : ''}`}
            style={{ width: `${rightPct}%`, background: `linear-gradient(90deg, ${rightColour}, ${hexToRgba(rightColour, 0.35)})` }}
          />
        </div>
        <span className={`egCompareBattleRow__value ${rightWins ? 'isLeader' : ''}`}>{rightValue}</span>
      </div>
    </div>
  );
}

function PlayerPickerSheet({
  isOpen,
  players,
  leftPlayer,
  rightPlayer,
  slot,
  onClose,
  onClear,
  onSelect,
}: {
  isOpen: boolean;
  players: ComparePlayerRow[];
  leftPlayer: ComparePlayerRow | null;
  rightPlayer: ComparePlayerRow | null;
  slot: PickerSlot | null;
  onClose: () => void;
  onClear: () => void;
  onSelect: (slot: PickerSlot, player: ComparePlayerRow) => void;
}) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('All');

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setTeamFilter('All');
    }
  }, [isOpen]);

  const teamOptions = useMemo(
    () => ['All', ...Array.from(new Set(players.map((player) => player.teamName))).sort((a, b) => a.localeCompare(b))],
    [players],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) => {
      const matchesSearch =
        !q ||
        player.name.toLowerCase().includes(q) ||
        player.teamName.toLowerCase().includes(q) ||
        player.position.toLowerCase().includes(q);
      const matchesTeam = teamFilter === 'All' || player.teamName === teamFilter;
      return matchesSearch && matchesTeam;
    });
  }, [players, search, teamFilter]);

  if (!isOpen || !slot) return null;

  return (
    <div className="egPickerModal">
      <button type="button" className="egPickerModal__backdrop" onClick={onClose} aria-label="Close picker" />
      <div className="egPickerModal__sheet">
        <div className="egPickerModal__topBar">
          <button type="button" className="egPickerModal__clear" onClick={onClear}>Clear</button>
          <div className="egPickerModal__title">Select Players</div>
          <button type="button" className="egPickerModal__close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="egPickerModal__slots">
          <CompareSlotCard title={leftPlayer?.name || 'Player 1'} subtitle={leftPlayer?.teamName || 'Tap to select'} image={leftPlayer?.headshotUrl} colour={leftPlayer?.teamColour || '#7b8499'} placeholder="Player 1" icon={<User size={38} />} onClick={() => undefined} />
          <div className="egPickerModal__vs">V</div>
          <CompareSlotCard title={rightPlayer?.name || 'Player 2'} subtitle={rightPlayer?.teamName || 'Tap to select'} image={rightPlayer?.headshotUrl} colour={rightPlayer?.teamColour || '#7b8499'} placeholder="Player 2" icon={<User size={38} />} onClick={() => undefined} />
        </div>

        <div className="egPickerModal__search">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Players" autoFocus />
          {search ? <button type="button" className="egPickerModal__searchClear" onClick={() => setSearch('')}><X size={14} /></button> : null}
        </div>

        <div className="egPickerModal__filters">
          {teamOptions.slice(0, 8).map((team) => (
            <button key={team} type="button" className={`egPickerModal__chip ${teamFilter === team ? 'isActive' : ''}`} onClick={() => setTeamFilter(team)}>
              {team === 'All' ? 'All Teams' : team}
            </button>
          ))}
        </div>

        <div className="egPickerModal__countRow">
          <div className="egPickerModal__countLabel">Add multiple players</div>
          <div className="egPickerModal__countValue">{(leftPlayer ? 1 : 0) + (rightPlayer ? 1 : 0)} of 2</div>
        </div>

        <div className="egPickerModal__list">
          {filteredPlayers.length ? filteredPlayers.map((player) => {
            const isSelected = leftPlayer?.id === player.id || rightPlayer?.id === player.id;
            return (
              <button key={player.id} type="button" className={`egPickerRow ${isSelected ? 'isSelected' : ''}`} onClick={() => onSelect(slot, player)}>
                <div className="egPickerRow__avatar" style={{ borderColor: hexToRgba(player.teamColour, 0.28) }}>
                  {player.headshotUrl ? <img src={player.headshotUrl} alt={player.name} loading="lazy" /> : <div className="egPickerRow__avatarFallback">{initials(player.name)}</div>}
                </div>
                <div className="egPickerRow__meta">
                  <div className="egPickerRow__name">{player.name}</div>
                  <div className="egPickerRow__sub">{player.number ? `${player.number} ` : ''}{player.teamName}</div>
                </div>
                <div className="egPickerRow__action">{isSelected ? '✓' : <Plus size={18} />}</div>
              </button>
            );
          }) : (
            <div className="egPickerModal__empty">
              <User size={26} />
              <div className="egPickerModal__emptyTitle">No players found</div>
              <div className="egPickerModal__emptyText">Try a different player name, club, or position.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamPickerSheet({
  isOpen,
  teams,
  leftTeam,
  rightTeam,
  slot,
  onClose,
  onClear,
  onSelect,
}: {
  isOpen: boolean;
  teams: CompareTeamRow[];
  leftTeam: CompareTeamRow | null;
  rightTeam: CompareTeamRow | null;
  slot: PickerSlot | null;
  onClose: () => void;
  onClear: () => void;
  onSelect: (slot: PickerSlot, team: CompareTeamRow) => void;
}) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((team) => !q || team.name.toLowerCase().includes(q) || team.shortName.toLowerCase().includes(q));
  }, [teams, search]);

  if (!isOpen || !slot) return null;

  return (
    <div className="egPickerModal">
      <button type="button" className="egPickerModal__backdrop" onClick={onClose} aria-label="Close picker" />
      <div className="egPickerModal__sheet">
        <div className="egPickerModal__topBar">
          <button type="button" className="egPickerModal__clear" onClick={onClear}>Clear</button>
          <div className="egPickerModal__title">Select Teams</div>
          <button type="button" className="egPickerModal__close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="egPickerModal__slots">
          <CompareSlotCard title={leftTeam?.name || 'Team 1'} subtitle={leftTeam ? matchesLabel(leftTeam.matchesPlayed) : 'Tap to select'} image={leftTeam?.logoUrl} colour={leftTeam?.colour || '#7b8499'} placeholder="Team 1" icon={<Users size={38} />} onClick={() => undefined} />
          <div className="egPickerModal__vs">V</div>
          <CompareSlotCard title={rightTeam?.name || 'Team 2'} subtitle={rightTeam ? matchesLabel(rightTeam.matchesPlayed) : 'Tap to select'} image={rightTeam?.logoUrl} colour={rightTeam?.colour || '#7b8499'} placeholder="Team 2" icon={<Users size={38} />} onClick={() => undefined} />
        </div>

        <div className="egPickerModal__search">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Teams" autoFocus />
          {search ? <button type="button" className="egPickerModal__searchClear" onClick={() => setSearch('')}><X size={14} /></button> : null}
        </div>

        <div className="egPickerModal__countRow">
          <div className="egPickerModal__countLabel">Add multiple teams</div>
          <div className="egPickerModal__countValue">{(leftTeam ? 1 : 0) + (rightTeam ? 1 : 0)} of 2</div>
        </div>

        <div className="egPickerModal__list">
          {filteredTeams.map((team) => {
            const isSelected = leftTeam?.key === team.key || rightTeam?.key === team.key;
            return (
              <button key={team.key} type="button" className={`egPickerRow egPickerRow--team ${isSelected ? 'isSelected' : ''}`} onClick={() => onSelect(slot, team)}>
                <div className="egPickerRow__avatar egPickerRow__avatar--team" style={{ borderColor: hexToRgba(team.colour, 0.28) }}>
                  <img src={team.logoUrl} alt={team.name} loading="lazy" />
                </div>
                <div className="egPickerRow__meta">
                  <div className="egPickerRow__name">{team.name}</div>
                  <div className="egPickerRow__sub">{matchesLabel(team.matchesPlayed)}</div>
                </div>
                <div className="egPickerRow__action">{isSelected ? '✓' : <Plus size={18} />}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerCompare({ players }: { players: ComparePlayerRow[] }) {
  const [pickerSlot, setPickerSlot] = useState<PickerSlot | null>(null);
  const [leftPlayer, setLeftPlayer] = useState<ComparePlayerRow | null>(null);
  const [rightPlayer, setRightPlayer] = useState<ComparePlayerRow | null>(null);

  const handlePlayerSelect = useCallback((slot: PickerSlot, player: ComparePlayerRow) => {
    if (slot === 'left') {
      setLeftPlayer(player);
      if (rightPlayer?.id === player.id) setRightPlayer(null);
      setPickerSlot('right');
      return;
    }
    setRightPlayer(player);
    if (leftPlayer?.id === player.id) setLeftPlayer(null);
    setPickerSlot(null);
  }, [leftPlayer?.id, rightPlayer?.id]);

  return (
    <>
      <div className="cmpVersus">
        <div className="cmpVersus__line" />
        <span className="cmpVersus__text">VS</span>
        <div className="cmpVersus__line" />
      </div>

      <div className="cmpFighters">
        <CompareSlotCard title={leftPlayer?.name || 'Player 1'} subtitle={leftPlayer?.teamName || 'Tap to select'} image={leftPlayer?.headshotUrl} colour={leftPlayer?.teamColour || '#7b8499'} placeholder="Player 1" icon={<User size={36} />} onClick={() => setPickerSlot('left')} />
        <CompareSlotCard title={rightPlayer?.name || 'Player 2'} subtitle={rightPlayer?.teamName || 'Tap to select'} image={rightPlayer?.headshotUrl} colour={rightPlayer?.teamColour || '#7b8499'} placeholder="Player 2" icon={<User size={36} />} onClick={() => setPickerSlot('right')} />
      </div>

      {leftPlayer && rightPlayer ? (
        <motion.div className="egCompareBattle" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} initial="hidden" animate="show" key={`${leftPlayer.id}-${rightPlayer.id}`}>
          {PLAYER_STAT_CONFIGS.map((config) => (
            <motion.div key={config.key} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.18 } } }}>
              <BattleRow label={config.label.toUpperCase()} leftValue={leftPlayer.stats[config.key] ?? 0} rightValue={rightPlayer.stats[config.key] ?? 0} leftColour={leftPlayer.teamColour} rightColour={rightPlayer.teamColour} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="cmpEmpty"><div className="cmpEmpty__text">Choose two players to unlock the live season stat battle.</div></div>
      )}

      <PlayerPickerSheet isOpen={Boolean(pickerSlot)} players={players} leftPlayer={leftPlayer} rightPlayer={rightPlayer} slot={pickerSlot} onClose={() => setPickerSlot(null)} onClear={() => { setLeftPlayer(null); setRightPlayer(null); }} onSelect={handlePlayerSelect} />
    </>
  );
}

function TeamCompare({ teams }: { teams: CompareTeamRow[] }) {
  const [params, setParams] = useSearchParams();
  const [pickerSlot, setPickerSlot] = useState<PickerSlot | null>(null);

  const teamAKey = (params.get('a') as TeamKey | null) ?? null;
  const teamBKey = (params.get('b') as TeamKey | null) ?? null;
  const teamA = teamAKey ? teams.find((team) => team.key === teamAKey) || null : null;
  const teamB = teamBKey ? teams.find((team) => team.key === teamBKey) || null : null;

  const setTeamParam = useCallback((slot: PickerSlot, team: CompareTeamRow | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      const key = slot === 'left' ? 'a' : 'b';
      if (team) next.set(key, team.key);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  const handleTeamSelect = useCallback((slot: PickerSlot, team: CompareTeamRow) => {
    if (slot === 'left') {
      setTeamParam('left', team);
      if (teamB?.key === team.key) setTeamParam('right', null);
      setPickerSlot('right');
      return;
    }
    setTeamParam('right', team);
    if (teamA?.key === team.key) setTeamParam('left', null);
    setPickerSlot(null);
  }, [setTeamParam, teamA?.key, teamB?.key]);

  return (
    <>
      <div className="cmpVersus">
        <div className="cmpVersus__line" />
        <span className="cmpVersus__text">VS</span>
        <div className="cmpVersus__line" />
      </div>

      <div className="cmpFighters">
        <CompareSlotCard title={teamA?.name || 'Team 1'} subtitle={teamA ? matchesLabel(teamA.matchesPlayed) : 'Tap to select'} image={teamA?.logoUrl} colour={teamA?.colour || '#7b8499'} placeholder="Team 1" icon={<Users size={36} />} onClick={() => setPickerSlot('left')} />
        <CompareSlotCard title={teamB?.name || 'Team 2'} subtitle={teamB ? matchesLabel(teamB.matchesPlayed) : 'Tap to select'} image={teamB?.logoUrl} colour={teamB?.colour || '#7b8499'} placeholder="Team 2" icon={<Users size={36} />} onClick={() => setPickerSlot('right')} />
      </div>

      {teamA && teamB ? (
        <motion.div className="egCompareBattle" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} initial="hidden" animate="show" key={`${teamA.key}-${teamB.key}`}>
          {TEAM_STAT_CONFIGS.map((config) => (
            <motion.div key={config.key} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.18 } } }}>
              <BattleRow label={config.label.toUpperCase()} leftValue={safeNum(teamA.stats[config.key])} rightValue={safeNum(teamB.stats[config.key])} leftColour={teamA.colour} rightColour={teamB.colour} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="cmpEmpty"><div className="cmpEmpty__text">Choose two teams to unlock the live season team battle.</div></div>
      )}

      <TeamPickerSheet isOpen={Boolean(pickerSlot)} teams={teams} leftTeam={teamA} rightTeam={teamB} slot={pickerSlot} onClose={() => setPickerSlot(null)} onClear={() => { setTeamParam('left', null); setTeamParam('right', null); }} onSelect={handleTeamSelect} />
    </>
  );
}

export default function HeadToHeadPage() {
  const [params] = useSearchParams();
  const initialMode = (params.get('mode') === 'teams' ? 'teams' : 'players') as CompareMode;
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [players, setPlayers] = useState<ComparePlayerRow[]>([]);
  const [teams, setTeams] = useState<CompareTeamRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlayers(true);
    loadComparePlayers()
      .then((rows) => { if (!cancelled) setPlayers(rows); })
      .catch((error) => {
        console.error('[HeadToHeadPage] compare players failed', error);
        if (!cancelled) setPlayers([]);
      })
      .finally(() => { if (!cancelled) setLoadingPlayers(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingTeams(true);
    loadCompareTeams()
      .then((rows) => { if (!cancelled) setTeams(rows); })
      .catch((error) => {
        console.error('[HeadToHeadPage] compare teams failed', error);
        if (!cancelled) setTeams([]);
      })
      .finally(() => { if (!cancelled) setLoadingTeams(false); });
    return () => { cancelled = true; };
  }, []);

  const competitionKey = getStoredCompetitionKey();

  return (
    <div className="h2hPage">
      <div className="h2hWrap">
        <section className="h2hHero">
          <div className="h2hHero__kicker">{competitionKey.toUpperCase()} • Elite Gaming</div>
          <h1 className="h2hHero__title">Compare</h1>
          <p className="h2hHero__hint">{mode === 'players' ? 'Pick two players and compare their live season numbers.' : 'Pick two teams and compare their live season totals.'}</p>
        </section>

        <div className="cmpToggle">
          <button type="button" className={`cmpToggle__btn ${mode === 'players' ? 'cmpToggle__btn--active' : ''}`} onClick={() => setMode('players')}>
            <User size={14} /> Players
          </button>
          <button type="button" className={`cmpToggle__btn ${mode === 'teams' ? 'cmpToggle__btn--active' : ''}`} onClick={() => setMode('teams')}>
            <Users size={14} /> Teams
          </button>
        </div>

        <div className="cmpContent">
          {mode === 'players' ? (
            loadingPlayers ? <div className="cmpEmpty"><div className="cmpEmpty__text">Loading live player data…</div></div> : <PlayerCompare players={players} />
          ) : (
            loadingTeams ? <div className="cmpEmpty"><div className="cmpEmpty__text">Loading live team data…</div></div> : <TeamCompare teams={teams} />
          )}
        </div>

        <div className="safeBottom" />
      </div>
    </div>
  );
}
