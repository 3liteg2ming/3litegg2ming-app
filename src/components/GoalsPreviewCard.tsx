import { motion } from 'framer-motion';
import SmartImg from './SmartImg';
import { assetUrl } from '../lib/teamAssets';
import '../styles/goalsPreview.css';

export type GoalsLeader = {
  goals: number;
  name: string;
  team: string;
  headshotUrl?: string;
};

export type GoalsRow = {
  rank: number;
  goals: number;
  name: string;
  team: string;
  avatarUrl?: string;
};

export default function GoalsPreviewCard({
  leader,
  rows,
  onFull,
}: {
  leader: GoalsLeader;
  rows: GoalsRow[];
  onFull?: () => void;
}) {
  return (
    <div className="gp-card">
      <div className="gp-topbar">
        <div className="gp-topTitle">GOALS</div>
        <button className="gp-full" type="button" onClick={onFull}>
          Full <span className="gp-arrow">›</span>
        </button>
      </div>

      <div className="gp-hero">
        <div className="gp-left">
          <div className="gp-big">{leader.goals}</div>
          <div className="gp-name" title={leader.name}>{leader.name}</div>
          <div className="gp-team">{leader.team}</div>
        </div>

        <div className="gp-headshotWrap">
          <SmartImg
            className="gp-headshot"
            src={assetUrl(leader.headshotUrl ?? 'elite-gaming-logo.png')}
            alt={leader.name}
            fallbackText="EG"
          />
        </div>
      </div>

      <div className="gp-list">
        {rows.map((r) => (
          <motion.div
            key={r.rank}
            className="gp-row"
            whileTap={{ scale: 0.992 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
          >
            <div className="gp-rank">{r.rank}</div>

            <div className="gp-player">
              <div className="gp-avatarRing">
                <SmartImg
                  className="gp-avatar"
                  src={assetUrl(r.avatarUrl ?? 'elite-gaming-logo.png')}
                  alt={r.name}
                  fallbackText={r.name.slice(0, 1)}
                />
              </div>
              <div className="gp-text">
                <div className="gp-pName">{r.name}</div>
                <div className="gp-pTeam">{r.team}</div>
              </div>
            </div>

            <div className="gp-goals">{r.goals}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
