// src/lib/stats-cache.ts
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';

export type RosterData = {
  players: AflPlayer[];
};

let cached: { at: number; data: RosterData } | null = null;
const TTL_MS = 60_000;

export async function fetchRosterData(force = false): Promise<RosterData> {
  const now = Date.now();
  if (!force && cached && now - cached.at < TTL_MS) return cached.data;

  try {
    const players = await fetchAflPlayers();
    const data = { players: Array.isArray(players) ? players : [] };
    cached = { at: now, data };
    return data;
  } catch (e: any) {
    // Never crash the UI – return empty safely
    return { players: [] };
  }
}

export function clearRosterCache() {
  cached = null;
}
