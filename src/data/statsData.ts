import { playerHeadshotByName } from "./playerHeadshotByName";

export interface StatPlayer {
  id: string;
  name: string;
  team: string;
  value: number;
  headshotUrl?: string;
}

export interface StatCategory {
  label: string;
  accent: string;
  players: StatPlayer[];
}

export interface TeamStat {
  id: string;
  name: string;
  value: number;
}

export interface TeamStatCategory {
  label: string;
  accent: string;
  teams: TeamStat[];
}

function norm(s?: string) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function getHeadshot(name?: string) {
  const key = norm(name);
  return playerHeadshotByName[key];
}

// AFL fantasy CDN logos (works instantly, no local assets needed)
export const teamLogos: Record<string, string> = {
  "Adelaide Crows": "https://fantasy.afl.com.au/assets/media/teams/afl/Adelaide-Crows.png",
  "Brisbane Lions": "https://fantasy.afl.com.au/assets/media/teams/afl/Brisbane-Lions.png",
  "Collingwood Magpies": "https://fantasy.afl.com.au/assets/media/teams/afl/Collingwood-Magpies.png",
  "Geelong Cats": "https://fantasy.afl.com.au/assets/media/teams/afl/Geelong-Cats.png",
  "Gold Coast Suns": "https://fantasy.afl.com.au/assets/media/teams/afl/Gold-Coast-Suns.png",
  "Hawthorn Hawks": "https://fantasy.afl.com.au/assets/media/teams/afl/Hawthorn-Hawks.png",
  "Port Adelaide Power": "https://fantasy.afl.com.au/assets/media/teams/afl/Port-Adelaide-Power.png",
  "Western Bulldogs": "https://fantasy.afl.com.au/assets/media/teams/afl/Western-Bulldogs.png",
  "Essendon Bombers": "https://fantasy.afl.com.au/assets/media/teams/afl/Essendon-Bombers.png",
  "Melbourne Demons": "https://fantasy.afl.com.au/assets/media/teams/afl/Melbourne-Demons.png",
  "GWS Giants": "https://fantasy.afl.com.au/assets/media/teams/afl/GWS-Giants.png",
  "St Kilda Saints": "https://fantasy.afl.com.au/assets/media/teams/afl/St-Kilda-Saints.png",
};

export const playerLeaderCategories: StatCategory[] = [
  {
    label: "Goals",
    accent: "hsl(270, 70%, 55%)",
    players: [
      { id: "g1", name: "Jeremy Cameron", team: "Geelong Cats", value: 88, headshotUrl: getHeadshot("Jeremy Cameron") },
      { id: "g2", name: "Jack Gunston", team: "Hawthorn Hawks", value: 73, headshotUrl: getHeadshot("Jack Gunston") },
      { id: "g3", name: "Ben King", team: "Gold Coast Suns", value: 71, headshotUrl: getHeadshot("Ben King") },
      { id: "g4", name: "Aaron Naughton", team: "Western Bulldogs", value: 60, headshotUrl: getHeadshot("Aaron Naughton") },
      { id: "g5", name: "Riley Thilthorpe", team: "Adelaide Crows", value: 60, headshotUrl: getHeadshot("Riley Thilthorpe") },
      { id: "g6", name: "Jamie Elliott", team: "Collingwood Magpies", value: 60, headshotUrl: getHeadshot("Jamie Elliott") },
      { id: "g7", name: "Mitch Georgiades", team: "Port Adelaide Power", value: 58, headshotUrl: getHeadshot("Mitch Georgiades") },
      { id: "g8", name: "Logan Morris", team: "Brisbane Lions", value: 53, headshotUrl: getHeadshot("Logan Morris") },
    ],
  },
  // Add more player categories later (Disposals, Marks, Tackles, etc.)
];

export const teamLeaderCategories: TeamStatCategory[] = [
  {
    label: "Disposals (Total)",
    accent: "hsl(215, 80%, 55%)",
    teams: [
      { id: "d1", name: "Brisbane Lions", value: 10033 },
      { id: "d2", name: "Hawthorn Hawks", value: 9537 },
      { id: "d3", name: "Geelong Cats", value: 9145 },
      { id: "d4", name: "Gold Coast Suns", value: 8800 },
      { id: "d5", name: "Collingwood Magpies", value: 8752 },
      { id: "d6", name: "Adelaide Crows", value: 8737 },
      { id: "d7", name: "GWS Giants", value: 8708 },
      { id: "d8", name: "Western Bulldogs", value: 8646 },
    ],
  },
  // Add more team categories later (Tackles, Marks, Goals, Efficiency, etc.)
];

export const allPlayers = playerLeaderCategories
  .flatMap((c) => c.players)
  .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);

export const allTeamNames = [...new Set(teamLeaderCategories.flatMap((c) => c.teams.map((t) => t.name)))];
