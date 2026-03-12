import React, { useMemo, useState } from 'react';
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

  const activeTeamId = activeSide === 'home' ? homeTeamId : awayTeamId;
  const activeTeamName = activeSide === 'home' ? homeTeamName : awayTeamName;
  const activeKickers = activeSide === 'home' ? homeKickers : awayKickers;
  const activeTaggedGoals = activeSide === 'home' ? homeTaggedGoals : awayTaggedGoals;
  const activeScoredGoals = activeSide === 'home' ? homeScoredGoals : awayScoredGoals;
  const activeUnassignedGoals = Math.max(0, activeScoredGoals - activeTaggedGoals);

  const teamPlayers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allPlayers
      .filter((player) => {
        if (activeTeamId && player.teamId === activeTeamId) return true;
        return String(player.teamName || '').trim().toLowerCase() === activeTeamName.toLowerCase();
      })
      .filter((player) => (!query ? true : player.name.toLowerCase().includes(query)))
      .slice(0, 20);
  }, [activeTeamId, activeTeamName, allPlayers, searchQuery]);

  const handleAddFromSearch = () => {
    const nextName = searchQuery.trim();
    if (!nextName) return;
    onAddKicker(activeSide, { name: nextName });
    setSearchQuery('');
  };

  function KickerRow({ kicker }: { kicker: GoalKicker }) {
    return (
      <div className="kickerRow">
        <div className="kickerRow__left">
          <div className="kickerRow__avatar">
            {kicker.photoUrl ? (
              <img src={kicker.photoUrl} alt={kicker.name} />
            ) : (
              <div className="kickerRow__avatarFallback">
                <User size={16} />
              </div>
            )}
          </div>
          <div className="kickerRow__info">
            <div className="kickerRow__name">{kicker.name}</div>
            <div className="kickerRow__goals">{kicker.goals} {kicker.goals === 1 ? 'goal' : 'goals'}</div>
          </div>
        </div>
        <div className="kickerRow__controls">
          <button type="button" className="kickerRow__btn" onClick={() => onDecGoal(activeSide, kicker.id)} title="Decrease goals">
            <Minus size={15} />
          </button>
          <span className="kickerRow__count">{kicker.goals}</span>
          <button type="button" className="kickerRow__btn" onClick={() => onIncGoal(activeSide, kicker.id)} title="Increase goals">
            <Plus size={15} />
          </button>
          <button type="button" className="kickerRow__remove" onClick={() => onRemoveKicker(activeSide, kicker.id)} title="Remove kicker">
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kickerPicker">
      <div className="kickerPicker__header">
        <div>
          <h3 className="kickerPicker__title">Goal Kickers</h3>
          <p className="kickerPicker__subtitle">Search linked players or add a manual name. Use + / - to keep the goal split accurate.</p>
        </div>

        <div className="kickerPicker__totals">
          <div className="kickerPicker__totalCard">
            <span className="kickerPicker__totalLabel">{homeTeamName}</span>
            <strong className="kickerPicker__totalValue">{homeTaggedGoals}</strong>
            <span className="kickerPicker__totalSub">{homeKickers.length} selected • {homeScoredGoals} scored</span>
          </div>
          <div className="kickerPicker__totalCard">
            <span className="kickerPicker__totalLabel">{awayTeamName}</span>
            <strong className="kickerPicker__totalValue">{awayTaggedGoals}</strong>
            <span className="kickerPicker__totalSub">{awayKickers.length} selected • {awayScoredGoals} scored</span>
          </div>
        </div>
      </div>

      <div className="kickerPicker__toggle">
        <button
          type="button"
          className={`kickerPicker__toggleBtn ${activeSide === 'home' ? 'isActive' : ''}`}
          onClick={() => {
            setActiveSide('home');
            setSearchQuery('');
          }}
        >
          {homeTeamName}
        </button>
        <button
          type="button"
          className={`kickerPicker__toggleBtn ${activeSide === 'away' ? 'isActive' : ''}`}
          onClick={() => {
            setActiveSide('away');
            setSearchQuery('');
          }}
        >
          {awayTeamName}
        </button>
      </div>

      <div className="kickerPicker__activeMeta">
        <div className="kickerPicker__activeTeam">{activeTeamName}</div>
        <div className={`kickerPicker__activeHint ${activeUnassignedGoals > 0 ? 'isWarn' : ''}`}>
          {activeUnassignedGoals > 0
            ? `${activeUnassignedGoals} unassigned goal${activeUnassignedGoals === 1 ? '' : 's'} remaining`
            : 'All entered goals are assigned'}
        </div>
      </div>

      <div className="kickerPicker__search">
        <Search size={18} />
        <input
          type="text"
          placeholder={`Search ${activeTeamName} players or add a name`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddFromSearch();
          }}
        />
        {searchQuery.trim() ? (
          <button type="button" className="kickerPicker__addBtn" onClick={handleAddFromSearch} title="Add kicker">
            <Plus size={16} /> Add Name
          </button>
        ) : null}
      </div>

      {teamPlayers.length > 0 ? (
        <div className="kickerPicker__chips">
          {teamPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="kickerPicker__chip"
              onClick={() => {
                onAddKicker(activeSide, { id: player.id, name: player.name, photoUrl: player.photoUrl });
                setSearchQuery('');
              }}
            >
              {player.photoUrl ? (
                <img src={player.photoUrl} alt={player.name} className="kickerPicker__chipAvatar" />
              ) : (
                <User size={12} />
              )}
              {player.name}
            </button>
          ))}
        </div>
      ) : null}

      {searchQuery.trim() && teamPlayers.length === 0 ? (
        <div className="kickerPicker__manualHint">No linked player match. Add “{searchQuery.trim()}” manually.</div>
      ) : null}

      <div className="kickerPicker__selected">
        {activeKickers.length === 0 ? (
          <div className="kickerPicker__empty">No goal kickers tagged yet for {activeTeamName}</div>
        ) : (
          <div className="kickerPicker__list">
            {[...activeKickers]
              .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
              .map((kicker) => (
                <KickerRow key={kicker.id} kicker={kicker} />
              ))}
          </div>
        )}
      </div>

      {activeKickers.length > 0 || activeUnassignedGoals > 0 ? (
        <div className="kickerPicker__summary">
          <div className="kickerPicker__summaryLabel">Current Split</div>
          <div className="kickerPicker__summaryChips">
            {activeKickers.map((kicker) => (
              <span key={kicker.id} className="kickerPicker__summaryChip">
                {kicker.name} <strong>{kicker.goals}g</strong>
              </span>
            ))}
            {activeUnassignedGoals > 0 ? (
              <span className="kickerPicker__summaryChip kickerPicker__summaryChip--warn">
                Unassigned <strong>{activeUnassignedGoals}g</strong>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
