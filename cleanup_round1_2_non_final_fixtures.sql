-- ============================================
-- Cleanup: Round 1 & 2 non-FINAL fixtures (Season 1 / afl26-season-two)
-- ============================================
-- Context:
--   The completed Season 1 (slug: afl26-season-two,
--   id: 208d6ceb-4428-43ee-b23b-96be347172bf) has duplicate / leftover
--   fixture rows in Rounds 1 and 2 that were never played. The real
--   results live on the FINAL rows; everything else is incorrect.
--
-- This script deletes any fixture in Rounds 1 and 2 of that season
-- whose status is NOT 'FINAL'. FK cascades will clean up:
--   - eg_fixture_player_stats        (ON DELETE CASCADE)
--   - eg_fixture_submission_images   (ON DELETE CASCADE)
--   - eg_fixture_votes               (ON DELETE CASCADE)
--   - eg_fixtures.next_fixture_id    (ON DELETE SET NULL)
--
-- HOW TO RUN:
--   1. Run the PREVIEW block first and confirm the rows look right.
--   2. Run the DELETE block in a transaction.
-- ============================================

-- ─── PREVIEW (run alone first) ─────────────────────────────────────
SELECT id, round, status, home_team_slug, away_team_slug,
       home_total, away_total, start_time
FROM eg_fixtures
WHERE season_id = '208d6ceb-4428-43ee-b23b-96be347172bf'
  AND round IN (1, 2)
  AND status IS DISTINCT FROM 'FINAL'
ORDER BY round, home_team_slug, away_team_slug;

-- ─── DELETE (run after confirming preview) ─────────────────────────
BEGIN;

DELETE FROM eg_fixtures
WHERE season_id = '208d6ceb-4428-43ee-b23b-96be347172bf'
  AND round IN (1, 2)
  AND status IS DISTINCT FROM 'FINAL';

-- Verify only FINAL rows remain in Rounds 1 and 2
SELECT round, status, COUNT(*) AS row_count
FROM eg_fixtures
WHERE season_id = '208d6ceb-4428-43ee-b23b-96be347172bf'
  AND round IN (1, 2)
GROUP BY round, status
ORDER BY round, status;

COMMIT;
