import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, User, Star, Award, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

import SmartImg from '../components/SmartImg';
import { useTeamOfTournament } from '../hooks/useTeamOfTournament';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../lib/teamAssets';
import { TEAM_OF_TOURNAMENT_FIELD_ROWS, type TotPlayer, type TeamOfTournamentFieldRow, type TeamOfTournamentSpecialist } from '../lib/teamOfTournament';
import '../styles/best-team-page.css';

function roleColor(group?: string) {
  switch (group) {
    case 'defenders': return '#63a9ff';
    case 'midfielders': return '#f2c450';
    case 'rucks': return '#c58cff';
    case 'forwards': return '#ff9d59';
    default: return '#90a5c8';
  }
}

function roleLabel(group?: string) {
  switch (group) {
    case 'defenders': return 'DEF';
    case 'midfielders': return 'MID';
    case 'rucks': return 'RUC';
    case 'forwards': return 'FWD';
    default: return '';
  }
}

function statTag(player: TotPlayer) {
  const label = String(player.statLabel || '').toLowerCase();
  if (label.includes('fantasy')) return { short: 'FPTS', val: player.statValue };
  if (label.includes('disposal')) return { short: 'DISP', val: player.statValue };
  if (label.includes('mark')) return { short: 'MRK', val: player.statValue };
  if (label.includes('goal')) return { short: 'GLS', val: player.statValue };
  if (label.includes('hit')) return { short: 'HO', val: player.statValue };
  if (label.includes('tackle')) return { short: 'TKL', val: player.statValue };
  return { short: String(player.statLabel).toUpperCase().slice(0, 4), val: player.statValue };
}

function teamLogo(teamKey: string) {
  const t = TEAM_ASSETS[teamKey as TeamKey];
  return t ? assetUrl(t.logoFile ?? '') : '';
}

function PlayerCard({ player, slot, delay = 0 }: { player: TotPlayer | null; slot: string; delay?: number }) {
  if (!player) {
    return (
      <div className="bt-card bt-card--empty">
        <span className="bt-card__slot">{slot}</span>
        <div className="bt-card__avatar"><User size={20} /></div>
        <span className="bt-card__emptyLabel">TBD</span>
      </div>
    );
  }

  const st = statTag(player);
  const firstName = player.name.split(' ').slice(0, -1).join(' ');
  const lastName = player.name.split(' ').slice(-1)[0];
  const logo = teamLogo(player.teamKey);

  return (
    <motion.div
      className={`bt-card bt-card--${player.group}`}
      style={{ ['--bt-accent' as string]: roleColor(player.group) }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <span className="bt-card__slot">{slot}</span>
      <div className="bt-card__avatarWrap">
        <div className="bt-card__avatar">
          {player.photoUrl
            ? <img src={player.photoUrl} alt={player.name} />
            : <User size={22} />}
        </div>
        {logo && (
          <div className="bt-card__clubBadge">
            <SmartImg src={logo} alt={player.teamKey} />
          </div>
        )}
      </div>
      <div className="bt-card__info">
        <span className="bt-card__firstName">{firstName}</span>
        <strong className="bt-card__lastName">{lastName}</strong>
      </div>
      <div className="bt-card__tagRow">
        <span className="bt-card__position" style={{ color: roleColor(player.group) }}>{roleLabel(player.group)}</span>
        <span className="bt-card__stat">{st.val} {st.short}</span>
      </div>
    </motion.div>
  );
}

function SpecialistCard({ spec, icon }: { spec: TeamOfTournamentSpecialist; icon: React.ReactNode }) {
  const player = spec.player;
  if (!player) return null;
  const st = statTag(player);
  const logo = teamLogo(player.teamKey);

  return (
    <motion.div
      className="bt-specialist"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bt-specialist__icon">{icon}</div>
      <span className="bt-specialist__label">{spec.label}</span>
      <div className="bt-specialist__playerRow">
        <div className="bt-specialist__avatar">
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={16} />}
        </div>
        <div>
          <div className="bt-specialist__player">{player.name}</div>
          <div className="bt-specialist__meta">
            {logo && <SmartImg src={logo} alt="" className="bt-specialist__clubIcon" />}
            {TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName}
          </div>
        </div>
      </div>
      <div className="bt-specialist__value">{st.val} {st.short}</div>
      <span className="bt-specialist__sub">{spec.subtitle}</span>
    </motion.div>
  );
}

function FieldRow({ row, baseDelay }: { row: TeamOfTournamentFieldRow; baseDelay: number }) {
  return (
    <div className="bt-oval__rowGroup">
      <div className="bt-oval__rowLabel">{row.label}</div>
      <div className="bt-oval__row">
        {row.players.map((player, i) => (
          <PlayerCard
            key={`${row.key}-${i}`}
            player={player}
            slot={row.slots[i]}
            delay={baseDelay + i * 0.04}
          />
        ))}
      </div>
    </div>
  );
}

export default function BestTeamPage() {
  const { data, isLoading } = useTeamOfTournament();

  const specialistIcons = useMemo(() => [
    <Trophy size={16} key="g" />,
    <Star size={16} key="d" />,
    <Zap size={16} key="f" />,
  ], []);

  if (isLoading || !data) {
    return (
      <div className="bt-page">
        <main className="bt-page__inner">
          <section className="bt-hero bt-hero--loading">
            <Link to="/" className="bt-backLink"><ArrowLeft size={16} /> Back home</Link>
            <span className="bt-hero__eyebrow">AFL 26 honour side</span>
            <h1>{isLoading ? 'Loading Best 23…' : 'Best 23 — Coming Soon'}</h1>
            <p>{isLoading ? 'Fetching the latest stats and selections…' : 'The Best 23 team selection is still being finalised. Check back soon!'}</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bt-page">
      <main className="bt-page__inner">
        {/* Hero */}
        <section className="bt-hero">
          <Link to="/" className="bt-backLink"><ArrowLeft size={16} /> Back home</Link>
          <div className="bt-hero__header">
            <span className="bt-hero__eyebrow">AFL 26 honour side</span>
            <h1>Best 23</h1>
            <p className="bt-hero__sub">Round {data.selectionRound} selection</p>
          </div>
          <div className="bt-hero__chips">
            <span className="bt-chip"><Award size={10} /> 18 on field</span>
            <span className="bt-chip">5 interchange</span>
            <span className="bt-chip">Auto-selected from stats</span>
          </div>
        </section>

        {/* Specialists */}
        {data.specialists.length > 0 && (
          <div className="bt-specialists">
            {data.specialists.map((spec, i) => (
              <SpecialistCard key={spec.key} spec={spec} icon={specialistIcons[i]} />
            ))}
          </div>
        )}

        {/* Field */}
        <section className="bt-field-section">
          <div className="bt-section-header">
            <div>
              <span className="bt-section-header__kicker">On field</span>
              <h2>Starting 18</h2>
            </div>
            <span className="bt-section-header__note">Tap for details</span>
          </div>

          <div className="bt-oval">
            <div className="bt-oval__surface">
              {data.fieldLayout.map((row, ri) => (
                <FieldRow key={row.key} row={row} baseDelay={ri * 0.08} />
              ))}
            </div>
          </div>
        </section>

        {/* Interchange */}
        <section className="bt-bench-section">
          <div className="bt-section-header">
            <div>
              <span className="bt-section-header__kicker">Depth</span>
              <h2>Interchange</h2>
            </div>
            <div className="bt-bench__headerRight">
              <span className="bt-bench__meta">{data.interchange.length}/5 selected</span>
            </div>
          </div>
          <div className="bt-bench__grid">
            {data.interchange.map((player, i) => (
              <PlayerCard key={player.id} player={player} slot={`INT ${i + 1}`} delay={i * 0.06} />
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="bt-footnote">
          <Award size={14} />
          <span>Selected from live game stats • Entertainment only</span>
        </div>

        <div className="safeBottom" />
      </main>
    </div>
  );
}
