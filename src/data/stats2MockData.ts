import { getHeadshot } from './statsData';
import { getTeamAssets } from '@/lib/teamAssets';
import type { Player, Team } from '@/types/stats2';

function hs(name: string) {
  return getHeadshot(name) || '';
}

// NOTE: These are demo values to power the Lovable UI pixel-for-pixel.
// Once your season pipeline is live, we can replace this with real totals.

export const mockPlayers: Player[] = [
  {
    id: 'p1',
    name: 'Jeremy Cameron',
    teamName: 'Geelong Cats',
    headshotUrl: hs('Jeremy Cameron'),
    gamesPlayed: 24,
    stats: {
      goals: 88,
      disposals: 310,
      marks: 120,
      tackles: 48,
      fantasyPoints: 2150,
    },
  },
  {
    id: 'p2',
    name: 'Jack Gunston',
    teamName: 'Hawthorn Hawks',
    headshotUrl: hs('Jack Gunston'),
    gamesPlayed: 24,
    stats: {
      goals: 73,
      disposals: 205,
      marks: 92,
      tackles: 34,
      fantasyPoints: 1680,
    },
  },
  {
    id: 'p3',
    name: 'Ben King',
    teamName: 'Gold Coast Suns',
    headshotUrl: hs('Ben King'),
    gamesPlayed: 24,
    stats: {
      goals: 71,
      disposals: 190,
      marks: 88,
      tackles: 22,
      fantasyPoints: 1550,
    },
  },
  {
    id: 'p4',
    name: 'Aaron Naughton',
    teamName: 'Western Bulldogs',
    headshotUrl: hs('Aaron Naughton'),
    gamesPlayed: 24,
    stats: {
      goals: 60,
      disposals: 245,
      marks: 96,
      tackles: 41,
      fantasyPoints: 1760,
    },
  },
  {
    id: 'p5',
    name: 'Riley Thilthorpe',
    teamName: 'Adelaide Crows',
    headshotUrl: hs('Riley Thilthorpe'),
    gamesPlayed: 24,
    stats: {
      goals: 60,
      disposals: 178,
      marks: 75,
      tackles: 36,
      fantasyPoints: 1490,
    },
  },
  {
    id: 'p6',
    name: 'Nick Daicos',
    teamName: 'Collingwood Magpies',
    headshotUrl: hs('Nick Daicos'),
    gamesPlayed: 24,
    stats: {
      goals: 18,
      disposals: 650,
      marks: 128,
      tackles: 74,
      fantasyPoints: 2620,
    },
  },
  {
    id: 'p7',
    name: 'Lachie Neale',
    teamName: 'Brisbane Lions',
    headshotUrl: hs('Lachie Neale'),
    gamesPlayed: 24,
    stats: {
      goals: 22,
      disposals: 620,
      marks: 104,
      tackles: 92,
      fantasyPoints: 2550,
    },
  },
  {
    id: 'p8',
    name: 'Tom Green',
    teamName: 'GWS Giants',
    headshotUrl: hs('Tom Green'),
    gamesPlayed: 24,
    stats: {
      goals: 12,
      disposals: 590,
      marks: 88,
      tackles: 86,
      fantasyPoints: 2410,
    },
  },
  {
    id: 'p9',
    name: 'Marcus Bontempelli',
    teamName: 'Western Bulldogs',
    headshotUrl: hs('Marcus Bontempelli'),
    gamesPlayed: 24,
    stats: {
      goals: 26,
      disposals: 580,
      marks: 110,
      tackles: 96,
      fantasyPoints: 2500,
    },
  },
  {
    id: 'p10',
    name: 'Noah Anderson',
    teamName: 'Gold Coast Suns',
    headshotUrl: hs('Noah Anderson'),
    gamesPlayed: 24,
    stats: {
      goals: 14,
      disposals: 540,
      marks: 102,
      tackles: 80,
      fantasyPoints: 2300,
    },
  },
];

export const mockTeams: Team[] = [
  {
    id: 't1',
    name: 'Brisbane Lions',
    logoUrl: getTeamAssets('Brisbane Lions').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 10033,
      goals: 310,
      marks: 2900,
      tackles: 1850,
      goalEfficiency: 53.1,
    },
  },
  {
    id: 't2',
    name: 'Hawthorn Hawks',
    logoUrl: getTeamAssets('Hawthorn Hawks').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 9537,
      goals: 295,
      marks: 2700,
      tackles: 1720,
      goalEfficiency: 50.4,
    },
  },
  {
    id: 't3',
    name: 'Geelong Cats',
    logoUrl: getTeamAssets('Geelong Cats').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 9145,
      goals: 305,
      marks: 2820,
      tackles: 1650,
      goalEfficiency: 52.6,
    },
  },
  {
    id: 't4',
    name: 'Gold Coast Suns',
    logoUrl: getTeamAssets('Gold Coast Suns').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 8800,
      goals: 280,
      marks: 2600,
      tackles: 1600,
      goalEfficiency: 49.8,
    },
  },
  {
    id: 't5',
    name: 'Collingwood Magpies',
    logoUrl: getTeamAssets('Collingwood Magpies').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 8752,
      goals: 290,
      marks: 2750,
      tackles: 1700,
      goalEfficiency: 51.3,
    },
  },
  {
    id: 't6',
    name: 'Adelaide Crows',
    logoUrl: getTeamAssets('Adelaide Crows').logo,
    gamesPlayed: 24,
    stats: {
      disposals: 8737,
      goals: 285,
      marks: 2550,
      tackles: 1680,
      goalEfficiency: 48.9,
    },
  },
];
