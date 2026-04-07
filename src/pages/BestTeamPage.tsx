import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Award, Star, Trophy, User, X, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import SmartImg from '../components/SmartImg';
import { useTeamOfTournament } from '../hooks/useTeamOfTournament';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../lib/teamAssets';
import { type TotPlayer, type TeamOfTournamentFieldRow, type TeamOfTournamentSpecialist } from '../lib/teamOfTournament';
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

function roleFull(group?: string) {
  switch (group) {
    case 'defenders': return 'Defender';
    case 'midfielders': return 'Midfielder';
    case 'rucks': return 'Ruck';
    case 'forwards': return 'Forward';
    default: return 'Player';
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

function teamShortName(player: TotPlayer | null | undefined) {
  if (!player) return '';
  return TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName;
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(' ');
  if (parts.length <= 1) return { first: '', last: name };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

type StatEntry = { label: string; value: number; highlight?: boolean };

function getPlayerStats(player: TotPlayer): StatEntry[] {
  const t = player.totals;
  const stats: StatEntry[] = [
    { label: 'Fantasy Pts', value: t.fantasyPoints, highlight: player.group === 'midfielders' || player.group === 'defenders' },
    { label: 'Disposals', value: t.disposals, highlight: player.group === 'midfielders' },
    { label: 'Goals', value: t.goals, highlight: player.group === 'forwards' },
    { label: 'Marks', value: t.marks, highlight: player.group === 'defenders' },
    { label: 'Tackles', value: t.tackles },
    { label: 'Hit Outs', value: t.hitOuts, highlight: player.group === 'rucks' },
  ];
  return stats.filter((s) => s.value > 0 || s.highlight);
}

function getSelectionReason(player: TotPlayer): string {
  const t = player.totals;
  switch (player.group) {
    case 'forwards':
      return `Selected as a key forward for ${t.goals} goals this season${t.marks > 0 ? `, backed by ${t.marks} marks` : ''}. Leading forward option based on goal output and overall impact.`;
    case 'defenders':
      return `Earned selection as a ${roleFull(player.group).toLowerCase()} with ${t.marks} marks and ${t.fantasyPoints} fantasy points. Reliable across the back line with strong ball use (${t.disposals} disposals).`;
    case 'midfielders':
      return `Picked in the midfield for ${t.disposals} disposals and ${t.fantasyPoints} fantasy points. A dominant ball-winner${t.tackles > 0 ? ` with ${t.tackles} tackles` : ''} driving the engine room.`;
    case 'rucks':
      return `Selected as the number one ruck for ${t.hitOuts} hit outs${t.disposals > 0 ? ` and ${t.disposals} disposals around the ground` : ''}. Dominant tap work and follow-up presence.`;
    default:
      return `Selected based on overall season stats including ${t.fantasyPoints} fantasy points.`;
  }
}

/* ── Player detail modal ── */
function PlayerModal({ player, slot, onClose }: { player: TotPlayer; slot: string; onClose: () => void }) {
  const logo = teamLogo(player.teamKey);
  const stats = getPlayerStats(player);
  const reason = getSelectionReason(player);
  const maxStat = Math.max(...stats.map((s) => s.value), 1);

  return (
    <motion.div
      className="bt-modal__backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className="bt-modal"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.97 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="bt-modal__close" onClick={onClose}>
          <X size={18} />
        </button>

        {/* Header */}
        <div className="bt-modal__header" style={{ ['--bt-accent' as string]: roleColor(player.group) }}>
          <div className="bt-modal__avatarWrap">
            <div className="bt-modal__avatar">
              {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={36} />}
            </div>
            {logo ? (
              <div className="bt-modal__clubBadge">
                <SmartImg src={logo} alt="" />
              </div>
            ) : null}
          </div>
          <div className="bt-modal__identity">
            <h3 className="bt-modal__name">{player.name}</h3>
            <div className="bt-modal__meta">
              <span className="bt-modal__roleTag" style={{ color: roleColor(player.group), borderColor: `${roleColor(player.group)}44` }}>
                {roleLabel(player.group)}
              </span>
              <span>{teamShortName(player)}</span>
              <span>{slot}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bt-modal__stats">
          <span className="bt-modal__sectionLabel">Season totals</span>
          <div className="bt-modal__statGrid">
            {stats.map((s) => (
              <div key={s.label} className={`bt-modal__statRow ${s.highlight ? 'is-highlight' : ''}`}>
                <span className="bt-modal__statLabel">{s.label}</span>
                <div className="bt-modal__statBarTrack">
                  <motion.div
                    className="bt-modal__statBarFill"
                    style={{ ['--bt-accent' as string]: s.highlight ? roleColor(player.group) : 'rgba(255,255,255,0.35)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (s.value / maxStat) * 100)}%` }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  />
                </div>
                <strong className={`bt-modal__statValue ${s.highlight ? 'is-highlight' : ''}`} style={s.highlight ? { color: roleColor(player.group) } : undefined}>
                  {s.value}
                </strong>
              </div>
            ))}
          </div>
        </div>

        {/* Why selected */}
        <div className="bt-modal__reason">
          <span className="bt-modal__sectionLabel">Why selected</span>
          <p>{reason}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Player card ── */
function PlayerCard({
  player,
  slot,
  delay = 0,
  onTap,
}: {
  player: TotPlayer | null;
  slot: string;
  delay?: number;
  onTap?: (player: TotPlayer, slot: string) => void;
}) {
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
  const logo = teamLogo(player.teamKey);
  const { first, last } = splitName(player.name);

  return (
    <motion.div
      className="bt-card"
      style={{ ['--bt-accent' as string]: roleColor(player.group) }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      onClick={() => onTap?.(player, slot)}
      role="button"
      tabIndex={0}
    >
      <div className="bt-card__top">
        <span className="bt-card__slot">{slot}</span>
        <span className="bt-card__role" style={{ color: roleColor(player.group) }}>{roleLabel(player.group)}</span>
      </div>

      <div className="bt-card__avatarWrap">
        <div className="bt-card__avatar">
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={22} />}
        </div>
        {logo ? (
          <div className="bt-card__clubBadge">
            <SmartImg src={logo} alt={player.teamKey} />
          </div>
        ) : null}
      </div>

      <div className="bt-card__info">
        {first ? <span className="bt-card__firstName">{first}</span> : null}
        <strong className="bt-card__lastName">{last}</strong>
        <span className="bt-card__club">{teamShortName(player)}</span>
      </div>

      <div className="bt-card__stat">
        <span className="bt-card__statVal">{st.val}</span>
        <span className="bt-card__statLabel">{st.short}</span>
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
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.24 }}
    >
      <div className="bt-specialist__head">
        <span className="bt-specialist__icon">{icon}</span>
        <span className="bt-specialist__title">{spec.label}</span>
      </div>
      <div className="bt-specialist__body">
        <div className="bt-specialist__avatar">
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={16} />}
        </div>
        <div className="bt-specialist__details">
          <strong>{player.name}</strong>
          <span className="bt-specialist__meta">
            {logo ? <SmartImg src={logo} alt="" className="bt-specialist__clubLogo" /> : null}
            {teamShortName(player)}
          </span>
        </div>
      </div>
      <div className="bt-specialist__stat">{st.val} {st.short}</div>
    </motion.div>
  );
}

function FieldRow({
  row,
  baseDelay,
  onTapPlayer,
}: {
  row: TeamOfTournamentFieldRow;
  baseDelay: number;
  onTapPlayer: (player: TotPlayer, slot: string) => void;
}) {
  return (
    <div className="bt-field__rowGroup">
      <div className="bt-field__rowLabel">{row.label}</div>
      <div className="bt-field__row">
        {row.players.map((player, i) => (
          <PlayerCard
            key={`${row.key}-${i}`}
            player={player}
            slot={row.slots[i]}
            delay={baseDelay + i * 0.03}
            onTap={onTapPlayer}
          />
        ))}
      </div>
    </div>
  );
}

export default function BestTeamPage() {
  const { data, isLoading } = useTeamOfTournament();
  const [modalPlayer, setModalPlayer] = useState<{ player: TotPlayer; slot: string } | null>(null);

  const openModal = (player: TotPlayer, slot: string) => setModalPlayer({ player, slot });
  const closeModal = () => setModalPlayer(null);

  const specialistIcons = useMemo(() => [
    <Trophy size={13} key="g" />,
    <Star size={13} key="d" />,
    <Zap size={13} key="f" />,
  ], []);

  const positionSpread = useMemo(() => {
    if (!data) return [] as Array<{ label: string; count: number; color: string }>;
    const all = [...data.fieldLayout.flatMap((row) => row.players).filter(Boolean), ...data.interchange] as TotPlayer[];
    return [
      { label: 'DEF', count: all.filter((p) => p.group === 'defenders').length, color: roleColor('defenders') },
      { label: 'MID', count: all.filter((p) => p.group === 'midfielders').length, color: roleColor('midfielders') },
      { label: 'RUC', count: all.filter((p) => p.group === 'rucks').length, color: roleColor('rucks') },
      { label: 'FWD', count: all.filter((p) => p.group === 'forwards').length, color: roleColor('forwards') },
    ];
  }, [data]);

  const clubSpread = useMemo(() => {
    if (!data) return [] as Array<{ key: string; count: number; label: string; logo: string }>;
    const counts = new Map<string, number>();
    [...data.fieldLayout.flatMap((row) => row.players).filter(Boolean), ...data.interchange].forEach((player) => {
      const p = player as TotPlayer;
      counts.set(p.teamKey, (counts.get(p.teamKey) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([teamKey, count]) => ({
        key: teamKey,
        count,
        label: TEAM_ASSETS[teamKey as TeamKey]?.shortName || teamKey,
        logo: teamLogo(teamKey),
      }));
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="bt-page">
        <main className="bt-page__inner">
          <div className="bt-topBar">
            <Link to="/" className="bt-back"><ArrowLeft size={14} /> Back home</Link>
          </div>
          <section className="bt-hero bt-hero--loading">
            <h1>{isLoading ? 'Loading Best 23...' : 'Best 23 — Coming Soon'}</h1>
            <p>{isLoading ? 'Fetching the latest stats...' : 'Check back soon!'}</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bt-page">
      <main className="bt-page__inner">

        <div className="bt-topBar">
          <Link to="/" className="bt-back"><ArrowLeft size={14} /> Back home</Link>
        </div>

        <section className="bt-hero">
          <span className="bt-eyebrow">AFL 26 honour side</span>
          <h1>Best 23</h1>
          <p className="bt-hero__sub">
            Round {data.selectionRound} selection based on live season stats and official AFL player positions.
          </p>
          <div className="bt-hero__infoRow">
            <div className="bt-infoPill">
              <span className="bt-infoPill__label">Round</span>
              <strong>{data.selectionRound}</strong>
            </div>
            {positionSpread.map((item) => (
              <div key={item.label} className="bt-infoPill" style={{ ['--bt-accent' as string]: item.color }}>
                <span className="bt-infoPill__label" style={{ color: item.color }}>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>

        {clubSpread.length > 0 && (
          <section className="bt-clubs">
            <span className="bt-eyebrow">Most represented clubs</span>
            <div className="bt-clubs__grid">
              {clubSpread.map((club) => (
                <div key={club.key} className="bt-clubChip">
                  {club.logo ? <SmartImg src={club.logo} alt="" className="bt-clubChip__logo" /> : null}
                  <span className="bt-clubChip__name">{club.label}</span>
                  <span className="bt-clubChip__count">{club.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.specialists.length > 0 && (
          <div className="bt-specialists">
            {data.specialists.map((spec, i) => (
              <SpecialistCard key={spec.key} spec={spec} icon={specialistIcons[i]} />
            ))}
          </div>
        )}

        <section className="bt-fieldSection">
          <div className="bt-sectionHead">
            <div>
              <span className="bt-eyebrow">On field</span>
              <h2>Starting 18</h2>
            </div>
            <span className="bt-sectionHead__note">Tap a player for stats</span>
          </div>

          <div className="bt-field">
            <div className="bt-field__surface">
              {data.fieldLayout.map((row, ri) => (
                <FieldRow key={row.key} row={row} baseDelay={ri * 0.05} onTapPlayer={openModal} />
              ))}
            </div>
          </div>
        </section>

        <section className="bt-benchSection">
          <div className="bt-sectionHead">
            <div>
              <span className="bt-eyebrow">Depth</span>
              <h2>Interchange</h2>
            </div>
            <span className="bt-sectionHead__note">{data.interchange.length}/5</span>
          </div>
          <div className="bt-bench__grid">
            {data.interchange.map((player, i) => (
              <PlayerCard key={player.id} player={player} slot={`INT ${i + 1}`} delay={i * 0.04} onTap={openModal} />
            ))}
          </div>
        </section>

        <div className="bt-footnote">
          <Award size={12} />
          <span>Selected from live game stats with official-position eligibility.</span>
        </div>

        <div className="safeBottom" />
      </main>

      <AnimatePresence>
        {modalPlayer && (
          <PlayerModal
            player={modalPlayer.player}
            slot={modalPlayer.slot}
            onClose={closeModal}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
