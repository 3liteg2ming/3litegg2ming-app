import type { FixtureRow } from './fixturesRepo';
import type { TeamKey } from './teamAssets';

export type H2HMeeting = {
  roundLabel: string;
  round: number;
  teamAScore: number;
  teamBScore: number;
  winner: 'A' | 'B' | 'DRAW';
  fixtureId: string;
};

export type H2HBiggestWin = {
  winner: 'A' | 'B';
  margin: number;
  winnerScore: number;
  loserScore: number;
  roundLabel: string;
  round: number;
};

export type H2HStreak = {
  team: 'A' | 'B' | null; // null when last result was a draw
  count: number;
};

export type H2HResult = {
  totalMatches: number;
  teamAWins: number;
  teamBWins: number;
  draws: number;
  teamATotalPoints: number;
  teamBTotalPoints: number;
  biggestWin: H2HBiggestWin | null;
  currentStreak: H2HStreak;
  averageMargin: number;
  last5: H2HMeeting[];
  meetings: H2HMeeting[];
};

export function computeH2HStats(
  fixtures: FixtureRow[],
  teamA: TeamKey,
  teamB: TeamKey,
): H2HResult {
  // Filter to completed matches between teamA and teamB
  const h2h = fixtures.filter((f) => {
    if (!f.is_final || f.home_total == null || f.away_total == null) return false;
    const hk = f.home_team_key;
    const ak = f.away_team_key;
    if (!hk || !ak) return false;
    return (hk === teamA && ak === teamB) || (hk === teamB && ak === teamA);
  });

  // Sort by round descending (most recent first)
  h2h.sort((a, b) => b.round - a.round);

  const meetings: H2HMeeting[] = [];
  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let teamATotalPoints = 0;
  let teamBTotalPoints = 0;
  let biggestWin: H2HBiggestWin | null = null;
  let totalMargin = 0;

  for (const f of h2h) {
    const isAHome = f.home_team_key === teamA;
    const aScore = isAHome ? (f.home_total ?? 0) : (f.away_total ?? 0);
    const bScore = isAHome ? (f.away_total ?? 0) : (f.home_total ?? 0);

    teamATotalPoints += aScore;
    teamBTotalPoints += bScore;

    let winner: 'A' | 'B' | 'DRAW';
    if (aScore > bScore) {
      winner = 'A';
      teamAWins++;
    } else if (bScore > aScore) {
      winner = 'B';
      teamBWins++;
    } else {
      winner = 'DRAW';
      draws++;
    }

    const margin = Math.abs(aScore - bScore);
    totalMargin += margin;

    if (winner !== 'DRAW' && (biggestWin === null || margin > biggestWin.margin)) {
      biggestWin = {
        winner,
        margin,
        winnerScore: Math.max(aScore, bScore),
        loserScore: Math.min(aScore, bScore),
        roundLabel: f.round_label || `Round ${f.round}`,
        round: f.round,
      };
    }

    meetings.push({
      roundLabel: f.round_label || `Round ${f.round}`,
      round: f.round,
      teamAScore: aScore,
      teamBScore: bScore,
      winner,
      fixtureId: f.id,
    });
  }

  // Current streak: walk from most recent, count consecutive wins by the same team
  const currentStreak: H2HStreak = { team: null, count: 0 };
  if (meetings.length > 0) {
    const first = meetings[0];
    if (first.winner === 'DRAW') {
      currentStreak.team = null;
      currentStreak.count = 1;
      for (let i = 1; i < meetings.length; i++) {
        if (meetings[i].winner === 'DRAW') currentStreak.count++;
        else break;
      }
    } else {
      currentStreak.team = first.winner;
      currentStreak.count = 1;
      for (let i = 1; i < meetings.length; i++) {
        if (meetings[i].winner === first.winner) currentStreak.count++;
        else break;
      }
    }
  }

  const totalMatches = h2h.length;
  const averageMargin = totalMatches > 0 ? Math.round((totalMargin / totalMatches) * 10) / 10 : 0;

  return {
    totalMatches,
    teamAWins,
    teamBWins,
    draws,
    teamATotalPoints,
    teamBTotalPoints,
    biggestWin,
    currentStreak,
    averageMargin,
    last5: meetings.slice(0, 5),
    meetings,
  };
}
