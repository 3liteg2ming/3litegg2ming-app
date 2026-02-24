import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';

export const matchData = {
  round: 14,
  date: 'Saturday 15 June 2025',
  venue: 'Melbourne Cricket Ground',
  attendance: '87,421',
  status: 'FULL TIME',
  home: {
    key: 'collingwood' as TeamKey,
    name: 'Collingwood',
    abbreviation: 'COL',
    fullName: 'Collingwood',
    color: TEAM_ASSETS.collingwood.primary,
    colorHsl: '0 0% 6%',
    secondaryColor: '#FFFFFF',
    goals: 14,
    behinds: 9,
    score: 93,
  },
  away: {
    key: 'sydney' as TeamKey,
    name: 'Sydney Swans',
    abbreviation: 'SYD',
    fullName: 'Sydney',
    color: TEAM_ASSETS.sydney.primary,
    colorHsl: '358 86% 51%',
    secondaryColor: '#FFFFFF',
    goals: 12,
    behinds: 11,
    score: 83,
  },
  margin: 10,
};

// Timeline worm data — score margin over time (positive = home leading)
export const timelineData = [
  { time: 0, margin: 0, quarter: 1 },
  { time: 2, margin: 6, quarter: 1 },
  { time: 5, margin: 6, quarter: 1 },
  { time: 8, margin: 12, quarter: 1 },
  { time: 10, margin: 6, quarter: 1 },
  { time: 13, margin: 6, quarter: 1 },
  { time: 16, margin: 12, quarter: 1 },
  { time: 19, margin: 8, quarter: 1 },
  { time: 22, margin: 14, quarter: 1 },
  { time: 25, margin: 10, quarter: 1 },
  { time: 28, margin: 10, quarter: 2 },
  { time: 31, margin: 4, quarter: 2 },
  { time: 34, margin: 4, quarter: 2 },
  { time: 37, margin: -2, quarter: 2 },
  { time: 40, margin: 4, quarter: 2 },
  { time: 43, margin: 10, quarter: 2 },
  { time: 46, margin: 10, quarter: 2 },
  { time: 49, margin: 16, quarter: 2 },
  { time: 52, margin: 12, quarter: 2 },
  { time: 55, margin: 12, quarter: 3 },
  { time: 58, margin: 6, quarter: 3 },
  { time: 61, margin: 6, quarter: 3 },
  { time: 64, margin: 0, quarter: 3 },
  { time: 67, margin: 6, quarter: 3 },
  { time: 70, margin: 12, quarter: 3 },
  { time: 73, margin: 6, quarter: 3 },
  { time: 76, margin: 8, quarter: 3 },
  { time: 79, margin: 8, quarter: 4 },
  { time: 82, margin: 14, quarter: 4 },
  { time: 85, margin: 8, quarter: 4 },
  { time: 88, margin: 14, quarter: 4 },
  { time: 91, margin: 8, quarter: 4 },
  { time: 94, margin: 14, quarter: 4 },
  { time: 97, margin: 10, quarter: 4 },
  { time: 100, margin: 10, quarter: 4 },
];

export const quarterScores = {
  home: [
    { q: 'Q1', goals: 3, behinds: 4, score: 22 },
    { q: 'Q2', goals: 5, behinds: 2, score: 52 },
    { q: 'Q3', goals: 3, behinds: 1, score: 71 },
    { q: 'Q4', goals: 3, behinds: 2, score: 93 },
  ],
  away: [
    { q: 'Q1', goals: 2, behinds: 2, score: 14 },
    { q: 'Q2', goals: 4, behinds: 4, score: 42 },
    { q: 'Q3', goals: 3, behinds: 3, score: 63 },
    { q: 'Q4', goals: 3, behinds: 2, score: 83 },
  ],
};

// Match leaders (photos exist for some)
export const matchLeaders = [
  {
    stat: 'DISPOSALS',
    matchTotal: 32,
    seasonAvg: 26.4,
    player: 'Nick Daicos',
    position: 'MIDFIELDER',
    team: 'Collingwood',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/1023261_450.png',
  },
  {
    stat: 'TACKLES',
    matchTotal: 9,
    seasonAvg: 5.2,
    player: 'Jack Crisp',
    position: 'MIDFIELDER',
    team: 'Collingwood',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/293871_450.png',
  },
  {
    stat: 'CONTESTED POSSESSIONS',
    matchTotal: 18,
    seasonAvg: 12.8,
    player: 'Scott Pendlebury',
    position: 'MIDFIELDER',
    team: 'Collingwood',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/260257_450.png',
  },
  {
    stat: 'MARKS',
    matchTotal: 11,
    seasonAvg: 7.1,
    player: 'Isaac Heeney',
    position: 'FORWARD',
    team: 'Sydney Swans',
    photoUrl: undefined,
  },
  {
    stat: 'GOALS',
    matchTotal: 4,
    seasonAvg: 2.3,
    player: 'Jamie Elliott',
    position: 'FORWARD',
    team: 'Collingwood',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/293801_450.png',
  },
];

export interface PlayerStat {
  name: string;
  team: string;
  number: number;
  position: string;
  photoUrl?: string;
  AF: number;
  G: number;
  B: number;
  D: number;
  K: number;
  H: number;
  M: number;
  T: number;
  HO: number;
  CLR: number;
  MG: number;
  GA: number;
  TOG: number;
}

export const playerStats: PlayerStat[] = [
  // Collingwood
  {
    name: 'Nick Daicos',
    team: 'Collingwood',
    number: 35,
    position: 'MID',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/1023261_450.png',
    AF: 142, G: 1, B: 1, D: 32, K: 20, H: 12, M: 8, T: 5, HO: 0, CLR: 6, MG: 612, GA: 2, TOG: 88,
  },
  {
    name: 'Scott Pendlebury',
    team: 'Collingwood',
    number: 10,
    position: 'MID',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/260257_450.png',
    AF: 118, G: 0, B: 1, D: 28, K: 16, H: 12, M: 6, T: 4, HO: 0, CLR: 4, MG: 480, GA: 1, TOG: 85,
  },
  {
    name: 'Jack Crisp',
    team: 'Collingwood',
    number: 25,
    position: 'MID',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/293871_450.png',
    AF: 112, G: 1, B: 0, D: 24, K: 14, H: 10, M: 5, T: 9, HO: 0, CLR: 5, MG: 445, GA: 1, TOG: 90,
  },
  {
    name: 'Jordan De Goey',
    team: 'Collingwood',
    number: 2,
    position: 'FWD',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/994185_450.png',
    AF: 105, G: 3, B: 1, D: 18, K: 12, H: 6, M: 4, T: 3, HO: 0, CLR: 3, MG: 520, GA: 3, TOG: 82,
  },
  {
    name: 'Jamie Elliott',
    team: 'Collingwood',
    number: 5,
    position: 'FWD',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/293801_450.png',
    AF: 98, G: 4, B: 0, D: 14, K: 10, H: 4, M: 6, T: 2, HO: 0, CLR: 1, MG: 390, GA: 4, TOG: 78,
  },
  {
    name: 'Darcy Moore',
    team: 'Collingwood',
    number: 32,
    position: 'DEF',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/298288_450.png',
    AF: 88, G: 0, B: 0, D: 22, K: 15, H: 7, M: 9, T: 2, HO: 0, CLR: 0, MG: 310, GA: 0, TOG: 92,
  },
  {
    name: 'Brayden Maynard',
    team: 'Collingwood',
    number: 37,
    position: 'DEF',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/992010_450.png',
    AF: 82, G: 0, B: 1, D: 20, K: 13, H: 7, M: 5, T: 3, HO: 0, CLR: 1, MG: 285, GA: 0, TOG: 88,
  },
  {
    name: 'Dan Houston',
    team: 'Collingwood',
    number: 9,
    position: 'DEF',
    photoUrl: 'https://fantasy.afl.com.au/assets/media/players/afl/994295_450.png',
    AF: 95, G: 1, B: 0, D: 25, K: 17, H: 8, M: 7, T: 2, HO: 0, CLR: 2, MG: 410, GA: 1, TOG: 86,
  },

  // Sydney
  {
    name: 'Isaac Heeney',
    team: 'Sydney Swans',
    number: 5,
    position: 'FWD',
    photoUrl: undefined,
    AF: 125, G: 3, B: 2, D: 22, K: 14, H: 8, M: 11, T: 4, HO: 0, CLR: 3, MG: 550, GA: 3, TOG: 86,
  },
  {
    name: 'Chad Warner',
    team: 'Sydney Swans',
    number: 1,
    position: 'MID',
    photoUrl: undefined,
    AF: 120, G: 2, B: 1, D: 26, K: 16, H: 10, M: 5, T: 6, HO: 0, CLR: 5, MG: 510, GA: 2, TOG: 88,
  },
  {
    name: 'Errol Gulden',
    team: 'Sydney Swans',
    number: 21,
    position: 'MID',
    photoUrl: undefined,
    AF: 108, G: 1, B: 0, D: 24, K: 15, H: 9, M: 4, T: 5, HO: 0, CLR: 4, MG: 465, GA: 1, TOG: 85,
  },
  {
    name: 'James Rowbottom',
    team: 'Sydney Swans',
    number: 8,
    position: 'MID',
    photoUrl: undefined,
    AF: 95, G: 0, B: 1, D: 20, K: 11, H: 9, M: 3, T: 7, HO: 0, CLR: 6, MG: 380, GA: 0, TOG: 82,
  },
  {
    name: 'Tom Papley',
    team: 'Sydney Swans',
    number: 11,
    position: 'FWD',
    photoUrl: undefined,
    AF: 85, G: 2, B: 1, D: 14, K: 9, H: 5, M: 3, T: 3, HO: 0, CLR: 1, MG: 340, GA: 2, TOG: 76,
  },
  {
    name: 'Dane Rampe',
    team: 'Sydney Swans',
    number: 24,
    position: 'DEF',
    photoUrl: undefined,
    AF: 78, G: 0, B: 0, D: 18, K: 12, H: 6, M: 7, T: 2, HO: 0, CLR: 0, MG: 265, GA: 0, TOG: 90,
  },
  {
    name: 'Logan McDonald',
    team: 'Sydney Swans',
    number: 6,
    position: 'FWD',
    photoUrl: undefined,
    AF: 72, G: 2, B: 2, D: 10, K: 6, H: 4, M: 5, T: 1, HO: 0, CLR: 0, MG: 290, GA: 2, TOG: 74,
  },
];

export interface TeamStatRow {
  label: string;
  homeMatch: number;
  awayMatch: number;
  homeSeasonAvg: number;
  homeSeasonTotal: number;
  awaySeasonAvg: number;
  awaySeasonTotal: number;
  isPercentage?: boolean;
}

export const teamStatsGroups: { category: string; stats: TeamStatRow[] }[] = [
  {
    category: 'Disposals',
    stats: [
      { label: 'Disposals', homeMatch: 345, awayMatch: 328, homeSeasonAvg: 360.2, homeSeasonTotal: 1801, awaySeasonAvg: 348.8, awaySeasonTotal: 1744 },
      { label: 'Kicks', homeMatch: 210, awayMatch: 195, homeSeasonAvg: 218.4, homeSeasonTotal: 1092, awaySeasonAvg: 212.6, awaySeasonTotal: 1063 },
      { label: 'Handballs', homeMatch: 135, awayMatch: 133, homeSeasonAvg: 141.8, homeSeasonTotal: 709, awaySeasonAvg: 136.2, awaySeasonTotal: 681 },
      { label: 'Inside 50s', homeMatch: 58, awayMatch: 52, homeSeasonAvg: 54.6, homeSeasonTotal: 273, awaySeasonAvg: 51.4, awaySeasonTotal: 257 },
      { label: 'Disposal Efficiency', homeMatch: 72.8, awayMatch: 68.4, homeSeasonAvg: 71.2, homeSeasonTotal: 0, awaySeasonAvg: 69.8, awaySeasonTotal: 0, isPercentage: true },
    ],
  },
  {
    category: 'Stoppages',
    stats: [
      { label: 'Hit-Outs', homeMatch: 42, awayMatch: 35, homeSeasonAvg: 38.4, homeSeasonTotal: 192, awaySeasonAvg: 36.2, awaySeasonTotal: 181 },
      { label: 'Clearances', homeMatch: 40, awayMatch: 36, homeSeasonAvg: 38.6, homeSeasonTotal: 193, awaySeasonAvg: 37.4, awaySeasonTotal: 187 },
      { label: 'Centre Clearances', homeMatch: 14, awayMatch: 11, homeSeasonAvg: 12.8, homeSeasonTotal: 64, awaySeasonAvg: 11.6, awaySeasonTotal: 58 },
      { label: 'Stoppage Clearances', homeMatch: 26, awayMatch: 25, homeSeasonAvg: 25.8, homeSeasonTotal: 129, awaySeasonAvg: 25.8, awaySeasonTotal: 129 },
    ],
  },
];

export const teamStats: TeamStatRow[] = teamStatsGroups.flatMap((g) => g.stats);
