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

type TeamInfo = { key: TeamKey; name: string };

function buildTeamInfoIndex(fixtures: FixtureRow[]): Map<string, TeamInfo> {
  const map = new Map<string, TeamInfo>();
  const consider = (id: string | null | undefined, slug: string | null | undefined, teamKey: string | null | undefined, name: string | null | undefined) => {
    const tid = String(id || '').trim();
    if (!tid || map.has(tid)) return;
    const k = resolveTeamKey({ slug, teamKey, name });
    if (!k || !(k in TEAM_ASSETS)) return;
    map.set(tid, { key: k as TeamKey, name: name || TEAM_ASSETS[k as TeamKey].shortName });
  };
  for (const f of fixtures) {
    consider(f.home_team_id, f.home_team_slug, f.home_team_key, f.home_team_short_name || f.home_team_name);
    consider(f.away_team_id, f.away_team_slug, f.away_team_key, f.away_team_short_name || f.away_team_name);
  }
  return map;
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

  const teamInfoById = useMemo(() => buildTeamInfoIndex(fixtures), [fixtures]);

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
      const fixtureHomeKey = teamKeyFor(f, 'home');
      const fixtureAwayKey = teamKeyFor(f, 'away');
      const placeholderHome = placeholder?.homeTeamId ? teamInfoById.get(placeholder.homeTeamId) : undefined;
      const placeholderAway = placeholder?.awayTeamId ? teamInfoById.get(placeholder.awayTeamId) : undefined;
      const homeKey = fixtureHomeKey ?? placeholderHome?.key;
      const awayKey = fixtureAwayKey ?? placeholderAway?.key;
      const homeName = fixtureHomeKey
        ? TEAM_ASSETS[fixtureHomeKey].shortName
        : placeholderHome
          ? TEAM_ASSETS[placeholderHome.key].shortName
          : undefined;
      const awayName = fixtureAwayKey
        ? TEAM_ASSETS[fixtureAwayKey].shortName
        : placeholderAway
          ? TEAM_ASSETS[placeholderAway.key].shortName
          : undefined;
      const homeSeed = f?.home_seed ?? placeholder?.homeSeed;
      const awaySeed = f?.away_seed ?? placeholder?.awaySeed;
      const wc = matchupWinChance({ seed: `${seasonId}:${slot}`, homeSeed, awaySeed });
      out.set(slot, {
        bracketSlot: slot,
        label: placeholder?.label ?? slot,
        matchId: f?.id,
        homeKey,
        awayKey,
        homeName,
        awayName,
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
  }, [fixturesBySlot, placeholdersBySlot, teamInfoById, seasonId]);

  const onClickCell = (cell: CellData) => {
    if (cell.matchId) navigate(`/match-centre/${cell.matchId}`);
  };

  const renderColumn = (col: typeof COLUMNS[number]) => (
    <div key={col.key} className={`finalsBracket__col finalsBracket__col--${col.key.toLowerCase()}`}>
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
                isLoser={isFinal && (cell.homeTotal ?? 0) < (cell.awayTotal ?? 0)}
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
                isLoser={isFinal && (cell.awayTotal ?? 0) < (cell.homeTotal ?? 0)}
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="finalsBracket">
      <div className="finalsBracket__scroll">
        {renderColumn(COLUMNS[0])}

        {/* Week 1 → SF: (QF1+EF2)→SF1, (EF1+QF2)→SF2 */}
        <svg className="finalsBracket__connector" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,13 H10 V25 H24" className="finalsBracket__connLine" />
          <path d="M0,38 H10 V25"   className="finalsBracket__connLine finalsBracket__connLine--loser" />
          <path d="M0,63 H10 V75 H24" className="finalsBracket__connLine" />
          <path d="M0,88 H10 V75"   className="finalsBracket__connLine finalsBracket__connLine--loser" />
          <circle cx="10" cy="25" r="1.5" className="finalsBracket__connDot" />
          <circle cx="10" cy="75" r="1.5" className="finalsBracket__connDot" />
        </svg>

        {renderColumn(COLUMNS[1])}

        {/* SF → PF: SF1→PF1, SF2→PF2 (straight lines, QF winners also feed PF) */}
        <svg className="finalsBracket__connector" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,25 H24" className="finalsBracket__connLine" />
          <path d="M0,75 H24" className="finalsBracket__connLine" />
        </svg>

        {renderColumn(COLUMNS[2])}

        {/* PF → GF */}
        <svg className="finalsBracket__connector" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,25 H12 V50 H24" className="finalsBracket__connLine" />
          <path d="M0,75 H12 V50"     className="finalsBracket__connLine" />
          <circle cx="12" cy="50" r="1.5" className="finalsBracket__connDot" />
        </svg>

        {renderColumn(COLUMNS[3])}
      </div>
    </div>
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
  isLoser?: boolean;
}) {
  const { teamKey, teamName, placeholder, seed, winChance, total, isWinner, isLoser } = props;
  const asset = teamKey ? TEAM_ASSETS[teamKey] : null;
  const logo = asset?.logoPath ? assetUrl(asset.logoPath) : '';

  return (
    <div className={`finalsBracket__side ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}`}>
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
