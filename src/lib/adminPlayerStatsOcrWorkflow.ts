import {
  createOcrQueueItem,
  listFixturePlayerStatImages,
  listPlayersForTeam,
  setOcrQueueStatus,
  updateFixtureSubmissionImageOcrStatus,
} from './adminApi';
import type { AdminPlayerStatsOcrDraft } from './adminTypes';
import {
  countPopulatedPlayerStatFields,
  findBestRosterPlayerMatch,
  mergeExtractedPlayerStats,
  normalisePlayerStatRows,
  type ExtractedPlayerStatRow,
  type RosterPlayerMatchCandidate,
} from './playerStatsExtraction';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

type SavePlayerStatsDiagnostics = {
  incomingRows?: number;
  rosterCounts?: {
    home?: number;
    away?: number;
    total?: number;
  };
  matched?: number;
  fallbackCreated?: number;
  fallbackFailed?: unknown[];
  unmatched?: unknown[];
  upsertFailed?: unknown[];
  fieldCounts?: Record<string, number>;
};

type SavePlayerStatsResponse = {
  success?: boolean;
  count?: number;
  fullStatPayload?: unknown[];
  diagnostics?: SavePlayerStatsDiagnostics;
};

type ExtractScorecardResponse = {
  extractionType?: string;
  confidence?: string | null;
  model?: string | null;
  player_stats?: unknown[];
  error?: string;
};

type ImageExtractionDiagnostic = {
  imageId: string;
  pageNumber: number | null;
  statKey: string | null;
  rowCount: number;
  confidence: string | null;
  model: string | null;
  fieldCounts: Record<string, number>;
  error: string | null;
};

export type RunFixturePlayerStatsOcrWorkflowResult = {
  queueId: string;
  status: 'succeeded';
  draft: AdminPlayerStatsOcrDraft;
  warnings: string[];
  rawText: string | null;
  model: string | null;
  summary: Record<string, unknown>;
  preview: [];
  importedRows: number;
  unmatchedRows: number;
};

function text(value: unknown): string {
  return String(value || '').trim();
}

function normalizeStatKey(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  return normalized || null;
}

function inferDraftTeamSlug(args: {
  row: ExtractedPlayerStatRow;
  homeTeamSlug: string;
  awayTeamSlug: string;
  roster: RosterPlayerMatchCandidate[];
}): string {
  if (args.row.team === 'home') return args.homeTeamSlug;
  if (args.row.team === 'away') return args.awayTeamSlug;

  const rosterMatch = findBestRosterPlayerMatch(args.row, args.roster);
  const rosterSide = rosterMatch?.candidate.side || null;
  if (rosterSide === 'home') return args.homeTeamSlug;
  if (rosterSide === 'away') return args.awayTeamSlug;

  return args.homeTeamSlug;
}

function rowToDraftRow(args: {
  row: ExtractedPlayerStatRow;
  homeTeamSlug: string;
  awayTeamSlug: string;
  roster: RosterPlayerMatchCandidate[];
}) {
  const fantasyPoints = args.row.fantasyPoints ?? args.row.afl_fantasy ?? null;

  return {
    teamSlug: inferDraftTeamSlug(args),
    playerRef: {
      playerId: text(args.row.playerId) || null,
      aflPlayerId: args.row.aflPlayerId ?? null,
      playerName: args.row.name || null,
    },
    goals: args.row.goals,
    behinds: args.row.behinds,
    kicks: args.row.kicks,
    handballs: args.row.handballs,
    disposals: args.row.disposals,
    marks: args.row.marks,
    tackles: args.row.tackles,
    hitouts: args.row.hitouts,
    fantasyPoints,
  };
}

function buildImageErrorMessage(screenshotLabel: string, error: unknown) {
  const base = error instanceof Error ? error.message : String(error || 'AI extraction failed.');
  return `${screenshotLabel}: ${base}`;
}

function mergeFieldCounts(
  target: Record<string, number>,
  next: Record<string, number>,
) {
  for (const [key, value] of Object.entries(next)) {
    target[key] = (target[key] || 0) + (Number.isFinite(value) ? value : 0);
  }
}

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

  args.onProgress?.('Loading fixture screenshots and rosters…');
  const [homePlayers, awayPlayers] = await Promise.all([
    listPlayersForTeam(args.homeTeamId),
    listPlayersForTeam(args.awayTeamId),
  ]);

  const roster: RosterPlayerMatchCandidate[] = [
    ...homePlayers.map((player) => ({
      id: player.id,
      afl_player_id: player.afl_player_id,
      display_name: player.display_name,
      name: player.name,
      team_id: args.homeTeamId,
      side: 'home' as const,
    })),
    ...awayPlayers.map((player) => ({
      id: player.id,
      afl_player_id: player.afl_player_id,
      display_name: player.display_name,
      name: player.name,
      team_id: args.awayTeamId,
      side: 'away' as const,
    })),
  ];

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
      // Best effort only.
    }

    const extractionDiagnostics: ImageExtractionDiagnostic[] = [];
    const warnings: string[] = [];
    let mergedRows: ExtractedPlayerStatRow[] = [];
    let model: string | null = null;

    for (const [index, screenshot] of screenshots.entries()) {
      const screenshotLabel = screenshot.stat_key
        ? `${screenshot.stat_key} screenshot`
        : `Player stat screenshot ${index + 1}`;
      args.onProgress?.(`Running AI extraction for ${screenshotLabel}…`);

      try {
        let imageUrl = screenshot.public_url || '';
        if (screenshot.storage_bucket && screenshot.storage_path) {
          const { data: signed, error: signError } = await supabase.storage
            .from(screenshot.storage_bucket)
            .createSignedUrl(screenshot.storage_path, 60 * 30);
          if (signError) {
            if (!imageUrl) {
              throw new Error(signError.message || 'Failed to sign screenshot URL');
            }
          } else if (signed?.signedUrl) {
            imageUrl = signed.signedUrl;
          }
        }
        if (!imageUrl) {
          throw new Error('Screenshot has no accessible storage URL.');
        }

        const { data, error } = await supabase.functions.invoke('extract-scorecard', {
          body: {
            imageUrl,
            extractionType: 'key_stats',
          },
        });

        if (error) {
          throw new Error(error.message || 'AI extraction failed.');
        }

        const payload = (data || {}) as ExtractScorecardResponse;
        if (payload.error) {
          throw new Error(payload.error);
        }

        const normalizedRows = normalisePlayerStatRows(payload.player_stats || []);
        const fieldCounts = countPopulatedPlayerStatFields(normalizedRows);
        mergedRows = mergeExtractedPlayerStats(mergedRows, normalizedRows);
        model = model || payload.model || null;

        extractionDiagnostics.push({
          imageId: screenshot.id,
          pageNumber: screenshot.page_number,
          statKey: normalizeStatKey(screenshot.stat_key),
          rowCount: normalizedRows.length,
          confidence: payload.confidence || null,
          model: payload.model || null,
          fieldCounts,
          error: null,
        });
      } catch (error) {
        const message = buildImageErrorMessage(screenshotLabel, error);
        warnings.push(message);
        extractionDiagnostics.push({
          imageId: screenshot.id,
          pageNumber: screenshot.page_number,
          statKey: normalizeStatKey(screenshot.stat_key),
          rowCount: 0,
          confidence: null,
          model: null,
          fieldCounts: countPopulatedPlayerStatFields([]),
          error: message,
        });
      }
    }

    if (!mergedRows.length) {
      throw new Error(
        warnings[0] || 'AI extraction completed, but no player stat rows were returned from the stored screenshots.',
      );
    }

    const fieldCounts = {
      goals: 0,
      behinds: 0,
      disposals: 0,
      kicks: 0,
      handballs: 0,
      marks: 0,
      tackles: 0,
      hitouts: 0,
      afl_fantasy: 0,
      fantasyPoints: 0,
    };

    for (const diagnostic of extractionDiagnostics) {
      mergeFieldCounts(fieldCounts, diagnostic.fieldCounts);
    }

    const draft: AdminPlayerStatsOcrDraft = {
      fixtureId: args.fixtureId,
      homeTeamSlug: args.homeTeamSlug,
      awayTeamSlug: args.awayTeamSlug,
      playerStats: mergedRows.map((row) =>
        rowToDraftRow({
          row,
          homeTeamSlug: args.homeTeamSlug,
          awayTeamSlug: args.awayTeamSlug,
          roster,
        }),
      ),
      warnings,
    };

    let saveResponse: SavePlayerStatsResponse | null = null;
    if (args.autoApply !== false) {
      args.onProgress?.(`Saving ${mergedRows.length} merged player stat row(s)…`);
      const { data, error } = await supabase.functions.invoke('save-player-stats', {
        body: {
          fixture_id: args.fixtureId,
          player_stats: mergedRows,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to save merged player stats.');
      }

      saveResponse = (data || {}) as SavePlayerStatsResponse;
      if (!saveResponse.success) {
        throw new Error('save-player-stats returned an unsuccessful response.');
      }
    }

    const unmatchedRows = Array.isArray(saveResponse?.diagnostics?.unmatched)
      ? saveResponse?.diagnostics?.unmatched?.length || 0
      : 0;
    const importedRows = Number(saveResponse?.count || 0) || 0;
    const summary = {
      imagesProcessed: screenshots.length,
      imagesSucceeded: extractionDiagnostics.filter((item) => !item.error).length,
      imageErrors: extractionDiagnostics.filter((item) => item.error).length,
      errorsByImage: extractionDiagnostics
        .filter((item) => item.error)
        .map((item) => ({
          imageId: item.imageId,
          pageNumber: item.pageNumber,
          statKey: item.statKey,
          error: item.error,
        })),
      imageDiagnostics: extractionDiagnostics,
      playerStatRows: mergedRows.length,
      rowsExtracted: mergedRows.length,
      rowsMatched: Number(saveResponse?.diagnostics?.matched || importedRows) || 0,
      unmatchedRows,
      fieldCounts: saveResponse?.diagnostics?.fieldCounts || fieldCounts,
      incomingRows: Number(saveResponse?.diagnostics?.incomingRows || mergedRows.length) || mergedRows.length,
      rosterCounts: saveResponse?.diagnostics?.rosterCounts || {
        home: homePlayers.length,
        away: awayPlayers.length,
        total: homePlayers.length + awayPlayers.length,
      },
      fallbackCreated: Number(saveResponse?.diagnostics?.fallbackCreated || 0) || 0,
      fallbackFailed: saveResponse?.diagnostics?.fallbackFailed || [],
      upsertFailed: saveResponse?.diagnostics?.upsertFailed || [],
    };

    await setOcrQueueStatus({
      queueId: queue.id,
      status: 'succeeded',
      result: {
        draft,
        warnings,
        summary,
        rawText: JSON.stringify(extractionDiagnostics, null, 2),
        model: model || 'extract-scorecard',
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
      draft,
      warnings,
      rawText: JSON.stringify(extractionDiagnostics, null, 2),
      model: model || 'extract-scorecard',
      summary,
      preview: [],
      importedRows,
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
