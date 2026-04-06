import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Shield, Star, Trophy, User } from 'lucide-react';

import { getTeamOfTournamentClubSelections, useTeamOfTournament } from '../hooks/useTeamOfTournament';
import { useAuth } from '../state/auth/AuthProvider';

import '../styles/best-team-page.css';

type TotPlayer = import('../lib/teamOfTournament').TotPlayer;

function compactStatLabel(label: string) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('fantasy')) return 'FPTS';
  if (normalized.includes('disposal')) return 'DISP';
  if (normalized.includes('mark')) return 'MARKS';
  if (normalized.includes('goal')) return 'GOALS';
  if (normalized.includes('hit out')) return 'HO';
  if (normalized.includes('tackle')) return 'TKL';
  return String(label || '').toUpperCase();
}

function PlayerCard({
  player,
  slot,
  benchIndex,
  onSelect,
  variant = 'field',
}: {
  player: TotPlayer | null;
  slot: string;
  benchIndex?: number;
  onSelect: (playerId: string) => void;
  variant?: 'field' | 'bench';
}) {
  if (!player) {
    return (
      <div className={`bt-card bt-card--empty bt-card--${variant}`}>
        <span className="bt-card__slot">{slot}</span>
        <div className="bt-card__avatarWrap">
          <div className="bt-card__avatar">
            <User size={18} />
          </div>
        </div>
        <span className="bt-card__emptyLabel">TBD</span>
      </div>
    );
  }

  const displaySlot = benchIndex ? `INT ${benchIndex}` : slot;
  const lastName = player.name.split(' ').slice(-1)[0];
  const firstName = player.name.split(' ').slice(0, -1).join(' ');

  return (
    <button type="button" className={`bt-card bt-card--${player.group} bt-card--${variant}`} onClick={() => onSelect(player.id)}>
      <span className="bt-card__slot">{displaySlot}</span>
      <div className="bt-card__avatarWrap">
        <div className="bt-card__avatar">{player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={18} />}</div>
        <div className="bt-card__clubBadge">{player.teamLogoUrl ? <img src={player.teamLogoUrl} alt={player.teamName} /> : <Shield size={14} />}</div>
      </div>
      <div className="bt-card__info">
        {variant === 'bench' ? (
          <strong className="bt-card__name">{player.name}</strong>
        ) : (
          <>
            <span className="bt-card__firstName">{firstName}</span>
            <strong className="bt-card__lastName">{lastName}</strong>
          </>
        )}
        <span className="bt-card__team">{player.teamName}</span>
        <span className="bt-card__position">{player.position}</span>
      </div>
      <span className="bt-card__stat">
        <strong>{player.statValue}</strong> <span>{compactStatLabel(player.statLabel)}</span>
      </span>
    </button>
  );
}

export default function BestTeamPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: honorTeam, isLoading } = useTeamOfTournament();

  const honorRound = honorTeam?.selectionRound || honorTeam?.completedRounds || 0;
  const clubSelections = getTeamOfTournamentClubSelections(honorTeam, { teamKey: user?.teamKey, teamName: user?.teamName });
  const teamLabel = user?.teamName || 'your club';

  // Feature not yet complete — show coming-soon gate
  return (
    <div className="bt-page">
      <main className="bt-page__inner">
        <section className="bt-hero">
          <Link to="/" className="bt-backLink">
            <ArrowLeft size={16} />
            Back home
          </Link>
          <span className="bt-hero__eyebrow">AFL 26 honour side</span>
          <h1>Best 23 — Coming Soon</h1>
          <p>The Best 23 team selection is still being finalised. Check back soon!</p>
        </section>
      </main>
    </div>
  );

  if (isLoading && !honorTeam) {
    return (
      <div className="bt-page">
        <main className="bt-page__inner">
          <section className="bt-hero bt-hero--loading">
            <span className="bt-hero__eyebrow">Loading honour side</span>
            <h1>Best 23 is building.</h1>
            <p>Pulling the latest corrected position pools and season leaders now.</p>
          </section>
        </main>
      </div>
    );
  }

  if (!honorTeam || honorRound < 4) {
    return (
      <div className="bt-page">
        <main className="bt-page__inner">
          <section className="bt-hero">
            <Link to="/" className="bt-backLink">
              <ArrowLeft size={16} />
              Back home
            </Link>
            <span className="bt-hero__eyebrow">AFL 26 honour side</span>
            <h1>Best 23 unlocks after Round 4.</h1>
            <p>The honour side opens once enough completed rounds are in the books to make the selection meaningful.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bt-page">
      <main className="bt-page__inner">
        <section className="bt-hero">
          <Link to="/" className="bt-backLink">
            <ArrowLeft size={16} />
            Back home
          </Link>

          <div className="bt-hero__header">
            <span className="bt-hero__eyebrow">AFL 26 honour side</span>
            <h1>Best 23</h1>
            <p className="bt-hero__sub">After Round {honorRound}</p>
          </div>

          <div className="bt-hero__chips">
            <span className="bt-chip">Round {honorRound}</span>
            <span className="bt-chip">18 on field</span>
            <span className="bt-chip">5 interchange</span>
          </div>

          <div className="bt-specialists">
            {honorTeam.specialists.map((item) => {
              const player = item.player;
              return (
                <button
                  key={item.key}
                  type="button"
                  className="bt-specialist"
                  disabled={!player}
                  onClick={player ? () => navigate(`/player/${player.id}`) : undefined}
                >
                  <span className="bt-specialist__label">{item.label}</span>
                  {player ? (
                    <>
                      <strong className="bt-specialist__value">{player.statValue}</strong>
                      <span className="bt-specialist__player">{player.name}</span>
                      <span className="bt-specialist__meta">{compactStatLabel(player.statLabel)}</span>
                    </>
                  ) : (
                    <span className="bt-specialist__meta">{item.subtitle}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className={`bt-watch ${clubSelections.length ? 'is-hit' : ''}`}>
          <div>
            <span className="bt-watch__kicker">Coach watch</span>
            <p className="bt-watch__text">
              {clubSelections.length
                ? `${clubSelections.length} ${teamLabel} player${clubSelections.length === 1 ? '' : 's'} in the side through Round ${honorRound}.`
                : `No ${teamLabel} players have cracked the side through Round ${honorRound} yet.`}
            </p>
          </div>
          <Link to="/members" className="bt-watch__link">
            View Coach Hub
            <ArrowRight size={15} />
          </Link>
        </section>

        <section className="bt-field-section">
          <div className="bt-section-header">
            <div>
              <span className="bt-section-header__kicker">Team sheet</span>
              <h2>On-field 18</h2>
            </div>
            <span className="bt-section-header__note">Tap any player for their profile</span>
          </div>

          <div className="bt-oval">
            <div className="bt-oval__surface">
              {honorTeam.fieldLayout.map((row) => (
                <div key={row.key} className="bt-oval__rowGroup">
                  <span className="bt-oval__rowLabel">{row.label}</span>
                  <div className="bt-oval__row">
                    {row.players.map((player, index) => (
                      <PlayerCard
                        key={`${row.key}-${index}-${player?.id || 'empty'}`}
                        player={player}
                        slot={row.slots[index]}
                        onSelect={(playerId) => navigate(`/player/${playerId}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bt-bench-section">
          <div className="bt-section-header">
            <div>
              <span className="bt-section-header__kicker">Depth</span>
              <h2>Interchange</h2>
            </div>
            <div className="bt-bench__headerRight">
              <span className="bt-bench__meta">5-player bench</span>
              <Link to="/stats" className="bt-bench__statsLink">
                Stats Hub
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          <div className="bt-bench__grid">
            {honorTeam.interchange.map((player, index) => (
              <PlayerCard
                key={`${player.id}-${index}`}
                player={player}
                slot="INT"
                benchIndex={index + 1}
                variant="bench"
                onSelect={(playerId) => navigate(`/player/${playerId}`)}
              />
            ))}
          </div>
        </section>

        <section className="bt-footnote">
          <Star size={14} />
          <span>Best 23 is built from the live Elite Gaming season leaders and corrected player position pools.</span>
          <Trophy size={14} />
        </section>
      </main>
    </div>
  );
}
