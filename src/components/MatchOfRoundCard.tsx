import { motion } from 'framer-motion';
import '../styles/matchups.css';

export type MatchOfRound = {
  label: string;
  statusPill: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: number;
  awayScore: number;
  clockText?: string;
  homeColor: string;
  awayColor: string;
};

export default function MatchOfRoundCard({ m }: { m: MatchOfRound }) {
  return (
    <motion.div
      className="mor-card"
      style={{
        background: `linear-gradient(135deg, ${m.homeColor} 0%, ${m.awayColor} 100%)`,
      }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
    >
      <div className="mor-glass" />

      <div className="mor-top">
        <div className="mor-title">{m.label}</div>
        <div className="mor-pill">{m.statusPill}</div>
      </div>

      <div className="mor-main">
        <div className="mor-team left">
          <div className="mor-logoWrap">
            <img className="mor-logo" src={m.homeLogo} alt={`${m.homeTeam} logo`} />
          </div>
          <div className="mor-teamName">{m.homeTeam}</div>
        </div>

        <div className="mor-scoreBlock">
          <div className="mor-score">
            <span>{m.homeScore}</span>
            <span className="mor-dash">–</span>
            <span>{m.awayScore}</span>
          </div>
          {m.clockText ? (
            <div className="mor-clock">
              <span className="mor-clockDot" />
              <span>{m.clockText}</span>
            </div>
          ) : null}
        </div>

        <div className="mor-team right">
          <div className="mor-logoWrap">
            <img className="mor-logo" src={m.awayLogo} alt={`${m.awayTeam} logo`} />
          </div>
          <div className="mor-teamName">{m.awayTeam}</div>
        </div>
      </div>
    </motion.div>
  );
}
