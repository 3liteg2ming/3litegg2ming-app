import React, { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import SmartImg from '../components/SmartImg';
import { MelvinBetSeasonForecast, type MelvinForecastTeam } from '../components/MelvinBet';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../lib/teamAssets';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { resolveTeamKey } from '../lib/entityResolvers';
import { useLadder } from '../hooks/useLadder';

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

function normalizeForm(input: unknown): Array<'W' | 'L' | 'D'> {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.replace(/[{}]/g, '').split(',') : [];
  const out: Array<'W' | 'L' | 'D'> = [];
  for (const item of raw) {
    const token = String(item || '').trim().toUpperCase();
    if (token === 'W' || token === 'L' || token === 'D') out.push(token);
    if (out.length >= 5) break;
  }
  return out;
}

function toTeamKeyFromSlug(slug: string, name: string): TeamKey {
  const key = resolveTeamKey({ slug, name });
  return (key in TEAM_ASSETS ? (key as TeamKey) : 'adelaide') as TeamKey;
}

function enrichWinChance(rows: LadderEntry[]): LadderEntry[] {
  return rows.map((r) => {
    const seed = hash01(r.id);
    const base = 45 + seed * 40; // 45..85
    const rankBoost = (rows.length - r.pos) * 0.6;
    return { ...r, winChance: clamp(base + rankBoost, 5, 95) };
  });
}

const LadderRow = memo(function LadderRow({ entry, mode }: { entry: LadderEntry; mode: Mode }) {
  const t = TEAM_ASSETS[entry.teamKey] || {
    name: 'Unassigned',
    shortName: 'EG',
    colour: '#2a2f38',
    primary: '#2a2f38',
    logoPath: '',
    logoFile: '',
  };
  const logo = assetUrl(t.logoFile ?? '');

  const cssVars = useMemo(() => {
    const team = t.primary || '#F5C400';
    return {
      ['--team' as any]: team,
      ['--teamA' as any]: rgba(team, 0.18),
      ['--teamB' as any]: rgba(team, 0.06),
    } as React.CSSProperties;
  }, [t.primary]);

  return (
    <motion.div
      className="ladRow"
      style={cssVars}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
    >
      <div className="ladRow__tint" aria-hidden="true" />

      <div className="ladRow__rank">{entry.pos}</div>

      <div className="ladRow__team">
        <div className="ladRow__logo">
          <SmartImg className="ladRow__logoImg" src={logo} alt={entry.teamName} />
        </div>
        <div className="ladRow__name" title={entry.teamName}>{entry.teamName}</div>
      </div>

      <div className="ladRow__stats">
        {mode === 'SUMMARY' && (
          <>
            <span className="st"><span className="st__k">P</span><span className="st__v">{entry.played}</span></span>
            <span className="st"><span className="st__k">PTS</span><span className="st__v st__v--pts">{entry.points}</span></span>
            <span className="st"><span className="st__k">%</span><span className="st__v">{entry.percentage.toFixed(1)}</span></span>
          </>
        )}

        {mode === 'EXTENDED' && (
          <>
            <span className="st"><span className="st__k">W</span><span className="st__v">{entry.wins}</span></span>
            <span className="st"><span className="st__k">L</span><span className="st__v">{entry.losses}</span></span>
            <span className="st"><span className="st__k">D</span><span className="st__v">{entry.draws}</span></span>
            <span className="st st--wide"><span className="st__k">PF</span><span className="st__v">{entry.pf}</span></span>
            <span className="st st--wide"><span className="st__k">PA</span><span className="st__v">{entry.pa}</span></span>
          </>
        )}

        {mode === 'FORM' && (
          <div className="ladRow__formDots" aria-label="Last 5 form">
            {Array.from({ length: 5 }).map((_, i) => {
              const f = entry.form[i];
              const cls = f === 'W' ? 'w' : f === 'L' ? 'l' : f === 'D' ? 'd' : 'n';
              return <span key={i} className={`ladDot ${cls}`} />;
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default function LadderPage() {
  const [mode, setMode] = useState<Mode>('SUMMARY');

  const competitionKey = getStoredCompetitionKey();
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);
  const { data: ladderRows, isLoading, isFetching, isError, isSuccess } = useLadder(seasonSlug);
  const hasRows = Array.isArray(ladderRows) && ladderRows.length > 0;
  const showLoading = !isSuccess && !isError && !hasRows && (isLoading || isFetching);

  const rows = useMemo(() => {
    if (!Array.isArray(ladderRows) || ladderRows.length === 0) return [] as LadderEntry[];

    const mapped: LadderEntry[] = ladderRows
      .map((r, idx) => {
        const teamKey = toTeamKeyFromSlug(String(r.team_slug || ''), String(r.team_name || ''));
        return {
          id: String(r.team_id),
          pos: idx + 1,
          teamKey,
          teamName: String(r.team_name || TEAM_ASSETS[teamKey]?.name || 'Team'),
          played: Number(r.played || 0),
          wins: Number(r.wins || 0),
          losses: Number(r.losses || 0),
          draws: Number(r.draws || 0),
          pf: Number(r.pf || 0),
          pa: Number(r.pa || 0),
          points: Number(r.points || 0),
          percentage: Number(r.percentage || 0),
          form: normalizeForm((r as any).last5_results),
          winChance: 50,
        };
      });

    return enrichWinChance(mapped);
  }, [ladderRows]);

  const forecastTeams = useMemo<MelvinForecastTeam[]>(() => {
    return rows.map((r) => {
      const t = TEAM_ASSETS[r.teamKey] || { logoFile: '' };
      return {
        id: r.id,
        pos: r.pos,
        teamName: r.teamName,
        logoUrl: t.logoFile ? assetUrl(t.logoFile) : undefined,
        played: r.played,
        wins: r.wins,
        percentage: r.percentage,
      };
    });
  }, [rows]);

  return (
    <div className="ladderPage aflLayout">
      <div className="ladderWrap">
        <section className="ladderHero aflHero">
          <div className="heroTop">
            <div>
              <div className="kicker">{competitionKey.toUpperCase()} • Elite Gaming</div>
              <div className="title">Ladder</div>
              <div className="rule" />
              <div className="hint">
                {showLoading ? 'Loading ladder…' : isError ? 'Ladder unavailable right now' : rows.length === 0 ? 'No teams available for this competition' : 'Ranked by points, then percentage'}
              </div>
            </div>
            <div className="seasonPill">{seasonSlug.replace(/-/g, ' ')}</div>
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

        <div className="ladList">
          {rows.length > 0 ? rows.map((r) => <LadderRow key={r.id} entry={r} mode={mode} />) : (
            <div className="ladRow ladRow--empty">
              <div className="ladRow__rank">—</div>
              <div className="ladRow__team">
                <div className="ladRow__name">
                  {showLoading ? 'Loading live ladder…' : isError ? 'Unable to load ladder right now' : 'No teams available for this competition'}
                </div>
              </div>
            </div>
          )}
        </div>

        {forecastTeams.length > 0 && <MelvinBetSeasonForecast teams={forecastTeams} />}

        <div className="safeBottom" />
      </div>
    </div>
  );
}
