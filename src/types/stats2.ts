export type StatsMode = 'players' | 'teams';
export type StatsScope = 'total' | 'average';

// Player keys shown in the Lovable design rail
export type PlayerStatKey = 'goals' | 'disposals' | 'marks' | 'tackles' | 'fantasyPoints';

// Team keys shown in the Lovable design rail
export type TeamStatKey = 'goals' | 'disposals' | 'marks' | 'tackles' | 'goalEfficiency';

export type StatConfig = {
  key: PlayerStatKey | TeamStatKey;
  label: string;
  abbreviation: string;
};

export type Player = {
  id: string;
  name: string;
  teamName: string;
  headshotUrl: string;
  gamesPlayed: number;
  stats: Record<PlayerStatKey, number>;
};

export type Team = {
  id: string;
  name: string;
  logoUrl: string;
  gamesPlayed: number;
  stats: Record<TeamStatKey, number>;
};

// Keep these arrays in the SAME order as the Lovable design expects.
export const PLAYER_STAT_CONFIGS: StatConfig[] = [
  { key: 'goals', label: 'Goals', abbreviation: 'G' },
  { key: 'disposals', label: 'Disposals', abbreviation: 'D' },
  { key: 'marks', label: 'Marks', abbreviation: 'M' },
  { key: 'tackles', label: 'Tackles', abbreviation: 'T' },
  { key: 'fantasyPoints', label: 'Fantasy Points', abbreviation: 'FP' },
];

export const TEAM_STAT_CONFIGS: StatConfig[] = [
  { key: 'disposals', label: 'Disposals', abbreviation: 'D' },
  { key: 'goals', label: 'Goals', abbreviation: 'G' },
  { key: 'marks', label: 'Marks', abbreviation: 'M' },
  { key: 'tackles', label: 'Tackles', abbreviation: 'T' },
  { key: 'goalEfficiency', label: 'Goal Efficiency', abbreviation: '%' },
];
