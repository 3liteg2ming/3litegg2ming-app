import { useEffect, useState } from 'react';
import { getPlayerPhotoFromSupabase, preloadPlayerPhotos } from './playerPhotosRepo';

/**
 * Hook to fetch a single player's photo from Supabase
 */
export function usePlayerPhoto(playerName?: string) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerName) {
      setPhotoUrl(null);
      return;
    }

    setLoading(true);
    setError(null);

    getPlayerPhotoFromSupabase(playerName)
      .then(url => {
        setPhotoUrl(url);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message || 'Failed to fetch player photo');
        setLoading(false);
      });
  }, [playerName]);

  return { photoUrl, loading, error };
}

/**
 * Hook to preload photos for multiple players
 */
export function usePlayerPhotos(playerNames: string[]) {
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (playerNames.length === 0) {
      setPhotos(new Map());
      return;
    }

    setLoading(true);
    setError(null);

    preloadPlayerPhotos(playerNames)
      .then(photoMap => {
        setPhotos(photoMap);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message || 'Failed to fetch player photos');
        setLoading(false);
      });
  }, [playerNames.join(',')]); // Join to avoid recreating effect on array reference change

  return { photos, loading, error };
}
