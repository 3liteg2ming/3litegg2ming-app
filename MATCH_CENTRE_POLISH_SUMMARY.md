# Match Centre Polish: Performance & Readability Improvements

## Summary

Successfully applied targeted corrections to Match Centre to improve perceived load speed, eliminate logo flicker, and enhance text readability - all while preserving current functionality and premium design language.

## Changes Made

### 1. Logo Flicker Fix ✅

**Problem:** Elite Gaming placeholder logos briefly flashed before real team logos appeared.

**Solution:**
- Modified `HeroHeader.tsx` to use smart logo resolution logic
- When team identity is known (via teamKey), directly use team asset logo instead of falling back to Elite Gaming logo
- Returns empty string instead of placeholder when no team identity exists - `SmartImg` now shows team initials instead
- Enhanced `SmartImg.tsx` to handle empty `src` gracefully and reset state when src changes

**Files Changed:**
- `src/components/match-centre/broadcast/HeroHeader.tsx`
- `src/components/SmartImg.tsx`

**Impact:** No more Elite Gaming logo flicker on Match Centre load when team data is available

---

### 2. Performance Improvements ✅

**Problem:** Match Centre felt slow to render, with blocking work preventing the hero section from appearing quickly.

**Solution:**
- Wrapped `HeroHeader`, `TeamStats`, and `PlayerStatsTable` components with `React.memo()` to prevent unnecessary re-renders
- Memoized logo resolution logic in HeroHeader using `useMemo` hooks
- Set hero logos to `loading="eager"` and `fetchPriority="high"` for immediate rendering
- Memoized `PlayerMedia` sub-component to reduce re-render overhead

**Files Changed:**
- `src/components/match-centre/broadcast/HeroHeader.tsx`
- `src/components/match-centre/broadcast/TeamStats.tsx`
- `src/components/match-centre/broadcast/PlayerStatsTable.tsx`

**Impact:** Faster perceived load time, smoother navigation to Match Centre

---

### 3. Text Readability Improvements ✅

**Problem:** Player names and team stat labels were being truncated with ellipsis, making them hard to read on mobile.

**Solution:**

#### Player Names (Player Stats Table)
- Changed from single-line `text-overflow: ellipsis` to 2-line clamp using `-webkit-line-clamp: 2`
- Added `line-height: 1.3` for better spacing
- Applied `word-break: break-word` to prevent awkward truncation

#### Team Names (Hero Header & Team Stats)
- Expanded max-width: `100px → 110px` (desktop), `90px → 98px` (mobile)
- Applied 2-line clamp to team names in hero header and team stats panels
- Added `line-height: 1.3` for better multi-line display

#### Stat Labels (Team Stats)
- Applied 2-line clamp to stat row labels (e.g., "Contested Possessions")
- Added `line-height: 1.2` and `word-break: break-word`

**Files Changed:**
- `src/styles/mc-player-table.css`
- `src/styles/mc-hero.css`
- `src/styles/match-centre-team-stats.css`

**Impact:** Names and labels are now fully readable without aggressive truncation

---

## What Was NOT Changed

✅ **No Supabase schema changes**
✅ **No redesign** - all visual styling preserved
✅ **Player stats roster fix untouched** - full roster display remains intact
✅ **All Match Centre functionality preserved** - tabs, filtering, scoring, moments all work as before
✅ **Premium design language maintained** - gradients, glows, spacing, colors unchanged

---

## Testing Recommendations

1. **Logo Flicker Test:**
   - Navigate to Match Centre for multiple fixtures
   - Verify no Elite Gaming logo appears when real team logos should show
   - Confirm team initials appear when truly no team identity exists

2. **Performance Test:**
   - Navigate to Match Centre from Home
   - Hero header should render immediately without blocking delay
   - Tab switching (Summary → Team Stats → Players) should feel instant

3. **Readability Test:**
   - Check Player Stats table on mobile (< 420px width)
   - Verify player names with long names (e.g., "Christopher Miller-Johnston") show 2 lines
   - Confirm team stat labels like "Contested Possessions" are readable

4. **Regression Test:**
   - Verify all player stats still display correctly (full roster)
   - Confirm team stats aggregation works
   - Check match leaders, moments, scoring display

---

## Technical Details

### Memoization Strategy
All memoized components use shallow prop comparison. Since `MatchCentreModel` object reference changes on each data fetch, components will re-render when new data arrives (as intended), but won't re-render on unrelated parent updates.

### Logo Resolution Flow
```
1. Check if explicit logoUrl exists and is valid → use it
2. If teamKey exists, use TEAM_ASSETS[teamKey] direct path
3. Otherwise, return empty string → SmartImg shows team initials
```

### CSS Text Clamp Pattern
```css
overflow: hidden;
display: -webkit-box;
-webkit-line-clamp: 2;
-webkit-box-orient: vertical;
line-height: 1.2-1.3;
word-break: break-word;
```

---

## Commit Details

**Commit:** 7266194
**Branch:** main
**Co-authored-by:** galezach <galezach@gmail.com>

All changes follow the project's existing code patterns and maintain backward compatibility.
