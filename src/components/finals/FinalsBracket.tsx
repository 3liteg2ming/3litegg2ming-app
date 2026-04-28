import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import SmartImg from '../SmartImg';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../../lib/teamAssets';
import { resolveTeamKey } from '../../lib/entityResolvers';
import {
  type BracketSlot,
  type FinalsFixtureLite,
  derivedPlaceholders,
  WEEK1_PAIRINGS,
} from '../../lib/finalsBracket';
import { matchupWinChance } from '../../lib/winChance';
import type { FixtureRow } from '../../lib/fixturesRepo';
import '../../styles/finals-bracket.css';

type Props = {
  fixtures: FixtureRow[];
  seasonId?: string;
};

type CellData = {
  bracketSlot: BracketSlot;
  label: string;
  matchId?: string;
  homeKey?: TeamKey;
  awayKey?: TeamKey;
  homeName?: string;
  awayName?: string;
  homeSeed?: number;
  awaySeed?: number;
  homePlaceholder?: string;
  awayPlaceholder?: string;
  homeWinChance?: number;
  awayWinChance?: number;
  status?: string;
  homeTotal?: number | null;
  awayTotal?: number | null;
};

const COLUMNS: Array<{ key: string; title: string; slots: BracketSlot[] }> = [
  // QF1+EF2 → SF1, EF1+QF2 → SF2: group pairs together so bracket lines are clean
  { key: 'WEEK_1', title: 'Finals Week 1', slots: ['QF1', 'EF2', 'EF1', 'QF2'] },
  { key: 'SF', title: 'Semi Finals', slots: ['SF1', 'SF2'] },
  { key: 'PF', title: 'Preliminary Finals', slots: ['PF1', 'PF2'] },
  { key: 'GF', title: 'Grand Final', slots: ['GF'] },
];

function teamKeyFor(fixture: FixtureRow | undefined, side: 'home' | 'away'): TeamKey | undefined {
  if (!fixture) return undefined;
  const slug = side === 'home' ? fixture.home_team_slug : fixture.away_team_slug;
  const teamKey = side === 'home' ? fixture.home_team_key : fixture.away_team_key;
  const name = side === 'home' ? fixture.home_team_name : fixture.away_team_name;
  const k = resolveTeamKey({ slug, teamKey, name });
  return (k && k in TEAM_ASSETS ? (k as TeamKey) : undefined);
}

export default function FinalsBracket({ fixtures, seasonId = 'finals' }: Props) {
  const navigate = useNavigate();

  const fixturesBySlot = useMemo(() => {
    const map = new Map<BracketSlot, FixtureRow>();
    for (const f of fixtures) {
      if (!f.is_finals || !f.bracket_slot) continue;
      map.set(f.bracket_slot as BracketSlot, f);
    }
    return map;
  }, [fixtures]);

  const lite = useMemo<Map<BracketSlot, FinalsFixtureLite>>(() => {
    const map = new Map<BracketSlot, FinalsFixtureLite>();
    fixturesBySlot.forEach((f, slot) => {
      map.set(slot, {
        id: f.id,
        bracketSlot: slot,
        status: f.status,
        homeTeamId: f.home_team_id,
        awayTeamId: f.away_team_id,
        homeSeed: f.home_seed,
        awaySeed: f.away_seed,
        homeTotal: f.home_total,
        awayTotal: f.away_total,
      });
    });
    return map;
  }, [fixturesBySlot]);

  const placeholders = useMemo(() => derivedPlaceholders(lite), [lite]);
  const placeholdersBySlot = useMemo(() => {
    const m = new Map<BracketSlot, ReturnType<typeof derivedPlaceholders>[number]>();
    placeholders.forEach((p) => m.set(p.bracketSlot, p));
    return m;
  }, [placeholders]);

  const cells = useMemo<Map<BracketSlot, CellData>>(() => {
    const out = new Map<BracketSlot, CellData>();

    (['QF1', 'QF2', 'EF1', 'EF2'] as const).forEach((slot) => {
      const f = fixturesBySlot.get(slot);
      const cfg = WEEK1_PAIRINGS[slot];
      const homeKey = teamKeyFor(f, 'home');
      const awayKey = teamKeyFor(f, 'away');
      const homeSeed = f?.home_seed ?? cfg.homeSeed;
      const awaySeed = f?.away_seed ?? cfg.awaySeed;
      const wc = matchupWinChance({ seed: `${seasonId}:${slot}`, homeSeed, awaySeed });
      out.set(slot, {
        bracketSlot: slot,
        label: cfg.label,
        matchId: f?.id,
        homeKey,
        awayKey,
        homeName: homeKey ? TEAM_ASSETS[homeKey].shortName : undefined,
        awayName: awayKey ? TEAM_ASSETS[awayKey].shortName : undefined,
        homeSeed,
        awaySeed,
        homePlaceholder: homeKey ? undefined : `Seed ${cfg.homeSeed}`,
        awayPlaceholder: awayKey ? undefined : `Seed ${cfg.awaySeed}`,
        homeWinChance: wc.home,
        awayWinChance: wc.away,
        status: f?.status,
        homeTotal: f?.home_total,
        awayTotal: f?.away_total,
      });
    });

    (['SF1', 'SF2', 'PF1', 'PF2', 'GF'] as const).forEach((slot) => {
      const f = fixturesBySlot.get(slot);
      const placeholder = placeholdersBySlot.get(slot);
      const homeKey = teamKeyFor(f, 'home');
      const awayKey = teamKeyFor(f, 'away');
      const homeSeed = f?.home_seed ?? placeholder?.homeSeed;
      const awaySeed = f?.away_seed ?? placeholder?.awaySeed;
      const wc = matchupWinChance({ seed: `${seasonId}:${slot}`, homeSeed, awaySeed });
      out.set(slot, {
        bracketSlot: slot,
        label: placeholder?.label ?? slot,
        matchId: f?.id,
        homeKey,
        awayKey,
        homeName: homeKey ? TEAM_ASSETS[homeKey].shortName : undefined,
        awayName: awayKey ? TEAM_ASSETS[awayKey].shortName : undefined,
        homeSeed,
        awaySeed,
        homePlaceholder: homeKey ? undefined : (placeholder?.homeLabel || 'TBD'),
        awayPlaceholder: awayKey ? undefined : (placeholder?.awayLabel || 'TBD'),
        homeWinChance: wc.home,
        awayWinChance: wc.away,
        status: f?.status,
        homeTotal: f?.home_total,
        awayTotal: f?.away_total,
      });
    });

    return out;
  }, [fixturesBySlot, placeholdersBySlot, seasonId]);

  const onClickCell = (cell: CellData) => {
    if (cell.matchId) navigate(`/match-centre/${cell.matchId}`);
  };

  return (
    <div className="finalsBracket">
      <div className="finalsBracket__scroll">
        {/* Single SVG overlay — drawn behind all cells via z-index */}
        <BracketLines />

        {COLUMNS.map((col, i) => (
          <div
            key={col.key}
            className={`finalsBracket__col finalsBracket__col--${col.key.toLowerCase()}`}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          >
            <div className="finalsBracket__colTitle">{col.title}</div>
            <div className="finalsBracket__cells">
              {col.slots.map((slot) => {
                const cell = cells.get(slot);
                if (!cell) return null;
                const isFinal = String(cell.status || '').toUpperCase() === 'FINAL';
                const isQF = slot === 'QF1' || slot === 'QF2';
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`finalsBracket__cell ${isFinal ? 'is-final' : ''} ${cell.matchId ? 'has-match' : 'is-tbd'} ${isQF ? 'is-qf' : ''}`}
                    onClick={() => onClickCell(cell)}
                    disabled={!cell.matchId}
                  >
                    <div className="finalsBracket__cellTop">
                      <span className="finalsBracket__cellLabel">{cell.label}</span>
                      {isQF && <span className="finalsBracket__qfBadge">W → PF</span>}
                    </div>
                    <BracketSide
                      side="home"
                      teamKey={cell.homeKey}
                      teamName={cell.homeName}
                      placeholder={cell.homePlaceholder}
                      seed={cell.homeSeed}
                      winChance={cell.homeWinChance}
                      total={cell.homeTotal}
                      isWinner={isFinal && (cell.homeTotal ?? 0) > (cell.awayTotal ?? 0)}
                    />
                    <BracketSide
                      side="away"
                      teamKey={cell.awayKey}
                      teamName={cell.awayName}
                      placeholder={cell.awayPlaceholder}
                      seed={cell.awaySeed}
                      winChance={cell.awayWinChance}
                      total={cell.awayTotal}
                      isWinner={isFinal && (cell.awayTotal ?? 0) > (cell.homeTotal ?? 0)}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Overlay SVG drawn behind all cells (grid-column:1/-1, grid-row:1, z-index:0)
// Positions are % of total bracket width/height (viewBox 0 0 100 100)
// Column boundaries: Week1 0-25, SF 25-50, PF 50-75, GF 75-100
// Cell edges (with internal padding ~3%): w1R=22, sfL=28, sfR=47, pfL=53, pfR=72, gfL=78
// Vertical centers (title≈15% + cells with space-around):
//   Week1(4): qf1=25 ef2=47 ef1=68 qf2=89  |  SF/PF(2): top=38 bot=78  |  GF: 58
function BracketLines() {
  const WIN  = 'rgba(212,175,55,0.80)';
  const LOSE = 'rgba(160,160,160,0.38)';
  const DOT  = 'rgba(212,175,55,0.80)';

  const w = { fill: 'none', stroke: WIN,  strokeWidth: '1.4', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const l = { fill: 'none', stroke: LOSE, strokeWidth: '1.0', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeDasharray: '2.5 1.8' };

  return (
    <svg
      className="finalsBracket__linesSvg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* ── Week1 → SF merge brackets ───────────────────────────── */}
      {/* QF1 loser (dashed) → merge → SF1 */}
      <path d="M22,25 H25 V38 H28" {...l} />
      {/* EF2 winner → merge → SF1 */}
      <path d="M22,47 H25 V38"     {...w} />
      {/* EF1 winner → merge → SF2 */}
      <path d="M22,68 H25 V78 H28" {...w} />
      {/* QF2 loser (dashed) → merge → SF2 */}
      <path d="M22,89 H25 V78"     {...l} />
      {/* Merge dots */}
      <circle cx="25" cy="38" r="1.6" fill={DOT} />
      <circle cx="25" cy="78" r="1.6" fill={DOT} />

      {/* ── QF winner skip lines (pass above/below SF boxes) ──── */}
      {/* QF1 winner → PF1: goes at y=25 (above SF1 at y=38), turns down at PF left */}
      <path d="M22,25 H53 V38" {...w} />
      {/* QF2 winner → PF2: goes at y=89 (below SF2 at y=78), turns up at PF left */}
      <path d="M22,89 H53 V78" {...w} />

      {/* ── SF winner → PF ──────────────────────────────────────── */}
      <path d="M47,38 H53" {...w} />
      <path d="M47,78 H53" {...w} />
      {/* Merge dots at PF entries */}
      <circle cx="53" cy="38" r="1.6" fill={DOT} />
      <circle cx="53" cy="78" r="1.6" fill={DOT} />

      {/* ── PF → GF ─────────────────────────────────────────────── */}
      <path d="M72,38 H75 V58 H78" {...w} />
      <path d="M72,78 H75 V58"     {...w} />
      <circle cx="75" cy="58" r="1.6" fill={DOT} />

      {/* ── W / L labels on lines ───────────────────────────────── */}
      {/* QF1 winner label */}
      <text x="34" y="23.5" fontSize="3.2" fontWeight="800" fill="rgba(212,175,55,0.90)" textAnchor="middle" fontFamily="sans-serif">W</text>
      {/* QF1 loser label */}
      <text x="23.5" y="32" fontSize="3.0" fontWeight="700" fill="rgba(180,180,180,0.70)" textAnchor="middle" fontFamily="sans-serif">L</text>
      {/* QF2 winner label */}
      <text x="34" y="91.5" fontSize="3.2" fontWeight="800" fill="rgba(212,175,55,0.90)" textAnchor="middle" fontFamily="sans-serif">W</text>
      {/* QF2 loser label */}
      <text x="23.5" y="76" fontSize="3.0" fontWeight="700" fill="rgba(180,180,180,0.70)" textAnchor="middle" fontFamily="sans-serif">L</text>
    </svg>
  );
}

function BracketSide(props: {
  side: 'home' | 'away';
  teamKey?: TeamKey;
  teamName?: string;
  placeholder?: string;
  seed?: number;
  winChance?: number;
  total?: number | null;
  isWinner?: boolean;
}) {
  const { teamKey, teamName, placeholder, seed, winChance, total, isWinner } = props;
  const asset = teamKey ? TEAM_ASSETS[teamKey] : null;
  const logo = asset?.logoPath ? assetUrl(asset.logoPath) : '';

  return (
    <div className={`finalsBracket__side ${isWinner ? 'is-winner' : ''}`}>
      {seed != null ? <span className="finalsBracket__seed">{seed}</span> : null}
      {logo ? (
        <SmartImg src={logo} alt={teamName || ''} className="finalsBracket__logo" />
      ) : (
        <span className="finalsBracket__logoPlaceholder" />
      )}
      <span className="finalsBracket__teamName">{teamName || placeholder || 'TBD'}</span>
      {total != null ? (
        <span className="finalsBracket__score">{total}</span>
      ) : winChance != null && teamKey ? (
        <span className="finalsBracket__wc">{Math.round(winChance)}%</span>
      ) : null}
    </div>
  );
}
