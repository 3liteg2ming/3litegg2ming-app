export type MatchConfidence = 'exact' | 'partial' | 'none';

export type TeamSlugEntry = {
  id: string;
  label: string;
};

export type TeamPlayerOption = {
  id: string;
  name: string | null;
  display_name: string | null;
  team_id: string;
  afl_player_id: number | null;
};

export type AflPlayerLookupRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  team_id: string | null;
  afl_player_id: number;
};

export type BulkPreviewRow = {
  playerName: string;
  teamSlug: string;
  matched: boolean;
  matchConfidence: MatchConfidence;
  matchReason: string;
  playerId: string | null;
  teamId: string | null;
  teamLabel: string;
  goals: number | null;
  behinds: number | null;
  kicks: number | null;
  handballs: number | null;
  disposals: number | null;
  marks: number | null;
  tackles: number | null;
  hitouts: number | null;
  fantasyPoints: number | null;
  refPlayerId?: string | null;
  refAflPlayerId?: number | null;
  refPlayerName?: string | null;
  matchSource?: 'playerId' | 'aflPlayerId' | 'playerName';
  manualPlayerId?: string;
  availablePlayers?: Array<{ id: string; label: string }>;
};

export type BuildPlayerStatsImportPreviewArgs = {
  rawInput: string;
  fixtureId: string;
  fixtureTeamIds: Array<string | null | undefined>;
  teamSlugMap: Map<string, TeamSlugEntry>;
  loadPlayersForTeam: (teamId: string) => Promise<TeamPlayerOption[]>;
  lookupPlayersByAflId: (aflPlayerIds: number[]) => Promise<Map<number, AflPlayerLookupRow>>;
};

export type BuildPlayerStatsImportPreviewResult = {
  preview: BulkPreviewRow[];
  warnings: string[];
  skippedCount: number;
};

export function previewRowsToPlayerStatUpserts(preview: BulkPreviewRow[]) {
  const rowsByPlayerId = new Map<
    string,
    {
      player_id: string;
      team_id: string;
      goals?: number | null;
      behinds?: number | null;
      disposals?: number | null;
      kicks?: number | null;
      handballs?: number | null;
      marks?: number | null;
      tackles?: number | null;
      clearances?: number | null;
      hitouts?: number | null;
      fantasy_points?: number | null;
    }
  >();

  for (const row of preview) {
    if (!row.matched || !row.playerId || !row.teamId) continue;
    rowsByPlayerId.set(row.playerId, {
      player_id: row.playerId,
      team_id: row.teamId,
      goals: row.goals ?? null,
      behinds: row.behinds ?? null,
      disposals: row.disposals ?? null,
      kicks: row.kicks ?? null,
      handballs: row.handballs ?? null,
      marks: row.marks ?? null,
      tackles: row.tackles ?? null,
      clearances: null,
      hitouts: row.hitouts ?? null,
      fantasy_points: row.fantasyPoints ?? null,
    });
  }

  return [...rowsByPlayerId.values()];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParsedRow = {
  playerName: string;
  rawSlug: string;
  refPlayerId: string | null;
  refAflPlayerId: number | null;
  refPlayerName: string | null;
  goals: number | null;
  behinds: number | null;
  kicks: number | null;
  handballs: number | null;
  disposals: number | null;
  marks: number | null;
  tackles: number | null;
  hitouts: number | null;
  fantasyPoints: number | null;
};

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function toNullableStat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded >= 0 ? rounded : null;
}

function extractRows(parsed: any): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (Array.isArray(parsed?.playerStats)) return parsed.playerStats as Array<Record<string, unknown>>;
  if (Array.isArray(parsed?.players)) return parsed.players as Array<Record<string, unknown>>;
  if (Array.isArray(parsed?.stats)) return parsed.stats as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  return [];
}

function parseImportRows(rawRows: Array<Record<string, unknown>>): { parsedRows: ParsedRow[]; skippedCount: number } {
  const parsedRows: ParsedRow[] = [];
  let skippedCount = 0;

  for (const row of rawRows) {
    const ref = (row.playerRef || row.player_ref || null) as Record<string, unknown> | null;
    const refPlayerId = ref ? String(ref.playerId || ref.player_id || '').trim() || null : null;
    const refAflPlayerId = ref ? toNullableStat(ref.aflPlayerId || ref.afl_player_id) : null;
    const refPlayerName = ref ? String(ref.playerName || ref.player_name || '').trim() || null : null;
    const playerName = refPlayerName || String(row.playerName || row.player_name || row.name || '').trim();
    const rawSlug = String(row.teamSlug || row.team_slug || row.team || '').trim();

    if (!playerName && !refPlayerId && !refAflPlayerId) {
      skippedCount += 1;
      continue;
    }

    parsedRows.push({
      playerName: playerName || '(unknown)',
      rawSlug,
      refPlayerId: refPlayerId && UUID_RE.test(refPlayerId) ? refPlayerId : null,
      refAflPlayerId,
      refPlayerName,
      goals: toNullableStat(row.goals),
      behinds: toNullableStat(row.behinds),
      kicks: toNullableStat(row.kicks),
      handballs: toNullableStat(row.handballs),
      disposals: toNullableStat(row.disposals),
      marks: toNullableStat(row.marks),
      tackles: toNullableStat(row.tackles),
      hitouts: toNullableStat(row.hitouts ?? row.hit_outs),
      fantasyPoints: toNullableStat(row.fantasyPoints ?? row.fantasy_points),
    });
  }

  return { parsedRows, skippedCount };
}

export async function buildPlayerStatsImportPreview(
  args: BuildPlayerStatsImportPreviewArgs,
): Promise<BuildPlayerStatsImportPreviewResult> {
  const parsed = JSON.parse(args.rawInput.trim());

  if (parsed?.fixtureId && parsed.fixtureId !== args.fixtureId) {
    throw new Error(`JSON fixtureId "${parsed.fixtureId}" does not match current fixture "${args.fixtureId}".`);
  }

  const rows = extractRows(parsed);
  if (!rows.length) {
    throw new Error('No player stat rows found in JSON.');
  }

  const { parsedRows, skippedCount } = parseImportRows(rows);
  if (!parsedRows.length) {
    throw new Error('No valid rows found. Each row needs a playerRef or playerName.');
  }

  const teamMatchedRows = parsedRows.map((row) => {
    const normalizedSlug = row.rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const compactSlug = row.rawSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const teamMatch = args.teamSlugMap.get(normalizedSlug) || args.teamSlugMap.get(compactSlug) || null;
    return { ...row, teamMatch };
  });

  const matchedTeamIds = Array.from(
    new Set(teamMatchedRows.filter((row) => row.teamMatch).map((row) => row.teamMatch!.id)),
  );

  const playerLists = await Promise.all(
    matchedTeamIds.map(async (teamId) => [teamId, await args.loadPlayersForTeam(teamId)] as const),
  );
  const playersByTeam = new Map<string, TeamPlayerOption[]>(playerLists);

  const aflIdsToLookup = teamMatchedRows
    .map((row) => row.refAflPlayerId)
    .filter((value): value is number => value != null && value > 0);
  const aflIdMap =
    aflIdsToLookup.length > 0
      ? await args.lookupPlayersByAflId(aflIdsToLookup)
      : new Map<number, AflPlayerLookupRow>();

  const fixtureTeamIds = new Set(args.fixtureTeamIds.filter(Boolean) as string[]);

  const preview: BulkPreviewRow[] = teamMatchedRows.map((row) => {
    const teamPlayers = row.teamMatch ? playersByTeam.get(row.teamMatch.id) || [] : [];
    const availablePlayers = teamPlayers.map((player) => ({
      id: player.id,
      label: player.display_name || player.name || player.id,
    }));

    const baseRow: Omit<BulkPreviewRow, 'matched' | 'matchConfidence' | 'matchReason' | 'playerId'> = {
      playerName: row.playerName,
      teamSlug: row.rawSlug,
      teamId: row.teamMatch?.id || null,
      teamLabel: row.teamMatch?.label || row.rawSlug || '(empty)',
      goals: row.goals,
      behinds: row.behinds,
      kicks: row.kicks,
      handballs: row.handballs,
      disposals: row.disposals,
      marks: row.marks,
      tackles: row.tackles,
      hitouts: row.hitouts,
      fantasyPoints: row.fantasyPoints,
      refPlayerId: row.refPlayerId,
      refAflPlayerId: row.refAflPlayerId,
      refPlayerName: row.refPlayerName,
      availablePlayers,
    };

    if (!row.teamMatch) {
      return {
        ...baseRow,
        matched: false,
        matchConfidence: 'none',
        matchReason: `No team found for "${row.rawSlug}"`,
        playerId: null,
      };
    }

    if (row.refPlayerId) {
      const directMatch = teamPlayers.find((player) => player.id === row.refPlayerId);
      if (directMatch) {
        let reason = `Direct ID match: ${directMatch.display_name || directMatch.name}`;
        if (row.refPlayerName) {
          const refNorm = normalizeForMatch(row.refPlayerName);
          const dbNorm = normalizeForMatch(directMatch.display_name || directMatch.name || '');
          if (refNorm !== dbNorm) {
            reason += ` (warning: name "${row.refPlayerName}" differs from "${directMatch.display_name || directMatch.name}")`;
          }
        }
        return {
          ...baseRow,
          matched: true,
          matchConfidence: 'exact',
          matchReason: reason,
          playerId: directMatch.id,
          matchSource: 'playerId',
        };
      }
    }

    if (row.refAflPlayerId) {
      const aflMatch = aflIdMap.get(row.refAflPlayerId);
      if (aflMatch) {
        const onTeam = aflMatch.team_id === row.teamMatch.id;
        let reason = `AFL ID ${row.refAflPlayerId} -> ${aflMatch.display_name || aflMatch.name}`;
        if (!onTeam) {
          reason += ` (warning: player team_id doesn't match ${row.teamMatch.label})`;
        }
        if (row.refPlayerName) {
          const refNorm = normalizeForMatch(row.refPlayerName);
          const dbNorm = normalizeForMatch(aflMatch.display_name || aflMatch.name || '');
          if (refNorm !== dbNorm) {
            reason += ` (name "${row.refPlayerName}" differs from "${aflMatch.display_name || aflMatch.name}")`;
          }
        }
        return {
          ...baseRow,
          matched: true,
          matchConfidence: onTeam ? 'exact' : 'partial',
          matchReason: reason,
          playerId: aflMatch.id,
          teamId: aflMatch.team_id || row.teamMatch.id,
          matchSource: 'aflPlayerId',
        };
      }
    }

    const normalizedName = normalizeForMatch(row.playerName);
    const exactMatch = teamPlayers.find((player) => {
      const dbName = normalizeForMatch(player.display_name || player.name || '');
      return dbName === normalizedName;
    });
    if (exactMatch) {
      return {
        ...baseRow,
        matched: true,
        matchConfidence: 'exact',
        matchReason: `Exact name match: ${exactMatch.display_name || exactMatch.name}`,
        playerId: exactMatch.id,
        matchSource: 'playerName',
      };
    }

    const nameParts = row.playerName.toLowerCase().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1]?.replace(/[^a-z]/g, '');
    if (lastName && lastName.length > 2) {
      const candidates = teamPlayers.filter((player) => {
        const dbName = (player.display_name || player.name || '').toLowerCase();
        return dbName.endsWith(lastName) || dbName.includes(lastName);
      });
      if (candidates.length === 1) {
        return {
          ...baseRow,
          matched: true,
          matchConfidence: 'partial',
          matchReason: `Partial match (last name): ${candidates[0].display_name || candidates[0].name}`,
          playerId: candidates[0].id,
          matchSource: 'playerName',
        };
      }
    }

    const firstName = nameParts[0]?.replace(/[^a-z]/g, '');
    if (firstName && firstName.length > 2) {
      const candidates = teamPlayers.filter((player) => {
        const dbName = (player.display_name || player.name || '').toLowerCase();
        return dbName.startsWith(firstName);
      });
      if (candidates.length === 1) {
        return {
          ...baseRow,
          matched: true,
          matchConfidence: 'partial',
          matchReason: `Partial match (first name): ${candidates[0].display_name || candidates[0].name}`,
          playerId: candidates[0].id,
          matchSource: 'playerName',
        };
      }
    }

    return {
      ...baseRow,
      matched: false,
      matchConfidence: 'none',
      matchReason: row.refPlayerId
        ? `playerId "${row.refPlayerId}" not found on ${row.teamMatch.label}; name fallback also failed`
        : `No player "${row.playerName}" found on ${row.teamMatch.label} (${teamPlayers.length} players checked)`,
      playerId: null,
    };
  });

  const warnings: string[] = [];
  if (skippedCount > 0) {
    warnings.push(`Skipped ${skippedCount} row(s) with no player identifier.`);
  }

  const nonFixtureTeams = preview.filter((row) => row.teamId && !fixtureTeamIds.has(row.teamId));
  if (nonFixtureTeams.length > 0) {
    const teamNames = [...new Set(nonFixtureTeams.map((row) => row.teamLabel))];
    warnings.push(
      `${nonFixtureTeams.length} row(s) matched to teams not in this fixture: ${teamNames.join(', ')}`,
    );
  }

  const seenPlayerIds = new Map<string, number>();
  for (const row of preview) {
    if (!row.playerId) continue;
    seenPlayerIds.set(row.playerId, (seenPlayerIds.get(row.playerId) || 0) + 1);
  }
  const duplicates = [...seenPlayerIds.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    warnings.push(`${duplicates.length} player(s) appear multiple times. Last occurrence will be used.`);
  }

  const nameDisagreements = preview.filter((row) => row.matchReason.includes('differs from'));
  if (nameDisagreements.length > 0) {
    warnings.push(
      `${nameDisagreements.length} row(s) have playerRef names that differ from the database; ID-based matching won.`,
    );
  }

  return { preview, warnings, skippedCount };
}
