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

  const handlePlayerTap = (player: AflPlayer) => {
    onAddKicker(activeSide, { id: player.id, name: player.name, photoUrl: player.photoUrl });
    // Only clear search text — don't blur keyboard so coach can keep searching for next scorer
    if (searchQuery.trim()) {
      setSearchQuery('');
    }
  };

  return (
    <div className="kp">
      {/* Team toggle */}
      <div className="kp__toggle">
        <button
          type="button"
          className={`kp__toggleBtn ${activeSide === 'home' ? 'is-active' : ''}`}
          onClick={() => { setActiveSide('home'); setSearchQuery(''); }}
        >
          <span className="kp__toggleName">{homeTeamName}</span>
          <span className="kp__toggleBadge">
            {homeTaggedGoals}/{homeScoredGoals}
          </span>
        </button>
        <button
          type="button"
          className={`kp__toggleBtn ${activeSide === 'away' ? 'is-active' : ''}`}
          onClick={() => { setActiveSide('away'); setSearchQuery(''); }}
        >
          <span className="kp__toggleName">{awayTeamName}</span>
          <span className="kp__toggleBadge">
            {awayTaggedGoals}/{awayScoredGoals}
          </span>
        </button>
      </div>

      {/* Status bar */}
      <div className={`kp__status ${activeScoredGoals === 0 && activeKickers.length === 0 ? 'is-neutral' : activeUnassignedGoals > 0 ? 'is-warn' : 'is-done'}`}>
        {activeScoredGoals === 0 && activeKickers.length === 0
          ? 'Enter final score first to assign goal kickers'
          : activeUnassignedGoals > 0
            ? `${activeUnassignedGoals} goal${activeUnassignedGoals === 1 ? '' : 's'} remaining`
            : 'All goals assigned'}
      </div>

      {/* Selected kickers — vertical stacked cards */}
      {activeKickers.length > 0 && (
        <div className="kp__selected">
          {[...activeKickers]
            .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
            .map((kicker) => (
              <div key={kicker.id} className="kpKicker">
                <div className="kpKicker__avatar">
                  {kicker.photoUrl ? (
                    <img src={kicker.photoUrl} alt={kicker.name} />
                  ) : (
                    <User size={18} />
                  )}
                </div>
                <div className="kpKicker__info">
                  <div className="kpKicker__name">{kicker.name}</div>
                  <div className="kpKicker__goalLabel">{kicker.goals} goal{kicker.goals !== 1 ? 's' : ''}</div>
                </div>
                <div className="kpKicker__controls">
                  <button type="button" className="kpKicker__btn kpKicker__btn--dec" onClick={() => onDecGoal(activeSide, kicker.id)}>
                    <Minus size={16} />
                  </button>
                  <span className="kpKicker__count">{kicker.goals}</span>
                  <button type="button" className="kpKicker__btn kpKicker__btn--inc" onClick={() => onIncGoal(activeSide, kicker.id)}>
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  className="kpKicker__remove"
                  onClick={() => onRemoveKicker(activeSide, kicker.id)}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Search */}
      <div className="kp__search">
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
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery.trim() ? (
          <button type="button" className="kp__addBtn" onClick={handleAddFromSearch} title="Add kicker">
            <Plus size={14} /> Add
          </button>
        ) : null}
      </div>

      {/* Available players — vertical scrollable list */}
      {teamPlayers.length > 0 && (
        <div className="kp__playerSection">
          <div className="kp__playerLabel">
            {searchQuery.trim() ? `${teamPlayers.length} result${teamPlayers.length !== 1 ? 's' : ''}` : 'Available players'}
          </div>
          <div className="kp__playerList">
            {teamPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                className="kpPlayer"
                onClick={() => handlePlayerTap(player)}
              >
                <div className="kpPlayer__avatar">
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt={player.name} />
                  ) : (
                    <User size={16} />
                  )}
                </div>
                <span className="kpPlayer__name">{player.name}</span>
                <span className="kpPlayer__action"><Plus size={14} /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searchQuery.trim() && teamPlayers.length === 0 && (
        <div className="kp__manualHint">
          No match found. Press Enter or tap Add to add &ldquo;{searchQuery.trim()}&rdquo; manually.
        </div>
      )}

      {!searchQuery.trim() && teamPlayers.length === 0 && allPlayers.length === 0 && (
        <div className="kp__manualHint">
          Loading players… You can also type a name above and tap Add.
        </div>
      )}
    </div>
  );
}
