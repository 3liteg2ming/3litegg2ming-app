import { upsertContentBlock } from './adminApi';
import { requireSupabaseClient } from './supabaseClient';
import type { TeamOfTournament, TotPlayer } from './teamOfTournament';

const supabase = requireSupabaseClient();
export const BEST23_CONTENT_KEY = 'best23_afl26';

export type Best23OverridePayload = {
  selectionRound: number;
  field: string[];
  interchange: string[];
  updatedAt?: string;
};

function text(value: unknown): string {
  return String(value || '').trim();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

export function parseBest23OverridePayload(payload: unknown): Best23OverridePayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const field = asStringArray(row.field);
  const interchange = asStringArray(row.interchange);
  const selectionRound = Number(row.selectionRound || 0);
  if (!field.length && !interchange.length) return null;
  return {
    selectionRound: Number.isFinite(selectionRound) ? selectionRound : 0,
    field,
    interchange,
    updatedAt: text(row.updatedAt) || undefined,
  };
}

export async function fetchBest23Override(options?: { publishedOnly?: boolean }): Promise<Best23OverridePayload | null> {
  let query = supabase
    .from('eg_content_blocks')
    .select('payload,published')
    .eq('key', BEST23_CONTENT_KEY)
    .limit(1)
    .order('updated_at', { ascending: false });

  if (options?.publishedOnly) query = query.eq('published', true);

  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return parseBest23OverridePayload(data?.payload);
}

export async function saveBest23Override(payload: Best23OverridePayload) {
  return upsertContentBlock({
    key: BEST23_CONTENT_KEY,
    published: true,
    title: 'Best 23',
    body: `Published Best 23 after Round ${payload.selectionRound}`,
    payload: {
      ...payload,
      updatedAt: payload.updatedAt || new Date().toISOString(),
    },
  });
}

export function buildBest23OverridePayload(team: TeamOfTournament): Best23OverridePayload {
  const field = team.fieldLayout.flatMap((row) => row.players.map((player) => text(player?.id))).filter(Boolean);
  const interchange = team.interchange.map((player) => text(player?.id)).filter(Boolean);
  return {
    selectionRound: team.selectionRound,
    field,
    interchange,
    updatedAt: new Date().toISOString(),
  };
}

function dedupePlayers(players: TotPlayer[]): TotPlayer[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (!player?.id || seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  });
}

export function applyBest23Override(team: TeamOfTournament, override: Best23OverridePayload | null): TeamOfTournament {
  if (!override) return team;

  const allPlayers = dedupePlayers(team.availablePlayers);
  const playerMap = new Map(allPlayers.map((player) => [player.id, player]));
  const field = override.field.map((id) => playerMap.get(id)).filter((player): player is TotPlayer => Boolean(player));
  const bench = override.interchange.map((id) => playerMap.get(id)).filter((player): player is TotPlayer => Boolean(player));

  if (field.length !== 18 || bench.length !== 5) return team;

  const used = new Set<string>();
  const dedupedField = field.filter((player) => !used.has(player.id) && (used.add(player.id), true));
  const dedupedBench = bench.filter((player) => !used.has(player.id) && (used.add(player.id), true));
  if (dedupedField.length !== 18 || dedupedBench.length !== 5) return team;

  const fieldLayout = team.fieldLayout.map((row, rowIndex) => ({
    ...row,
    players: row.players.map((_, slotIndex) => dedupedField[rowIndex * 3 + slotIndex] || null),
  }));

  return {
    ...team,
    selectionRound: override.selectionRound || team.selectionRound,
    fieldLayout,
    defenders: dedupedField.filter((player) => player.group === 'defenders'),
    midfielders: dedupedField.filter((player) => player.group === 'midfielders'),
    rucks: dedupedField.filter((player) => player.group === 'rucks'),
    forwards: dedupedField.filter((player) => player.group === 'forwards'),
    interchange: dedupedBench,
  };
}
