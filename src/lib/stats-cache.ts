// src/lib/stats-cache.ts
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';

export type RosterData = {
  players: AflPlayer[];
};

let cached: { at: number; data: RosterData } | null = null;
const TTL_MS = 60_000;
const STORAGE_PREFIX = 'eg_stats_roster_cache';
const CACHE_VERSION = '2026-02-27-v2';
const STORAGE_VERSION_KEY = `${STORAGE_PREFIX}:version`;
let storageChecked = false;

function safeWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  return window;
}

function getContextKey() {
  const comp = getStoredCompetitionKey();
  const season = getDataSeasonSlugForCompetition(comp);
  return `${comp}:${season}`;
}

function ensureStorageVersion() {
  const w = safeWindow();
  if (!w || storageChecked) return;
  storageChecked = true;
  const current = w.localStorage.getItem(STORAGE_VERSION_KEY);
  if (current === CACHE_VERSION) return;
  for (let i = w.localStorage.length - 1; i >= 0; i -= 1) {
    const key = w.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(`${STORAGE_PREFIX}:`)) {
      w.localStorage.removeItem(key);
    }
  }
  w.localStorage.setItem(STORAGE_VERSION_KEY, CACHE_VERSION);
}

function storageKey() {
  return `${STORAGE_PREFIX}:${CACHE_VERSION}:${getContextKey()}`;
}

export async function fetchRosterData(force = false): Promise<RosterData> {
  const now = Date.now();
  if (!force && cached && now - cached.at < TTL_MS) return cached.data;

  const w = safeWindow();
  ensureStorageVersion();
  if (!force && w) {
    try {
      const raw = w.localStorage.getItem(storageKey());
      if (raw) {
        const parsed = JSON.parse(raw) as { at?: number; data?: RosterData };
        if (parsed?.data && Number.isFinite(parsed.at) && now - Number(parsed.at) < TTL_MS) {
          cached = { at: Number(parsed.at), data: parsed.data };
          return parsed.data;
        }
      }
    } catch {
      // ignore storage parse errors
    }
  }

  try {
    const players = await fetchAflPlayers();
    const data = { players: Array.isArray(players) ? players : [] };
    cached = { at: now, data };
    if (w) {
      try {
        w.localStorage.setItem(storageKey(), JSON.stringify({ at: now, data }));
      } catch {
        // ignore storage write errors
      }
    }
    return data;
  } catch (e: any) {
    // Never crash the UI – return empty safely
    return { players: [] };
  }
}

export function clearRosterCache() {
  cached = null;
  const w = safeWindow();
  if (!w) return;
  ensureStorageVersion();
  for (let i = w.localStorage.length - 1; i >= 0; i -= 1) {
    const key = w.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(`${STORAGE_PREFIX}:${CACHE_VERSION}:`)) {
      w.localStorage.removeItem(key);
    }
  }
}
