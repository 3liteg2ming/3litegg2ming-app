import { getSupabaseClient } from './supabaseClient';
import type {
  PredictionVoteOption,
  PredictionVoteSubmitInput,
  PredictionVoteSummary,
  PredictionVoteSummaryOption,
} from '../types/predictionVoting';

const PREDICTION_VOTING_QUERY_ROOT = 'prediction-voting';
const LOCAL_PREDICTION_VOTE_STORAGE_KEY = 'elite_gaming_prediction_votes';

type PredictionVoteSummaryRpcRow = {
  option_key?: string | null;
  vote_count?: number | string | null;
  total_votes?: number | string | null;
  current_user_vote?: string | null;
};

function text(value: unknown) {
  return String(value || '').trim();
}

function normalizeKey(value: unknown) {
  return text(value).toLowerCase();
}

function toCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function getFallbackVoteMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>;

  try {
    const raw = String(window.localStorage.getItem(LOCAL_PREDICTION_VOTE_STORAGE_KEY) || '').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setFallbackVote(pollKey: string, optionKey: string) {
  if (typeof window === 'undefined') return;

  try {
    const current = getFallbackVoteMap();
    current[pollKey] = optionKey;
    window.localStorage.setItem(LOCAL_PREDICTION_VOTE_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage failures and keep the in-memory UI responsive.
  }
}

function buildLocalSummary(
  pollKey: string,
  options: PredictionVoteOption[],
): PredictionVoteSummary {
  const normalizedPollKey = text(pollKey);
  const fallbackVoteMap = getFallbackVoteMap();
  const currentUserVote = normalizeKey(fallbackVoteMap[normalizedPollKey]) || null;

  return {
    pollKey: normalizedPollKey,
    totalVotes: 0,
    currentUserVote,
    hasVotes: false,
    mode: 'local',
    options: options.map((option) => ({
      key: normalizeKey(option.key),
      votes: 0,
      pct: 0,
    })),
  };
}

function isRecoverablePredictionVoteError(error: unknown) {
  const message = text((error as any)?.message).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('prediction vote') ||
    message.includes('eg_prediction_votes') ||
    message.includes('eg_get_prediction_vote_summary') ||
    message.includes('eg_cast_prediction_vote') ||
    message.includes('does not exist') ||
    message.includes('could not find the function') ||
    message.includes('not configured')
  );
}

function toSummaryOptions(
  rows: PredictionVoteSummaryRpcRow[],
  options: PredictionVoteOption[],
): PredictionVoteSummaryOption[] {
  const byKey = new Map<string, PredictionVoteSummaryRpcRow>();
  for (const row of rows) {
    const key = normalizeKey(row.option_key);
    if (!key) continue;
    byKey.set(key, row);
  }

  const totalVotes = rows.length ? toCount(rows[0]?.total_votes) : 0;

  return options.map((option) => {
    const key = normalizeKey(option.key);
    const row = byKey.get(key);
    const votes = toCount(row?.vote_count);
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

    return {
      key,
      votes,
      pct,
    };
  });
}

export function getPredictionVotingQueryBase(pollKey?: string | null) {
  return [PREDICTION_VOTING_QUERY_ROOT, text(pollKey)] as const;
}

export function getPredictionVotingQueryKey(
  pollKey?: string | null,
  voterKey?: string | null,
  optionKeys?: string[],
) {
  return [...getPredictionVotingQueryBase(pollKey), text(voterKey), (optionKeys || []).map(normalizeKey).join('|')] as const;
}

export async function fetchPredictionVoteSummary(input: {
  pollKey: string;
  options: PredictionVoteOption[];
  voterKey: string;
}): Promise<PredictionVoteSummary> {
  const pollKey = text(input.pollKey);
  const options = input.options.map((option) => ({ key: normalizeKey(option.key), label: text(option.label) }));
  const supabase = getSupabaseClient();

  if (!pollKey || !options.length || !supabase) {
    return buildLocalSummary(pollKey, options);
  }

  try {
    const { data, error } = await supabase.rpc('eg_get_prediction_vote_summary', {
      p_poll_key: pollKey,
      p_option_keys: options.map((option) => option.key),
      p_voter_key: text(input.voterKey) || null,
    });

    if (error) throw error;

    const rows = Array.isArray(data) ? (data as PredictionVoteSummaryRpcRow[]) : [];
    const totalVotes = rows.length ? toCount(rows[0]?.total_votes) : 0;
    const currentUserVote = normalizeKey(rows[0]?.current_user_vote) || null;

    return {
      pollKey,
      totalVotes,
      currentUserVote,
      hasVotes: totalVotes > 0,
      mode: 'live',
      options: toSummaryOptions(rows, options),
    };
  } catch (error) {
    if (!isRecoverablePredictionVoteError(error)) {
      throw new Error((error as any)?.message || 'Failed to fetch prediction vote summary');
    }

    return buildLocalSummary(pollKey, options);
  }
}

export async function submitPredictionVote(
  input: PredictionVoteSubmitInput & { voterKey: string },
): Promise<void> {
  const pollKey = text(input.pollKey);
  const selectedOptionKey = normalizeKey(input.selectedOptionKey);
  const voterKey = text(input.voterKey);
  const supabase = getSupabaseClient();

  if (!pollKey) {
    throw new Error('pollKey is required');
  }

  if (!selectedOptionKey) {
    throw new Error('selectedOptionKey is required');
  }

  if (!voterKey) {
    throw new Error('voterKey is required');
  }

  if (!supabase) {
    setFallbackVote(pollKey, selectedOptionKey);
    return;
  }

  try {
    const { error } = await supabase.rpc('eg_cast_prediction_vote', {
      p_poll_key: pollKey,
      p_option_key: selectedOptionKey,
      p_voter_key: voterKey,
    });

    if (error) throw error;
    setFallbackVote(pollKey, selectedOptionKey);
  } catch (error) {
    if (!isRecoverablePredictionVoteError(error)) {
      throw new Error((error as any)?.message || 'Failed to submit prediction vote');
    }

    setFallbackVote(pollKey, selectedOptionKey);
  }
}
