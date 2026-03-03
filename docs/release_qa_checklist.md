# Elite Gaming — Mobile Fixtures/Stats/Home QA Checklist

Date: 2026-03-01  
Scope: Fixtures sticky controls + round labels, Stats players/leaders data states, Home mobile safe-area spacing, Fixture poster AFL logo placement.

## Discovery Summary
- Routing verified in `src/App.tsx`:
  - `/`, `/fixtures`, `/match-centre/:fixtureId`, `/stats3`, `/submit`, `/player/:playerId`, `/preseason`.
- Fixtures data source verified in `src/hooks/useFixtures.ts`:
  - `eg_fixtures` + team joins from `eg_teams`.
- Existing preseason selection model verified in `src/lib/competitionRegistry.ts`:
  - UI competition defaults to `preseason`.
  - Data currently falls back to seeded AFL26 season slug.

## Issues Confirmed
1. Fixtures round pills rendered `0` when `stage_index` was null/0; UI used raw index directly.
2. Fixtures sticky controls used an incomplete sticky `top` offset and could sit in the wrong position under the global header.
3. Fixtures content had inconsistent bottom safe-area spacing, causing bottom nav overlap risk.
4. Stats page had no dedicated players list render path, so users saw leaders only and interpreted it as “no player data”.
5. Leaders empty card wording was misleading and looked like a broken state.
6. Home mobile first screen had weak safe-area/bottom-nav spacing rhythm.
7. Fixture poster had no centered competition mark layer.

## Fixes Implemented

### 1) Round pill root-cause fix
- Updated `src/pages/AFL26FixturesPage.tsx`:
  - Added positive-integer guard for stage/round values (`toPositiveInt`).
  - Stage index now resolves in order: `stage_index` (>0) -> `round` (>0) -> `1`.
  - Added fallback stage groups when fixture data is empty to avoid blank/invalid pills.
  - Pill labels now never render `0`.

### 2) Sticky header root-cause fix
- Updated `src/styles/Fixtures.css`:
  - Sticky offset now anchors under global header:
    `top: calc(var(--eg-header-h, 72px) + env(safe-area-inset-top, 0px) + 2px)`.
  - Increased sticky z-index over cards and corrected page/bottom padding for nav safe-area.
  - Keeps registration banner above sticky block without overlap.

### 3) Stats players + cleaner leaders empty state
- Updated `src/pages/AFL2026StatsPage.tsx`:
  - Added Supabase players list load from `fetchAflPlayers()` with search filtering.
  - Added player list UI rows (name/headshot/team/position/number) with navigation to `/player/:playerId`.
  - Kept existing leaders layout intact; changed empty-state copy to:
    “No stats submitted yet” and “Submit Results to populate leaders”.
- Updated `src/styles/stats-home.css`:
  - Added scoped styles for new player-list rows without changing existing leaderboard styling.

### 4) Home mobile safe-area polish
- Updated `src/styles/home.css`:
  - Added explicit bottom nav safe-area padding.
  - Tightened mobile vertical rhythm for first screen (small spacing-only adjustments).
  - Kept hero card design unchanged.

### 5) Fixture poster competition mark
- Updated `src/components/FixturePosterCard.tsx` + `src/styles/fixture-poster-card.css`:
  - Added a subtle centered AFL26 logo layer (`fxPosterCard__compLogo`) in the card middle region.
  - No changes to core score typography, CTA, borders, or PS branding.

### 6) Preseason bracket generation + week-based fixtures mode
- Added migration: `supabase/migrations/202603011730_preseason_knockout_seedings_and_generation.sql`
  - Adds `week_index` and `is_preseason` fields to `eg_fixtures`.
  - Adds `eg_preseason_seedings` table.
  - Adds RPC function `eg_build_preseason_seedings(preseasonSeasonId, sourceSeasonId)`.
  - Adds RPC function `eg_generate_preseason_fixtures(preseasonSeasonId)`:
    - Generates seeded Week 1 matchups.
    - Generates Week 2 / Week 3 placeholders.
    - Generates Finals placeholders (SF1, SF2, GF).
  - Adds view `eg_preseason_bracket_fixtures`.
- Updated `src/pages/AFL26FixturesPage.tsx`:
  - Preseason now uses week tabs (`Week 1`, `Week 2`, `Week 3`, `Finals`) and defaults to bracket view.
  - AFL26 continues using round/stage pills and round-based matches flow.
  - Registration CTA remains pinned above controls for preseason mode.
- Updated `src/lib/competitionRegistry.ts`:
  - Preseason remains default.
  - AFL26 is selectable again for round-based fixtures mode.
  - Preseason data now resolves to the `preseason` season slug directly.

## Verification Steps
1. Open `/fixtures` on iPhone-width viewport.
   - Verify round/stage pills show valid values (`1..N`), never `0`.
   - Scroll and confirm sticky controls stay directly under header.
2. Confirm fixtures CTA row and bottom card content are not hidden by bottom nav.
3. Open `/stats3`.
   - Verify player list rows load with names/headshots (or initials fallback).
   - Verify searching filters player rows.
4. Verify Season Leaders cards:
   - Real data if available; otherwise clean “No stats submitted yet” messaging.
5. Open `/` (Home) on mobile.
   - Verify first screen spacing is clean and not clipped by bottom nav.
6. Open `/fixtures` cards and confirm centered AFL26 logo appears subtly in card middle.
7. Preseason bracket generation flow (Supabase SQL):
   - Run `select public.eg_build_preseason_seedings('<preseason-season-id>', '<afl26-s1-season-id>');`
   - Run `select public.eg_generate_preseason_fixtures('<preseason-season-id>');`
   - Open `/fixtures` with preseason selected and verify week tabs + bracket nodes render.

## Build/Type Checks
- `npm run -s typecheck` ✅
- `npm run -s build` ✅

## Known Limitations
- Preseason mode now resolves directly to the `preseason` season slug; if that season is not present in `eg_seasons`, fixtures will show the connection/error state until seeded.
- Leaders depend on submitted fixture player stats; before submissions, leader cards intentionally show no-stats state.

---

## 2026-03-01 8-Team Preseason Round Selector + Sticky Fix

### Root Causes
1. Fixtures preseason header still rendered an in-page registration banner, which conflicted with current requirement that registration CTA only appears on Home season cards.
2. Preseason selector still used week/finals tabs (`Week 1/2/3/Finals`) while product now requires `ROUND 1/2/3`.
3. Sticky controls had inconsistent top offset assumptions across app-shell variants and could appear to drift.
4. Existing preseason seed/generate migration targeted a broader week/finals structure and did not provide the exact requested 8-team seed + QF/SF/GF helpers.

### Changes Applied
1. `src/pages/AFL26FixturesPage.tsx`
   - Removed fixtures-page registration banner block.
   - Removed fixtures-page registration CTA button from preseason empty state.
   - Replaced preseason selector labels with `ROUND 1`, `ROUND 2`, `ROUND 3`.
   - Updated preseason grouping to round-based derivation (`deriveFixtureRound`) with capped rounds 1..3.
2. `src/styles/Fixtures.css`
   - Removed registration banner styles.
   - Sticky controls now use:
     `top: calc(var(--eg-header-height, var(--eg-header-h, 0px)) + env(safe-area-inset-top, 0px))`
   - Reduced sticky compositing cost by removing sticky `backdrop-filter`.
   - Unified bottom spacing to use:
     `var(--eg-bottom-nav-height, var(--bottom-nav-h, 88px))`.
3. `src/styles/appFrame.css`
   - Added shared vars:
     - `--eg-header-height`
     - `--eg-bottom-nav-height`
   - Keeps sticky and page padding calculations consistent across pages.
4. `supabase/migrations/202603011940_preseason_8team_seed.sql`
   - Added/ensured preseason fixture metadata columns on `eg_fixtures`.
   - Added `eg_preseason_seedings` table (`season_id`, `team_id`, `seed`) with seed uniqueness.
   - Added `eg_seed_preseason_8team(p_preseason_season_id uuid, p_team_ids uuid[])`.
     - Enforces exactly 8 team ids in seed order.
     - Upserts seeds and removes stale rows for that season.
   - Added `eg_generate_preseason_8team_fixtures(p_preseason_season_id uuid)`.
     - Idempotent: returns if round 1/2/3 fixtures already exist.
     - Generates Round 1 (QF) as 1v8, 2v7, 3v6, 4v5.
     - Generates Round 2 (SF) placeholders (TBD teams).
     - Generates Round 3 (GF) placeholder (TBD teams).
   - Added helper view `eg_preseason_bracket_view`.

### Quick Verify Steps
1. Fixtures page:
   - Confirm no `Registration Open Now / Register` banner appears.
   - In preseason mode, selector shows `ROUND 1`, `ROUND 2`, `ROUND 3`.
2. Sticky behavior:
   - Scroll fixtures on iPhone-width viewport.
   - Controls remain pinned under header and do not jitter/freeze.
3. Supabase seed + generate:
   - `select public.eg_seed_preseason_8team('<preseason-season-id>', array['<seed1-team-id>', ... '<seed8-team-id>']::uuid[]);`
   - `select public.eg_generate_preseason_8team_fixtures('<preseason-season-id>');`
   - Verify rounds: 4 fixtures in round 1, 2 fixtures in round 2, 1 fixture in round 3.

---

## 2026-03-01 Final Fix Pass (Logos / Sticky / Stats / Profile)

### Root Causes Found
1. Fixture home/away key derivation relied on slug/name fallbacks before team-id-resolved metadata, so ambiguous slugs produced wrong logos.
2. Fixtures sticky controls used a header-offset `top` inside an already header-offset internal scroll container (`.eg-content-scroll`), which made the sticky block feel frozen/layered.
3. Player profile query attempted `eg_players.first_name/last_name` first, causing runtime SQL errors in environments where those columns are absent.
4. Stats players list had no explicit team-branding treatment in row rendering, and leader/player touch targets to profile were incomplete.
5. AFL competition watermark opacity in fixture cards was too strong for score legibility.

### Changes Applied
1. `src/pages/AFL26FixturesPage.tsx`
   - Added team-id metadata map load from `eg_teams` for fixtures on page.
   - Team key/name/logo resolution now prefers `home_team_id/away_team_id` mapped rows first.
   - Bracket tiles now resolve team name/short/logo with team-id metadata first.
2. `src/styles/Fixtures.css`
   - Sticky top controls now use `top: 0` in the app’s internal scroll context.
   - Reduced sticky blur weight and tuned z-index to avoid frozen overlay feel.
3. `src/pages/AFL2026StatsPage.tsx`
   - Added team branding data (logo/color/key) to player list rows.
   - Player list rows now use subtle team-color accent background and team logo marker.
   - Added player-profile navigation affordances on leader hero and runner avatars/names where player UUID is available.
4. `src/styles/stats-home.css`
   - Added CSS hooks for team-accented player rows and team-logo icon.
   - Added clickable affordance styles for leader/profile targets.
5. `src/pages/PlayerProfilePage.tsx`
   - Removed `first_name/last_name` selections entirely.
   - Profile now queries only supported identity columns (`name/display_name/full_name`) and remains DB-compatible.
6. `src/styles/fixture-poster-card.css`
   - Reduced center AFL watermark opacity for readability while keeping placement.

### Quick Verification
1. Fixtures page:
   - Scroll down/up on iPhone-size viewport.
   - Round/stage controls remain pinned directly under header without frozen mid-layer behavior.
2. Fixtures card logos:
   - Validate multiple fixtures where home/away teams differ.
   - Left logo maps to home team id; right logo maps to away team id.
3. Stats page:
   - `/stats3` opens main stats screen.
   - Players list shows names + team logo + team accent rows.
   - Tapping a player row opens `/player/:playerId`.
4. Leaders:
   - Hero/runners show team branding and allow profile click where player id exists.
5. Player profile:
   - No `first_name` SQL error.
   - Friendly profile/empty state renders without raw SQL error output.
