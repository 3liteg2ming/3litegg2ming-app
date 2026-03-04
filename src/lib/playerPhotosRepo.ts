import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

interface EGPlayer {
  id?: string;
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headshot_url?: string | null;
  photo_url?: string | null;
}

const playerPhotosCache = new Map<string, string | null>();

function normalizeName(name?: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNameCandidates(name?: string): string[] {
  const raw = String(name || '').trim();
  if (!raw) return [];

  const normalized = normalizeName(raw);
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  const out = new Set<string>([raw, normalized, compact]);

  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    out.add(`${parts[0]} ${parts[parts.length - 1]}`);
  }

  return Array.from(out).filter(Boolean);
}

function pickPhoto(row: EGPlayer): string | null {
  return String(row?.headshot_url || row?.photo_url || '').trim() || null;
}

function rowNames(row: EGPlayer): string[] {
  const full = String(row?.full_name || '').trim();
  const display = String(row?.display_name || '').trim();
  const name = String(row?.name || '').trim();
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const combined = `${first} ${last}`.trim();

  return [name, display, full, combined].filter(Boolean).map((x) => normalizeName(x));
}

async function fetchPlayersForNames(playerNames: string[]): Promise<EGPlayer[]> {
  const unique = Array.from(new Set(playerNames.map((n) => normalizeName(n)).filter(Boolean)));
  if (!unique.length) return [];

  const selectAttempts = [
    'id,name,full_name,display_name,first_name,last_name,headshot_url,photo_url',
    'id,name,full_name,display_name,headshot_url,photo_url',
    'id,name,headshot_url,photo_url',
    'id,name,headshot_url',
  ] as const;

  for (const select of selectAttempts) {
    const { data, error } = await supabase
      .from('eg_players')
      .select(select)
      .in('name', unique)
      .limit(5000);

    if (!error) return (data || []) as EGPlayer[];
  }

  for (const select of selectAttempts) {
    const { data, error } = await supabase
      .from('eg_players')
      .select(select)
      .limit(5000);

    if (!error) return (data || []) as EGPlayer[];
  }

  return [];
}

export async function getPlayerPhotoFromSupabase(playerName?: string): Promise<string | null> {
  if (!playerName) return null;
  const normalizedName = normalizeName(playerName);

  if (playerPhotosCache.has(normalizedName)) {
    return playerPhotosCache.get(normalizedName) ?? null;
  }

  const results = await preloadPlayerPhotos([playerName]);
  return results.get(playerName) ?? null;
}

export async function preloadPlayerPhotos(playerNames: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const pending: string[] = [];

  for (const name of playerNames) {
    const normalized = normalizeName(name);
    if (!normalized) {
      results.set(name, null);
      continue;
    }

    if (playerPhotosCache.has(normalized)) {
      results.set(name, playerPhotosCache.get(normalized) ?? null);
      continue;
    }

    pending.push(name);
  }

  if (!pending.length) return results;

  const rows = await fetchPlayersForNames(pending);

  const photoByNormalizedName = new Map<string, string | null>();
  for (const row of rows) {
    const photo = pickPhoto(row);
    for (const n of rowNames(row)) {
      if (!photoByNormalizedName.has(n) || (photo && !photoByNormalizedName.get(n))) {
        photoByNormalizedName.set(n, photo);
      }
    }
  }

  for (const requested of pending) {
    const normalized = normalizeName(requested);
    const candidates = buildNameCandidates(requested).map((x) => normalizeName(x));

    let photo: string | null = null;
    for (const candidate of candidates) {
      if (photoByNormalizedName.has(candidate)) {
        photo = photoByNormalizedName.get(candidate) ?? null;
        if (photo) break;
      }
    }

    playerPhotosCache.set(normalized, photo);
    results.set(requested, photo);
  }

  return results;
}

export function clearPlayerPhotosCache(): void {
  playerPhotosCache.clear();
}

export function getPlayerPhotosCacheSize(): number {
  return playerPhotosCache.size;
}
