import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Award, Shield, Star, Trophy, User, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

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
  if (!player) return 'Club';
  return TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName;
}

function PlayerCard({ player, slot, delay = 0 }: { player: TotPlayer | null; slot: string; delay?: number }) {
  if (!player) {
    return (
      <div className="bt-card bt-card--empty">
        <span className="bt-card__slot">{slot}</span>
        <div className="bt-card__avatar"><User size={18} /></div>
        <span className="bt-card__emptyLabel">TBD</span>
      </div>
    );
  }

  const st = statTag(player);
  const logo = teamLogo(player.teamKey);

  return (
    <motion.div
      className={`bt-card bt-card--${player.group}`}
      style={{ ['--bt-accent' as string]: roleColor(player.group) }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay }}
    >
      <div className="bt-card__top">
        <span className="bt-card__slot">{slot}</span>
        <span className="bt-card__position" style={{ color: roleColor(player.group) }}>{roleLabel(player.group)}</span>
      </div>

      <div className="bt-card__avatarWrap">
        <div className="bt-card__avatar">
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={20} />}
        </div>
        {logo ? (
          <div className="bt-card__clubBadge">
            <SmartImg src={logo} alt={player.teamKey} />
          </div>
        ) : null}
      </div>

      <div className="bt-card__info">
        <strong className="bt-card__name">{player.name}</strong>
        <span className="bt-card__club">{teamShortName(player)}</span>
      </div>

      <div className="bt-card__footer">
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
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28 }}
    >
      <div className="bt-specialist__icon">{icon}</div>
      <div className="bt-specialist__label">{spec.label}</div>
      <div className="bt-specialist__playerRow">
        <div className="bt-specialist__avatar">
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={15} />}
        </div>
        <div className="bt-specialist__playerInfo">
          <div className="bt-specialist__player">{player.name}</div>
          <div className="bt-specialist__meta">
            {logo ? <SmartImg src={logo} alt="" className="bt-specialist__clubIcon" /> : null}
            {teamShortName(player)}
          </div>
        </div>
      </div>
      <div className="bt-specialist__value">{st.val} {st.short}</div>
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
            delay={baseDelay + i * 0.035}
          />
        ))}
      </div>
    </div>
  );
}

export default function BestTeamPage() {
  const { data, isLoading } = useTeamOfTournament();

  const specialistIcons = useMemo(() => [
    <Trophy size={14} key="g" />,
    <Star size={14} key="d" />,
    <Zap size={14} key="f" />,
  ], []);

  const positionSpread = useMemo(() => {
    if (!data) return [] as Array<{ label: string; count: number; color: string }>;
    const all = [...data.fieldLayout.flatMap((row) => row.players).filter(Boolean), ...data.interchange] as TotPlayer[];
    return [
      { label: 'DEF', count: all.filter((player) => player.group === 'defenders').length, color: roleColor('defenders') },
      { label: 'MID', count: all.filter((player) => player.group === 'midfielders').length, color: roleColor('midfielders') },
      { label: 'RUC', count: all.filter((player) => player.group === 'rucks').length, color: roleColor('rucks') },
      { label: 'FWD', count: all.filter((player) => player.group === 'forwards').length, color: roleColor('forwards') },
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
          <section className="bt-hero bt-hero--loading">
            <Link to="/" className="bt-backLink"><ArrowLeft size={15} /> Back home</Link>
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
        <section className="bt-hero">
          <Link to="/" className="bt-backLink"><ArrowLeft size={15} /> Back home</Link>
          <div className="bt-hero__header">
            <span className="bt-hero__eyebrow">AFL 26 honour side</span>
            <h1>Best 23</h1>
            <p className="bt-hero__sub">Round {data.selectionRound} selection based on live season stats and official AFL player positions.</p>
          </div>
          <div className="bt-hero__chips">
            <span className="bt-chip"><Award size={10} /> 18 on field</span>
            <span className="bt-chip"><Shield size={10} /> 5 interchange</span>
            <span className="bt-chip">Position locked</span>
          </div>
          <div className="bt-hero__miniGrid">
            <div className="bt-miniPanel">
              <span className="bt-miniPanel__label">Selection build</span>
              <strong>Round {data.selectionRound}</strong>
              <small>{data.completedRounds} completed rounds</small>
            </div>
            <div className="bt-miniPanel">
              <span className="bt-miniPanel__label">Position spread</span>
              <div className="bt-tokenRow">
                {positionSpread.map((item) => (
                  <span key={item.label} className="bt-token" style={{ ['--bt-accent' as string]: item.color }}>
                    <b>{item.label}</b>
                    <span>{item.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {clubSpread.length > 0 && (
          <section className="bt-spreadCard">
            <div className="bt-section-header">
              <div>
                <span className="bt-section-header__kicker">Club spread</span>
                <h2>Most represented clubs</h2>
              </div>
            </div>
            <div className="bt-clubSpread">
              {clubSpread.map((club) => (
                <div key={club.key} className="bt-clubChip">
                  <div className="bt-clubChip__left">
                    {club.logo ? <SmartImg src={club.logo} alt="" className="bt-clubChip__logo" /> : null}
                    <span>{club.label}</span>
                  </div>
                  <b>{club.count} selected</b>
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

        <section className="bt-field-section">
          <div className="bt-section-header">
            <div>
              <span className="bt-section-header__kicker">On field</span>
              <h2>Starting 18</h2>
            </div>
            <span className="bt-section-header__note">AFL-style line by line selection</span>
          </div>

          <div className="bt-oval">
            <div className="bt-oval__surface">
              {data.fieldLayout.map((row, ri) => (
                <FieldRow key={row.key} row={row} baseDelay={ri * 0.06} />
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
              <span className="bt-bench__meta">{data.interchange.length}/5 selected</span>
            </div>
          </div>
          <div className="bt-bench__grid">
            {data.interchange.map((player, i) => (
              <PlayerCard key={player.id} player={player} slot={`INT ${i + 1}`} delay={i * 0.05} />
            ))}
          </div>
        </section>

        <div className="bt-footnote">
          <Award size={14} />
          <span>Selected from live game stats with official-position eligibility.</span>
        </div>

        <div className="safeBottom" />
      </main>
    </div>
  );
}
