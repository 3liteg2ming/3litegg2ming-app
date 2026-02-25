import React, { useState, useMemo } from 'react';
import { Search, Plus, Minus, X, User } from 'lucide-react';

interface GoalKicker {
  id: string;
  name: string;
  photoUrl?: string;
  goals: number;
}

interface AflPlayer {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  headshot_url?: string;
  photo_url?: string;
}

interface GoalKickerPickerProps {
  homeTeamId?: string;
  homeTeamName: string;
  awayTeamId?: string;
  awayTeamName: string;
  allPlayers: AflPlayer[];
  homeKickers: GoalKicker[];
  awayKickers: GoalKicker[];
  onAddKicker: (side: 'home' | 'away', playerName: string, playerId?: string) => void;
  onIncGoal: (side: 'home' | 'away', kickerId: string) => void;
  onDecGoal: (side: 'home' | 'away', kickerId: string) => void;
  onRemoveKicker: (side: 'home' | 'away', kickerId: string) => void;
}

export function GoalKickerPicker({
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  allPlayers,
  homeKickers,
  awayKickers,
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

  const teamPlayers = useMemo(() => {
    if (!activeTeamId) return [];
    return allPlayers
      .filter((p) => p.teamId === activeTeamId)
      .filter((p) =>
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 20);
  }, [allPlayers, activeTeamId, searchQuery]);

  const handleAddFromSearch = () => {
    if (searchQuery.trim()) {
      onAddKicker(activeSide, searchQuery.trim());
      setSearchQuery('');
    }
  };

  const KickerRow = ({ kicker }: { kicker: GoalKicker }) => (
    <div className="kickerRow">
      <div className="kickerRow__left">
        <div className="kickerRow__avatar">
          {kicker.photoUrl ? (
            <img src={kicker.photoUrl} alt={kicker.name} />
          ) : (
            <div className="kickerRow__avatarFallback">
              <User size={20} />
            </div>
          )}
        </div>
        <div className="kickerRow__info">
          <div className="kickerRow__name">{kicker.name}</div>
          <div className="kickerRow__goals">{kicker.goals} {kicker.goals === 1 ? 'goal' : 'goals'}</div>
        </div>
      </div>
      <div className="kickerRow__controls">
        <button
          type="button"
          className="kickerRow__btn"
          onClick={() => onDecGoal(activeSide, kicker.id)}
          title="Decrease goals"
        >
          <Minus size={16} />
        </button>
        <span className="kickerRow__count">{kicker.goals}</span>
        <button
          type="button"
          className="kickerRow__btn"
          onClick={() => onIncGoal(activeSide, kicker.id)}
          title="Increase goals"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="kickerRow__remove"
          onClick={() => onRemoveKicker(activeSide, kicker.id)}
          title="Remove"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="kickerPicker">
      <div className="kickerPicker__header">
        <h3 className="kickerPicker__title">Goal Kickers</h3>
        <p className="kickerPicker__subtitle">Tap to add, use +/- to adjust</p>
      </div>

      {/* Team toggle */}
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

      {/* Search and add */}
      <div className="kickerPicker__search">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search player…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddFromSearch();
          }}
        />
        {searchQuery.trim() && (
          <button
            type="button"
            className="kickerPicker__addBtn"
            onClick={handleAddFromSearch}
            title="Add player"
          >
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      {/* Player chips */}
      {teamPlayers.length > 0 && (
        <div className="kickerPicker__chips">
          {teamPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="kickerPicker__chip"
              onClick={() => {
                onAddKicker(activeSide, player.name, player.id);
                setSearchQuery('');
              }}
            >
              {player.photo_url || player.headshot_url ? (
                <img src={player.photo_url || player.headshot_url} alt={player.name} className="kickerPicker__chipAvatar" />
              ) : (
                <User size={12} />
              )}
              {player.name}
            </button>
          ))}
        </div>
      )}

      {/* Selected kickers */}
      <div className="kickerPicker__selected">
        {activeKickers.length === 0 ? (
          <div className="kickerPicker__empty">No goal kickers yet</div>
        ) : (
          <div className="kickerPicker__list">
            {[...activeKickers]
              .sort((a, b) => b.goals - a.goals)
              .map((kicker) => (
                <KickerRow key={kicker.id} kicker={kicker} />
              ))}
          </div>
        )}
      </div>

      {/* Summary chips */}
      {activeKickers.length > 0 && (
        <div className="kickerPicker__summary">
          <div className="kickerPicker__summaryLabel">Selected</div>
          <div className="kickerPicker__summaryChips">
            {activeKickers.map((k) => (
              <span key={k.id} className="kickerPicker__summaryChip">
                {k.name} <strong>{k.goals}g</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
