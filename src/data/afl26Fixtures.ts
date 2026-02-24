import type { TeamKey } from '../lib/teamAssets';

export type ScoreLine = {
  total: number;
  goals: number;
  behinds: number;
};

export type Afl26Match = {
  id: string;
  round: number;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  venue?: string;
  startLabel?: string;

  home: TeamKey;
  away: TeamKey;

  homePsn?: string;
  awayPsn?: string;

  homeScore?: ScoreLine;
  awayScore?: ScoreLine;
};

export type Afl26Round = {
  round: number;
  label: string;
  matches: Afl26Match[];
};

const TEAMS_12: TeamKey[] = [
  'adelaide',
  'northmelbourne',
  'carlton',
  'collingwood',
  'essendon',
  'geelong',
  'richmond',
  'stkilda',
  'sydney',
  'westcoast',
  'westernbulldogs',
  'brisbane',
];

// Round-robin generator (stable, simple)
function generateRoundRobin(teams: TeamKey[]) {
  const list = [...teams];
  const rounds: Array<Array<[TeamKey, TeamKey]>> = [];
  const n = list.length;

  // circle method (even n)
  for (let r = 0; r < n - 1; r++) {
    const pairings: Array<[TeamKey, TeamKey]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      pairings.push([home, away]);
    }
    rounds.push(pairings);

    // rotate all except first
    const fixed = list[0];
    const rest = list.slice(1);
    rest.unshift(rest.pop() as TeamKey);
    list.splice(0, list.length, fixed, ...rest);
  }

  return rounds;
}

export function getAfl26Rounds(): Afl26Round[] {
  const rr = generateRoundRobin(TEAMS_12);
  const totalRounds = 11;

  return Array.from({ length: totalRounds }).map((_, idx) => {
    const roundNum = idx + 1;
    const pairings = rr[idx % rr.length];

    const matches: Afl26Match[] = pairings.map(([home, away], i) => {
      const id = `R${roundNum}-M${i + 1}`;

      // One “featured” final match so Match Centre has real-looking numbers
      const isFeatured = roundNum === 3 && i === 0;

      return {
        id,
        round: roundNum,
        status: isFeatured ? 'FINAL' : 'SCHEDULED',
        venue: isFeatured ? 'Adelaide Oval, Adelaide • Kaurna' : 'MCG, Melbourne',
        startLabel: isFeatured ? 'Sun 30 Mar 2025, 3:20 PM' : 'Sat 7:30 PM',
        home,
        away,
        homePsn: isFeatured ? 'eliteyoda10' : 'PSN',
        awayPsn: isFeatured ? 'coach_nmfc' : 'PSN',
        homeScore: isFeatured ? { total: 114, goals: 17, behinds: 12 } : undefined,
        awayScore: isFeatured ? { total: 78, goals: 12, behinds: 6 } : undefined,
      };
    });

    return {
      round: roundNum,
      label: `Round ${roundNum}`,
      matches,
    };
  });
}
