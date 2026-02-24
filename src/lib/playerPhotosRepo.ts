import { supabase } from './supabase';

interface EGPlayer {
  name: string;
  headshot_url?: string | null;
}

// Cache for player photos to avoid repeated queries
const playerPhotosCache = new Map<string, string | null>();

/**
 * Normalize player name for matching
 */
function normalizeName(name?: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch player headshot URL from the eg_players table
 */
export async function getPlayerPhotoFromSupabase(playerName?: string): Promise<string | null> {
  if (!playerName) return null;

  const normalizedName = normalizeName(playerName);

  // Check cache first
  if (playerPhotosCache.has(normalizedName)) {
    return playerPhotosCache.get(normalizedName) ?? null;
  }

  try {
    const { data, error } = await supabase
      .from('eg_players')
      .select('name, headshot_url')
      .eq('name', playerName)
      .single();

    if (error) {
      console.warn(`[PlayerPhotos] Error fetching photo for ${playerName}:`, error.message);
      playerPhotosCache.set(normalizedName, null);
      return null;
    }

    const player = data as EGPlayer | null;
    const headshot = player?.headshot_url || null;

    // Cache the result
    playerPhotosCache.set(normalizedName, headshot);

    return headshot;
  } catch (err) {
    console.warn(`[PlayerPhotos] Exception fetching photo for ${playerName}:`, err);
    playerPhotosCache.set(normalizedName, null);
    return null;
  }
}

/**
 * Preload multiple player photos at once for performance
 */
export async function preloadPlayerPhotos(playerNames: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Only query for players not in cache
  const uncachedNames = playerNames.filter(name => !playerPhotosCache.has(normalizeName(name)));

  if (uncachedNames.length === 0) {
    // All cached, return from cache
    playerNames.forEach(name => {
      const normalized = normalizeName(name);
      results.set(name, playerPhotosCache.get(normalized) ?? null);
    });
    return results;
  }

  try {
    const { data, error } = await supabase
      .from('eg_players')
      .select('name, headshot_url')
      .in('name', uncachedNames);

    if (error) {
      console.warn('[PlayerPhotos] Error batch fetching photos:', error.message);
      // Mark as failed but still cache
      playerNames.forEach(name => {
        playerPhotosCache.set(normalizeName(name), null);
        results.set(name, null);
      });
      return results;
    }

    const players = (data || []) as EGPlayer[];
    const photoMap = new Map(players.map(p => [p.name, p.headshot_url || null]));

    // Debug: Log which players have photos
    console.log('[PlayerPhotos] Loaded photos for:', players.map(p => ({ name: p.name, hasPhoto: !!p.headshot_url })));

    // Log missing players
    const missingPlayers = uncachedNames.filter(name => !photoMap.has(name));
    if (missingPlayers.length > 0) {
      console.warn('[PlayerPhotos] Players not found in database:', missingPlayers);
    }

    // Cache and populate results
    playerNames.forEach(name => {
      const headshot = photoMap.get(name) ?? null;
      playerPhotosCache.set(normalizeName(name), headshot);
      results.set(name, headshot);
    });

    return results;
  } catch (err) {
    console.warn('[PlayerPhotos] Exception batch fetching photos:', err);
    playerNames.forEach(name => {
      playerPhotosCache.set(normalizeName(name), null);
      results.set(name, null);
    });
    return results;
  }
}

/**
 * Clear the photo cache
 */
export function clearPlayerPhotosCache(): void {
  playerPhotosCache.clear();
}

/**
 * Get cache size (useful for debugging)
 */
export function getPlayerPhotosCacheSize(): number {
  return playerPhotosCache.size;
}
