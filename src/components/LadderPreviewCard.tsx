// components/LadderPreviewCard.tsx - Updated with team colors
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import SmartImg from './SmartImg';
import { TeamKey, TEAM_ASSETS, assetUrl } from '../lib/teamAssets';
import '../styles/ladderPreview.css';

export type LadderPreviewRow = {
  pos: number;
  team: TeamKey;
  gp: number;
  pts: number;
  pct: number;
};

// Map teams to CSS classes for colored backgrounds
const teamColorMap: Record<string, string> = {
  adelaide: 'crows',
  brisbane: 'lions',
  carlton: 'blues',
  collingwood: 'pies',
  essendon: 'bombers',
  fremantle: 'dockers',
  geelong: 'cats',
  goldcoast: 'suns',
  gws: 'giants',
  hawthorn: 'hawks',
  melbourne: 'demons',
  northmelbourne: 'kangaroos',
  portadelaide: 'power',
  richmond: 'tigers',
  stkilda: 'saints',
  sydney: 'swans',
  westcoast: 'eagles',
  westernbulldogs: 'dogs',
};

export default function LadderPreviewCard({
  rows,
  seasonLabel = 'Season One',
}: {
  rows: LadderPreviewRow[];
  seasonLabel?: string;
}) {
  return (
    <div className="lp-wrap">
      <div className="lp-head">
        <div className="lp-kicker">AFL26 • Elite Gaming</div>
        <div className="lp-title">Ladder</div>
        <div className="lp-sub">Ranked by points, then percentage</div>
        <div className="lp-pill">{seasonLabel}</div>
      </div>

      <div className="lp-cols">
        <div className="lp-col">#</div>
        <div className="lp-col team">TEAM</div>
        <div className="lp-col">GP</div>
        <div className="lp-col">PTS</div>
        <div className="lp-col">%</div>
        <div className="lp-col form">FORM</div>
      </div>

      <div className="lp-list">
        {rows.map((r) => {
          const t = TEAM_ASSETS[r.team];
          const colorClass = teamColorMap[r.team] || '';
          return (
            <motion.div
              key={r.pos}
              className={`lp-row ${colorClass}`}
              whileTap={{ scale: 0.995 }}
              transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            >
              <div className="lp-pos">
                <div className="lp-posNum">{r.pos}</div>
                <div className="lp-move">↗ 1</div>
              </div>

              <div className="lp-team">
                <div className="lp-logoRing">
                  <SmartImg className="lp-logo" src={assetUrl(t.logoFile)} alt={t.name} fallbackText={t.short[0]} />
                </div>
                <div className="lp-name">{t.short}</div>
              </div>

              <div className="lp-gp">{r.gp}</div>
              <div className="lp-pts">{r.pts}</div>
              <div className="lp-pct">{r.pct.toFixed(1)}</div>
              <div className="lp-form">
                <ChevronDown size={16} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
