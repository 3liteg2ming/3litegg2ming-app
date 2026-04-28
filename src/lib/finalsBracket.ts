// Pure, side-effect-free helpers for the AFL26 finals bracket.
// Mirrors the eg_finals_progression() logic in supabase, so the UI can render
// derived TBD slots before the trigger writes them.

export type FinalsStageCode = 'QF' | 'EF' | 'SF' | 'PF' | 'GF';

export type BracketSlot =
  | 'QF1' | 'QF2'
  | 'EF1' | 'EF2'
  | 'SF1' | 'SF2'
  | 'PF1' | 'PF2'
  | 'GF';

export const FINALS_WEEK_LABELS: Record<'WEEK_1' | 'SF' | 'PF' | 'GF', string> = {
  WEEK_1: 'Finals Week 1',
  SF: 'Semi Finals',
  PF: 'Preliminary Finals',
  GF: 'Grand Final',
};

export const WEEK1_PAIRINGS: Record<'QF1'|'QF2'|'EF1'|'EF2', { homeSeed: number; awaySeed: number; stage: FinalsStageCode; label: string }> = {
  QF1: { homeSeed: 1, awaySeed: 4, stage: 'QF', label: 'Qualifying Final' },
  QF2: { homeSeed: 2, awaySeed: 3, stage: 'QF', label: 'Qualifying Final' },
  EF1: { homeSeed: 5, awaySeed: 8, stage: 'EF', label: 'Elimination Final' },
  EF2: { homeSeed: 6, awaySeed: 7, stage: 'EF', label: 'Elimination Final' },
};

export type DerivedRef = { kind: 'winner' | 'loser'; from: BracketSlot } | { kind: 'team'; teamId: string; seed?: number };

export const FINALS_PROGRESSION: Record<'SF1'|'SF2'|'PF1'|'PF2'|'GF', { home: DerivedRef; away: DerivedRef; stage: FinalsStageCode; label: string }> = {
  SF1: { home: { kind: 'loser',  from: 'QF1' }, away: { kind: 'winner', from: 'EF2' }, stage: 'SF', label: 'Semi Final' },
  SF2: { home: { kind: 'loser',  from: 'QF2' }, away: { kind: 'winner', from: 'EF1' }, stage: 'SF', label: 'Semi Final' },
  PF1: { home: { kind: 'winner', from: 'QF1' }, away: { kind: 'winner', from: 'SF1' }, stage: 'PF', label: 'Preliminary Final' },
  PF2: { home: { kind: 'winner', from: 'QF2' }, away: { kind: 'winner', from: 'SF2' }, stage: 'PF', label: 'Preliminary Final' },
  GF:  { home: { kind: 'winner', from: 'PF1' }, away: { kind: 'winner', from: 'PF2' }, stage: 'GF', label: 'Grand Final' },
};

export type LadderEntryLite = {
  teamId: string;
  rank: number;
};

export type SeededFixture = {
  bracketSlot: 'QF1' | 'QF2' | 'EF1' | 'EF2';
  stage: FinalsStageCode;
  label: string;
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: number;
  awaySeed: number;
};

export function seedWeek1FromLadder(top8: LadderEntryLite[]): SeededFixture[] {
  const bySeed = new Map<number, string>();
  const sorted = [...top8].sort((a, b) => a.rank - b.rank).slice(0, 8);
  sorted.forEach((entry, idx) => bySeed.set(idx + 1, entry.teamId));
  if (bySeed.size < 8) return [];
  const make = (slot: SeededFixture['bracketSlot']): SeededFixture => {
    const cfg = WEEK1_PAIRINGS[slot];
    return {
      bracketSlot: slot,
      stage: cfg.stage,
      label: cfg.label,
      homeTeamId: bySeed.get(cfg.homeSeed)!,
      awayTeamId: bySeed.get(cfg.awaySeed)!,
      homeSeed: cfg.homeSeed,
      awaySeed: cfg.awaySeed,
    };
  };
  return [make('QF1'), make('QF2'), make('EF1'), make('EF2')];
}

export type FinalsFixtureLite = {
  id: string;
  bracketSlot: BracketSlot | null;
  status: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeSeed?: number | null;
  awaySeed?: number | null;
  homeTotal?: number | null;
  awayTotal?: number | null;
};

export function getFinalResultRef(fixture: FinalsFixtureLite | undefined, kind: 'winner' | 'loser'): { teamId: string; seed?: number } | null {
  if (!fixture) return null;
  if (String(fixture.status || '').toUpperCase() !== 'FINAL') return null;
  if (fixture.homeTotal == null || fixture.awayTotal == null) return null;
  const homeWon = (fixture.homeTotal as number) > (fixture.awayTotal as number);
  if (kind === 'winner') {
    return homeWon
      ? { teamId: String(fixture.homeTeamId || ''), seed: fixture.homeSeed ?? undefined }
      : { teamId: String(fixture.awayTeamId || ''), seed: fixture.awaySeed ?? undefined };
  }
  return homeWon
    ? { teamId: String(fixture.awayTeamId || ''), seed: fixture.awaySeed ?? undefined }
    : { teamId: String(fixture.homeTeamId || ''), seed: fixture.homeSeed ?? undefined };
}

export type DerivedSlotPlaceholder = {
  bracketSlot: 'SF1' | 'SF2' | 'PF1' | 'PF2' | 'GF';
  stage: FinalsStageCode;
  label: string;
  homeLabel: string;
  awayLabel: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeSeed?: number;
  awaySeed?: number;
};

function refLabel(ref: DerivedRef): string {
  if (ref.kind === 'team') return `Seed ${ref.seed ?? '?'}`;
  return `${ref.kind === 'winner' ? 'Winner' : 'Loser'} ${ref.from}`;
}

export function derivedPlaceholders(fixturesBySlot: Map<BracketSlot, FinalsFixtureLite>): DerivedSlotPlaceholder[] {
  const out: DerivedSlotPlaceholder[] = [];
  (Object.keys(FINALS_PROGRESSION) as Array<keyof typeof FINALS_PROGRESSION>).forEach((slot) => {
    const cfg = FINALS_PROGRESSION[slot];
    const homeRef = cfg.home;
    const awayRef = cfg.away;
    const homeFromFixture = homeRef.kind !== 'team' ? fixturesBySlot.get(homeRef.from) : undefined;
    const awayFromFixture = awayRef.kind !== 'team' ? fixturesBySlot.get(awayRef.from) : undefined;
    const home = homeRef.kind !== 'team' ? getFinalResultRef(homeFromFixture, homeRef.kind) : null;
    const away = awayRef.kind !== 'team' ? getFinalResultRef(awayFromFixture, awayRef.kind) : null;
    out.push({
      bracketSlot: slot,
      stage: cfg.stage,
      label: cfg.label,
      homeLabel: home ? '' : refLabel(homeRef),
      awayLabel: away ? '' : refLabel(awayRef),
      homeTeamId: home?.teamId,
      awayTeamId: away?.teamId,
      homeSeed: home?.seed,
      awaySeed: away?.seed,
    });
  });
  return out;
}

export function bracketSlotForStage(stage: FinalsStageCode | string): BracketSlot[] {
  const s = String(stage || '').toUpperCase();
  if (s === 'QF') return ['QF1', 'QF2'];
  if (s === 'EF') return ['EF1', 'EF2'];
  if (s === 'SF') return ['SF1', 'SF2'];
  if (s === 'PF') return ['PF1', 'PF2'];
  if (s === 'GF') return ['GF'];
  return [];
}

export function isWeek1Slot(slot: BracketSlot | null | undefined): boolean {
  return slot === 'QF1' || slot === 'QF2' || slot === 'EF1' || slot === 'EF2';
}
