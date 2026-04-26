import {
  createOcrQueueItem,
  listFixturePlayerStatImages,
  listPlayersForTeam,
  lookupPlayersByAflId,
  setOcrQueueStatus,
  updateFixtureSubmissionImageOcrStatus,
  upsertFixturePlayerStats,
} from './adminApi';
import {
  buildPlayerStatsImportPreview,
  previewRowsToPlayerStatUpserts,
  type BulkPreviewRow,
  type TeamSlugEntry,
} from './adminPlayerStatsImport';
import { runLocalPlayerStatsOcr } from './adminPlayerStatsOcr';
import type { AdminPlayerStatsOcrDraft } from './adminTypes';

export type RunFixturePlayerStatsOcrWorkflowResult = {
  queueId: string;
  status: 'succeeded';
  draft: AdminPlayerStatsOcrDraft;
  warnings: string[];
  rawText: string | null;
  model: string | null;
  summary: Record<string, unknown>;
  preview: BulkPreviewRow[];
  importedRows: number;
  unmatchedRows: number;
};

export async function runFixturePlayerStatsOcrWorkflow(args: {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
  homeTeamName: string;
  awayTeamName: string;
  token?: string | null;
  autoApply?: boolean;
  onProgress?: (message: string) => void;
}): Promise<RunFixturePlayerStatsOcrWorkflowResult> {
  const screenshots = await listFixturePlayerStatImages(args.fixtureId);
  if (!screenshots.length) {
    throw new Error('No uploaded player-stat screenshots were found for this fixture.');
  }

  args.onProgress?.('Loading fixture rosters…');
  const [homePlayers, awayPlayers] = await Promise.all([
    listPlayersForTeam(args.homeTeamId),
    listPlayersForTeam(args.awayTeamId),
  ]);

  const queue = await createOcrQueueItem({
    fixtureId: args.fixtureId,
    sourceImages: screenshots.map((image) => ({
      id: image.id,
      bucket: image.storage_bucket,
      path: image.storage_path,
      pageNumber: image.page_number,
      ocrStatus: image.ocr_status,
      publicUrl: image.public_url,
    })),
  });

  const imageIds = screenshots.map((image) => image.id).filter(Boolean);

  try {
    try {
      await updateFixtureSubmissionImageOcrStatus(imageIds, 'processing');
    } catch {
      // Queue persistence matters more than per-image status cosmetics.
    }

    const ocrResult = await runLocalPlayerStatsOcr({
      fixtureId: args.fixtureId,
      homeTeamSlug: args.homeTeamSlug,
      awayTeamSlug: args.awayTeamSlug,
      players: [
        ...homePlayers.map((player) => ({
          id: player.id,
          teamSlug: args.homeTeamSlug,
          playerName: player.display_name || player.name || player.id,
          aflPlayerId: player.afl_player_id,
        })),
        ...awayPlayers.map((player) => ({
          id: player.id,
          teamSlug: args.awayTeamSlug,
          playerName: player.display_name || player.name || player.id,
          aflPlayerId: player.afl_player_id,
        })),
      ],
      screenshots: screenshots.map((image) => ({
        id: image.id,
        url: image.public_url,
        pageNumber: image.page_number,
        label: `Page ${image.page_number || screenshots.indexOf(image) + 1}`,
        bucket: image.storage_bucket,
        path: image.storage_path,
      })),
      onProgress: (progress) => {
        if (progress.phase === 'parsing') {
          args.onProgress?.('Matching OCR text to the fixture roster…');
          return;
        }
        args.onProgress?.(`Reading ${progress.label} (${progress.pageIndex}/${progress.pageCount})…`);
      },
    });

    const teamSlugMap = new Map<string, TeamSlugEntry>();
    const normalizedHomeSlug = args.homeTeamSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const compactHomeSlug = args.homeTeamSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAwaySlug = args.awayTeamSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const compactAwaySlug = args.awayTeamSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

    teamSlugMap.set(normalizedHomeSlug, { id: args.homeTeamId, label: args.homeTeamName });
    teamSlugMap.set(compactHomeSlug, { id: args.homeTeamId, label: args.homeTeamName });
    teamSlugMap.set(normalizedAwaySlug, { id: args.awayTeamId, label: args.awayTeamName });
    teamSlugMap.set(compactAwaySlug, { id: args.awayTeamId, label: args.awayTeamName });

    const rawDraft = JSON.stringify(ocrResult.draft, null, 2);
    const previewResult = await buildPlayerStatsImportPreview({
      rawInput: rawDraft,
      fixtureId: args.fixtureId,
      fixtureTeamIds: [args.homeTeamId, args.awayTeamId],
      teamSlugMap,
      loadPlayersForTeam: listPlayersForTeam,
      lookupPlayersByAflId,
    });

    const warnings = [...ocrResult.warnings, ...previewResult.warnings];
    const upsertRows = previewRowsToPlayerStatUpserts(previewResult.preview);
    const unmatchedRows = previewResult.preview.filter((row) => !row.matched || !row.playerId).length;

    if (args.autoApply !== false && upsertRows.length) {
      args.onProgress?.(`Saving ${upsertRows.length} matched player stat row(s)…`);
      await upsertFixturePlayerStats(args.token || '', args.fixtureId, upsertRows);
    }

    const summary = {
      ...ocrResult.summary,
      matchedRows: upsertRows.length,
      unmatchedRows,
      autoImportedRows: args.autoApply === false ? 0 : upsertRows.length,
    };

    await setOcrQueueStatus({
      queueId: queue.id,
      status: 'succeeded',
      result: {
        draft: {
          ...ocrResult.draft,
          warnings,
        },
        warnings,
        summary,
        rawText: ocrResult.rawText || null,
        model: ocrResult.model || 'tesseract.js-local',
      },
    });

    try {
      await updateFixtureSubmissionImageOcrStatus(imageIds, 'done');
    } catch {
      // Best effort only.
    }

    return {
      queueId: queue.id,
      status: 'succeeded',
      draft: {
        ...ocrResult.draft,
        warnings,
      },
      warnings,
      rawText: ocrResult.rawText || null,
      model: ocrResult.model || 'tesseract.js-local',
      summary,
      preview: previewResult.preview,
      importedRows: args.autoApply === false ? 0 : upsertRows.length,
      unmatchedRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Player-stats OCR failed.';
    try {
      await setOcrQueueStatus({
        queueId: queue.id,
        status: 'failed',
        error: message,
      });
    } catch {
      // Preserve the original failure.
    }
    try {
      await updateFixtureSubmissionImageOcrStatus(imageIds, 'failed');
    } catch {
      // Best effort only.
    }
    throw error;
  }
}
