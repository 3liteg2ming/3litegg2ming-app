# Player Photos Integration with Supabase

This guide explains how to fetch and display player photos from your Supabase `eg_players` table.

## Overview

The implementation provides three layers of functionality:

1. **Repository Layer** (`lib/playerPhotosRepo.ts`) - Direct database access with caching
2. **React Hook** (`lib/usePlayerPhoto.ts`) - React integration for components
3. **Component Integration** - Examples in `AFL2026StatsPage.tsx`

## Setup

Your Supabase `eg_players` table should have:
- `name` - Player name (string)
- `headshot_url` - URL to player photo (string, nullable)

## Usage Patterns

### Pattern 1: Single Player Photo with Hook

```typescript
import { usePlayerPhoto } from '@/lib/usePlayerPhoto';

export function PlayerCard({ playerName }: { playerName: string }) {
  const { photoUrl, loading, error } = usePlayerPhoto(playerName);

  if (loading) return <div>Loading photo...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <img 
      src={photoUrl || '/fallback.jpg'} 
      alt={playerName}
    />
  );
}
```

### Pattern 2: Multiple Player Photos

```typescript
import { usePlayerPhotos } from '@/lib/usePlayerPhoto';

export function PlayerList({ players }: { players: string[] }) {
  const { photos, loading } = usePlayerPhotos(players);

  return (
    <div>
      {players.map(name => (
        <img 
          key={name}
          src={photos.get(name) || '/fallback.jpg'} 
          alt={name}
        />
      ))}
    </div>
  );
}
```

### Pattern 3: Direct Repository Access (Advanced)

For non-React contexts or custom caching:

```typescript
import { getPlayerPhotoFromSupabase, preloadPlayerPhotos } from '@/lib/playerPhotosRepo';

// Single player
const photoUrl = await getPlayerPhotoFromSupabase('Jeremy Cameron');

// Multiple players (more efficient)
const photos = await preloadPlayerPhotos(['Jeremy Cameron', 'Jack Gunston']);
photos.get('Jeremy Cameron') // Returns the URL or null
```

## Implementation Details

### Caching Strategy

- **Memory Cache**: All fetched photos are cached in memory to avoid repeated database queries
- **Normalized Keys**: Player names are normalized (lowercase, trimmed) for consistent lookup
- **Query Optimization**: `preloadPlayerPhotos` batch-loads multiple players in a single query

### Fallback Behavior

Photos are fetched with priorities:
1. **Supabase `eg_players` table** (if available)
2. **Fallback URLs** (e.g., AFL fantasy API)
3. **Initials Avatar** (as last resort)

### Error Handling

- Failures are cached as `null` to prevent repeated failed queries
- Errors are logged to console for debugging
- Component rendering is not disrupted by fetch failures

## Cache Management

```typescript
import { 
  clearPlayerPhotosCache, 
  getPlayerPhotosCacheSize 
} from '@/lib/playerPhotosRepo';

// Clear cache if needed
clearPlayerPhotosCache();

// Check cache size (useful for debugging)
console.log(`Cached photos: ${getPlayerPhotosCacheSize()}`);
```

## Performance Considerations

1. **Preload strategically**: Use `usePlayerPhotos` with `useMemo` to preload all visible players
2. **Batch requests**: Fetching 10 players costs one query; fetching one by one costs 10
3. **Caching**: The in-memory cache persists across components during the session

## Example: Stats Page Integration

The `AFL2026StatsPage.tsx` demonstrates the full integration:

```typescript
// Preload all player photos
const playerNames = useMemo(() => mockPlayers.map(p => p.name), []);
const { photos: supabasePhotos } = usePlayerPhotos(playerNames);

// Pass to child components
<LeaderCard 
  cfg={cfg} 
  mode={mode} 
  scope={scope} 
  supabasePhotos={supabasePhotos} 
/>

// Use in HeadshotImg
<HeadshotImg 
  src={fallbackUrl} 
  name={playerName} 
  supabaseUrl={supabasePhotos.get(playerName)} 
/>
```

## Troubleshooting

### Photos not loading?

1. Verify the `eg_players` table exists in your Supabase project
2. Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
3. Ensure the `eg_players` table is public or RLS policies allow anonymous access
4. Check browser console for error messages

### Performance issues?

1. Use `preloadPlayerPhotos()` instead of fetching individually
2. Clear cache periodically if photos are updated frequently
3. Monitor the cache size with `getPlayerPhotosCacheSize()`

### Testing locally?

```typescript
// In browser console
import { getPlayerPhotosCacheSize, clearPlayerPhotosCache } from '@/lib/playerPhotosRepo';
console.log(getPlayerPhotosCacheSize()); // Check cache
clearPlayerPhotosCache(); // Force refresh
```
