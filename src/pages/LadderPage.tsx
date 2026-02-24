import React, { memo, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import SmartImg from '../components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';

import '../styles/ladder.css';

type Mode = 'SUMMARY' | 'EXTENDED' | 'FORM';

type LadderEntry = {
  id: string;
  pos: number;
  teamKey: TeamKey;
  teamName: string;

  played: number;
  wins: number;
  losses: number;
  draws: number;

  pf: number;
  pa: number;

  points: number;
  percentage: number;

  form: Array<'W' | 'L' | 'D'>;

  // entertainment-only
  winChance: number; // 5..95
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex: string) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return { r: 245, g: 196, b: 0 };
  return { r, g, b };
}
function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hash01(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

function makeRows(): LadderEntry[] {
  const mk = (
    id: string,
    pos: number,
    teamKey: TeamKey,
    teamName: string,
    played: number,
    wins: number,
    losses: number,
    draws: number,
    pf: number,
    pa: number,
    form: Array<'W' | 'L' | 'D'>
  ): LadderEntry => {
    const points = wins * 4 + draws * 2;
    const percentage = pa > 0 ? (pf / pa) * 100 : 0;
    return {
      id,
      pos,
      teamKey,
      teamName,
      played,
      wins,
      losses,
      draws,
      pf,
      pa,
      points,
      percentage,
      form,
      winChance: 50,
    };
  };

  // TEMP demo rows (swap to Supabase later)
  return [
    mk('adelaide', 1, 'adelaide', 'Crows', 0, 0, 0, 0, 0, 0, ['W', 'W', 'W', 'W', 'W']),
    mk('brisbane', 2, 'brisbane', 'Lions', 0, 0, 0, 0, 0, 0, ['W', 'W', 'W', 'L', 'W']),
    mk('carlton', 3, 'carlton', 'Blues', 0, 0, 0, 0, 0, 0, ['W', 'W', 'L', 'W', 'W']),
    mk('collingwood', 4, 'collingwood', 'Magpies', 0, 0, 0, 0, 0, 0, ['W', 'L', 'W', 'W', 'W']),
    mk('essendon', 5, 'essendon', 'Bombers', 0, 0, 0, 0, 0, 0, ['L', 'W', 'W', 'L', 'W']),
    mk('fremantle', 6, 'fremantle', 'Dockers', 0, 0, 0, 0, 0, 0, ['W', 'L', 'L', 'W', 'W']),
    mk('geelong', 7, 'geelong', 'Cats', 0, 0, 0, 0, 0, 0, ['L', 'L', 'W', 'L', 'W']),
    mk('goldcoast', 8, 'goldcoast', 'Suns', 0, 0, 0, 0, 0, 0, ['W', 'W', 'L', 'L', 'W']),
    mk('gws', 9, 'gws', 'Giants', 0, 0, 0, 0, 0, 0, ['W', 'W', 'W', 'W', 'L']),
    mk('hawthorn', 10, 'hawthorn', 'Hawks', 0, 0, 0, 0, 0, 0, ['L', 'W', 'L', 'L', 'W']),
  ];
}

function enrichWinChance(rows: LadderEntry[]): LadderEntry[] {
  return rows.map((r) => {
    const seed = hash01(r.id);
    const base = 45 + seed * 40; // 45..85
    const rankBoost = (rows.length - r.pos) * 0.6;
    return { ...r, winChance: clamp(base + rankBoost, 5, 95) };
  });
}

function oddsFromWinChance(winChance: number) {
  const p = clamp(winChance / 100, 0.05, 0.95);
  return clamp(1 / p, 1.08, 9.99);
}

const LadderRow = memo(function LadderRow({ entry, mode }: { entry: LadderEntry; mode: Mode }) {
  const t = TEAM_ASSETS[entry.teamKey] || TEAM_ASSETS.adelaide;
  const logo = assetUrl(t.logoFile);

  const cssVars = useMemo(() => {
    const team = t.primary || '#F5C400';
    return {
      ['--team' as any]: team,
      ['--teamA' as any]: rgba(team, 0.42),
      ['--teamB' as any]: rgba(team, 0.16),
      ['--teamLine' as any]: rgba(team, 0.34),
    } as React.CSSProperties;
  }, [t.primary]);

  const odds = oddsFromWinChance(entry.winChance);

  return (
    <motion.div
      className="egAflRow"
      style={cssVars}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
    >
      <div className="cPos">{entry.pos}</div>

      <div className="cClub">
        <div className="clubTint" aria-hidden="true" />
        <div className="clubLogo">
          <SmartImg className="logoImg" src={logo} alt={entry.teamName} />
        </div>
        <div className="clubName" title={entry.teamName}>
          {entry.teamName}
        </div>
      </div>

      <div className="cCols" data-mode={mode}>
        {mode === 'SUMMARY' && (
          <>
            <div className="cell">
              <div className="k">P</div>
              <div className="v">{entry.played}</div>
            </div>
            <div className="cell">
              <div className="k">Pts</div>
              <div className="v vPts">{entry.points}</div>
            </div>
            <div className="cell">
              <div className="k">%</div>
              <div className="v">{entry.percentage.toFixed(1)}</div>
            </div>
          </>
        )}

        {mode === 'EXTENDED' && (
          <>
            <div className="cell"><div className="k">W</div><div className="v">{entry.wins}</div></div>
            <div className="cell"><div className="k">L</div><div className="v">{entry.losses}</div></div>
            <div className="cell"><div className="k">D</div><div className="v">{entry.draws}</div></div>
            <div className="cell"><div className="k">PA</div><div className="v">{entry.pa}</div></div>
            <div className="cell"><div className="k">PF</div><div className="v">{entry.pf}</div></div>
          </>
        )}

        {mode === 'FORM' && (
          <>
            <div className="formCol">
              <div className="k">Last 5</div>
              <div className="dots" aria-label="Last 5 form">
                {Array.from({ length: 5 }).map((_, i) => {
                  const f = entry.form[i];
                  const cls = f === 'W' ? 'w' : f === 'L' ? 'l' : f === 'D' ? 'd' : 'n';
                  return <span key={i} className={`dot ${cls}`} />;
                })}
              </div>
            </div>

            <div className="oddsCol">
              <div className="k">Odds</div>
              <div className="oddsPill">${odds.toFixed(2)}</div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
});

export default function LadderPage() {
  const [mode, setMode] = useState<Mode>('SUMMARY');
  const [loading, setLoading] = useState(true);

  const rows = useMemo(() => enrichWinChance(makeRows()), []);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 120);
    return () => window.clearTimeout(t);
  }, []);

  const headerCols = useMemo(() => {
    if (mode === 'SUMMARY') return ['P', 'Pts', '%'];
    if (mode === 'EXTENDED') return ['W', 'L', 'D', 'PA', 'PF'];
    return ['Last 5', 'Odds'];
  }, [mode]);

  return (
    <div className="ladderPage aflLayout">
      <div className="ladderWrap">
        <section className="ladderHero aflHero">
          <div className="heroTop">
            <div>
              <div className="kicker">AFL26 • Elite Gaming</div>
              <div className="title">Ladder</div>
              <div className="rule" />
              <div className="hint">Ranked by points, then percentage</div>
            </div>
            <div className="seasonPill">Season One</div>
          </div>
        </section>

        <div className="aflTabsWrap">
          <div className="aflTabs" role="tablist" aria-label="Ladder tabs">
            <button type="button" className={mode === 'SUMMARY' ? 't isOn' : 't'} onClick={() => setMode('SUMMARY')}>
              Summary
            </button>
            <button type="button" className={mode === 'EXTENDED' ? 't isOn' : 't'} onClick={() => setMode('EXTENDED')}>
              Extended
            </button>
            <button type="button" className={mode === 'FORM' ? 't isOn' : 't'} onClick={() => setMode('FORM')}>
              Form
            </button>
          </div>
        </div>

        <div className="aflTable" data-mode={mode}>
          <div className="aflHead">
            <div className="hPos">Pos</div>
            <div className="hClub">Club</div>
            <div className="hCols" data-mode={mode}>
              {headerCols.map((c) => (
                <div key={c} className="h">
                  {c}
                </div>
              ))}
            </div>
          </div>

          <div className="aflList">
            {loading ? (
              <div className="loading">Loading ladder…</div>
            ) : (
              rows.map((r) => <LadderRow key={r.id} entry={r} mode={mode} />)
            )}
          </div>
        </div>

        <div className="safeBottom" />
      </div>
    </div>
  );
}
