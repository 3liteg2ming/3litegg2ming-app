export type StatsMode = 'players' | 'teams';
export type StatsScope = 'total' | 'average';

// Player keys shown in the Lovable design rail
export type PlayerStatKey = 'goals' | 'disposals' | 'marks' | 'tackles' | 'clearances' | 'fantasyPoints';

export type TeamStatKey =
  | 'goals'
  | 'disposals'
  | 'kicks'
  | 'handballs'
  | 'inside50s'
  | 'rebound50s'
  | 'freesFor'
  | 'fiftyMetrePenalties'
  | 'hitOuts'
  | 'clearances'
  | 'contestedPossessions'
  | 'uncontestedPossessions'
  | 'marks'
  | 'contestedMarks'
  | 'interceptMarks'
  | 'tackles'
  | 'spoils'
  | 'goalEfficiency';

export type PlayerStatConfig = {
  key: PlayerStatKey;
  label: string;
  abbreviation: string;
};

export type TeamStatConfig = {
  key: TeamStatKey;
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
export const PLAYER_STAT_CONFIGS: PlayerStatConfig[] = [
  { key: 'goals', label: 'Goals', abbreviation: 'G' },
  { key: 'disposals', label: 'Disposals', abbreviation: 'D' },
  { key: 'marks', label: 'Marks', abbreviation: 'M' },
  { key: 'tackles', label: 'Tackles', abbreviation: 'T' },
  { key: 'clearances', label: 'Clearances', abbreviation: 'CLR' },
  { key: 'fantasyPoints', label: 'Fantasy Points', abbreviation: 'FP' },
];

export const TEAM_STAT_CONFIGS: TeamStatConfig[] = [
  { key: 'disposals', label: 'Disposals', abbreviation: 'D' },
  { key: 'kicks', label: 'Kicks', abbreviation: 'K' },
  { key: 'handballs', label: 'Handballs', abbreviation: 'HB' },
  { key: 'inside50s', label: 'Inside 50s', abbreviation: 'I50' },
  { key: 'rebound50s', label: 'Rebound 50s', abbreviation: 'R50' },
  { key: 'freesFor', label: 'Frees For', abbreviation: 'FF' },
  { key: 'fiftyMetrePenalties', label: '50m Penalties', abbreviation: '50M' },
  { key: 'hitOuts', label: 'Hit Outs', abbreviation: 'HO' },
  { key: 'clearances', label: 'Clearances', abbreviation: 'CLR' },
  { key: 'contestedPossessions', label: 'Contested Possessions', abbreviation: 'CP' },
  { key: 'uncontestedPossessions', label: 'Uncontested Possessions', abbreviation: 'UP' },
  { key: 'goals', label: 'Goals', abbreviation: 'G' },
  { key: 'marks', label: 'Marks', abbreviation: 'M' },
  { key: 'contestedMarks', label: 'Contested Marks', abbreviation: 'CM' },
  { key: 'interceptMarks', label: 'Intercept Marks', abbreviation: 'IM' },
  { key: 'tackles', label: 'Tackles', abbreviation: 'T' },
  { key: 'spoils', label: 'Spoils', abbreviation: 'SP' },
  { key: 'goalEfficiency', label: 'Goal Efficiency', abbreviation: '%' },
];
