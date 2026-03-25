import React, { useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search, User, X } from 'lucide-react';

type GoalKicker = {
  id: string;
  name: string;
  photoUrl?: string;
  goals: number;
};

type AflPlayer = {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  photoUrl?: string;
};

type GoalKickerPickerProps = {
  homeTeamId?: string;
  homeTeamName: string;
  awayTeamId?: string;
  awayTeamName: string;
  allPlayers: AflPlayer[];
  homeKickers: GoalKicker[];
  awayKickers: GoalKicker[];
  homeTaggedGoals: number;
  awayTaggedGoals: number;
  homeScoredGoals: number;
  awayScoredGoals: number;
  onAddKicker: (
    side: 'home' | 'away',
    player: {
      id?: string;
      name: string;
      photoUrl?: string;
    },
  ) => void;
  onIncGoal: (side: 'home' | 'away', kickerId: string) => void;
  onDecGoal: (side: 'home' | 'away', kickerId: string) => void;
  onRemoveKicker: (side: 'home' | 'away', kickerId: string) => void;
};

export function GoalKickerPicker({
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  allPlayers,
  homeKickers,
  awayKickers,
  homeTaggedGoals,
  awayTaggedGoals,
  homeScoredGoals,
  awayScoredGoals,
  onAddKicker,
  onIncGoal,
  onDecGoal,
  onRemoveKicker,
}: GoalKickerPickerProps) {
  const [activeSide, setActiveSide] = useState<'home' | 'away'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeTeamId = activeSide === 'home' ? homeTeamId : awayTeamId;
  const activeTeamName = activeSide === 'home' ? homeTeamName : awayTeamName;
  const activeKickers = activeSide === 'home' ? homeKickers : awayKickers;
  const activeTaggedGoals = activeSide === 'home' ? homeTaggedGoals : awayTaggedGoals;
  const activeScoredGoals = activeSide === 'home' ? homeScoredGoals : awayScoredGoals;
  const activeUnassignedGoals = Math.max(0, activeScoredGoals - activeTaggedGoals);

  const selectedIds = useMemo(() => new Set(activeKickers.map((k) => k.id)), [activeKickers]);

  const teamPlayers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allPlayers
      .filter((player) => {
        if (activeTeamId && player.teamId === activeTeamId) return true;
        return String(player.teamName || '').trim().toLowerCase() === activeTeamName.toLowerCase();
      })
      .filter((player) => !selectedIds.has(player.id))
      .filter((player) => (!query ? true : player.name.toLowerCase().includes(query)))
      .slice(0, 30);
  }, [activeTeamId, activeTeamName, allPlayers, searchQuery, selectedIds]);

  const handleAddFromSearch = () => {
    const nextName = searchQuery.trim();
    if (!nextName) return;
    onAddKicker(activeSide, { name: nextName });
    setSearchQuery('');
    searchInputRef.current?.blur();
  };

  return (
    <div className="kickerPicker">
      {/* Compact header with toggle + status */}
      <div className="kickerPicker__header">
        <h3 className="kickerPicker__title">Goal Kickers</h3>
        <p className="kickerPicker__subtitle">Tap a player to add, then use +/- to set goals.</p>
      </div>

      {/* Team toggle */}
      <div className="kickerPicker__toggle">
        <button
          type="button"
          className={`kickerPicker__toggleBtn ${activeSide === 'home' ? 'isActive' : ''}`}
          onClick={() => { setActiveSide('home'); setSearchQuery(''); }}
        >
          <span className="kickerPicker__toggleName">{homeTeamName}</span>
          <span className="kickerPicker__toggleBadge">
            {homeTaggedGoals}/{homeScoredGoals}
          </span>
        </button>
        <button
          type="button"
          className={`kickerPicker__toggleBtn ${activeSide === 'away' ? 'isActive' : ''}`}
          onClick={() => { setActiveSide('away'); setSearchQuery(''); }}
        >
          <span className="kickerPicker__toggleName">{awayTeamName}</span>
          <span className="kickerPicker__toggleBadge">
            {awayTaggedGoals}/{awayScoredGoals}
          </span>
        </button>
      </div>

      {/* Status hint */}
      <div className={`kickerPicker__activeHint ${activeUnassignedGoals > 0 ? 'isWarn' : 'isDone'}`}>
        {activeUnassignedGoals > 0
          ? `${activeUnassignedGoals} unassigned goal${activeUnassignedGoals === 1 ? '' : 's'} remaining`
          : 'All goals assigned'}
      </div>

      {/* Selected kickers — compact inline cards */}
      {activeKickers.length > 0 ? (
        <div className="kickerPicker__selectedRow">
          {[...activeKickers]
            .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
            .map((kicker) => (
              <div key={kicker.id} className="kickerSelected">
                <button
                  type="button"
                  className="kickerSelected__remove"
                  onClick={() => onRemoveKicker(activeSide, kicker.id)}
                  title="Remove"
                >
                  <X size={10} />
                </button>
                <span className="kickerSelected__goalBadge">{kicker.goals}</span>
                <div className="kickerSelected__avatar">
                  {kicker.photoUrl ? (
                    <img src={kicker.photoUrl} alt={kicker.name} />
                  ) : (
                    <User size={14} />
                  )}
                </div>
                <div className="kickerSelected__name">{kicker.name.split(' ').pop()}</div>
                <div className="kickerSelected__controls">
                  <button type="button" onClick={() => onDecGoal(activeSide, kicker.id)} className="kickerSelected__btn">
                    <Minus size={12} />
                  </button>
                  <button type="button" onClick={() => onIncGoal(activeSide, kicker.id)} className="kickerSelected__btn kickerSelected__btn--plus">
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      {/* Search */}
      <div className="kickerPicker__search">
        <Search size={16} />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={`Search ${activeTeamName} players…`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddFromSearch();
          }}
          style={{ fontSize: 16 }}
          enterKeyHint="done"
        />
        {searchQuery.trim() ? (
          <button type="button" className="kickerPicker__addBtn" onClick={handleAddFromSearch} title="Add kicker">
            <Plus size={14} /> Add
          </button>
        ) : null}
      </div>

      {/* Player chips — horizontal scroll on mobile */}
      {teamPlayers.length > 0 ? (
        <div className="kickerPicker__chipScroll">
          {teamPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="kickerChip"
              onClick={() => {
                onAddKicker(activeSide, { id: player.id, name: player.name, photoUrl: player.photoUrl });
                setSearchQuery('');
                searchInputRef.current?.blur();
              }}
            >
              <div className="kickerChip__avatar">
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt={player.name} />
                ) : (
                  <User size={14} />
                )}
              </div>
              <span className="kickerChip__name">{player.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {searchQuery.trim() && teamPlayers.length === 0 ? (
        <div className="kickerPicker__manualHint">
          No match found. Press Enter or tap Add to add &ldquo;{searchQuery.trim()}&rdquo; manually.
        </div>
      ) : null}

      {/* Summary */}
      {(activeKickers.length > 0 || activeUnassignedGoals > 0) ? (
        <div className="kickerPicker__summary">
          <div className="kickerPicker__summaryChips">
            {activeKickers.map((kicker) => (
              <span key={kicker.id} className="kickerPicker__summaryChip">
                {kicker.name} <strong>{kicker.goals}</strong>
              </span>
            ))}
            {activeUnassignedGoals > 0 ? (
              <span className="kickerPicker__summaryChip kickerPicker__summaryChip--warn">
                Unassigned <strong>{activeUnassignedGoals}</strong>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
