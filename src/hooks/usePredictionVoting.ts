import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../lib/supabaseClient';
import {
  fetchPredictionVoteSummary,
  getPredictionVotingQueryBase,
  getPredictionVotingQueryKey,
} from '../lib/predictionVotingRepo';
import type { PredictionVoteOption, PredictionVotingResult } from '../types/predictionVoting';
import { getPersistentVoterKey } from '../utils/voterKey';

export function usePredictionVoting(
  pollKey?: string | null,
  options?: PredictionVoteOption[],
  voterKeyOverride?: string | null,
): PredictionVotingResult {
  const queryClient = useQueryClient();
  const [persistentVoterKey] = useState(() => getPersistentVoterKey());
  const normalizedOverride = voterKeyOverride == null ? '' : String(voterKeyOverride).trim();
  const voterKey = voterKeyOverride === undefined ? persistentVoterKey : normalizedOverride;
  const normalizedOptions = useMemo(
    () => (options || []).map((option) => ({ key: String(option.key || '').trim().toLowerCase(), label: String(option.label || '').trim() })),
    [options],
  );

  const query = useQuery({
    queryKey: getPredictionVotingQueryKey(pollKey, voterKey, normalizedOptions.map((option) => option.key)),
    queryFn: () =>
      fetchPredictionVoteSummary({
        pollKey: String(pollKey || ''),
        options: normalizedOptions,
        voterKey,
      }),
    enabled: Boolean(pollKey) && normalizedOptions.length > 0,
    staleTime: 10_000,
    gcTime: 600_000,
  });

  useEffect(() => {
    const normalizedPollKey = String(pollKey || '').trim();
    if (!normalizedPollKey) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`prediction-voting:${normalizedPollKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eg_prediction_votes',
          filter: `poll_key=eq.${normalizedPollKey}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: getPredictionVotingQueryBase(normalizedPollKey) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pollKey, queryClient]);

  const fallback = query.data || {
    pollKey: String(pollKey || ''),
    totalVotes: 0,
    currentUserVote: null,
    hasVotes: false,
    mode: 'local' as const,
    options: normalizedOptions.map((option) => ({ key: option.key, votes: 0, pct: 0 })),
  };

  return {
    totalVotes: fallback.totalVotes,
    currentUserVote: fallback.currentUserVote,
    hasVotes: fallback.hasVotes,
    mode: fallback.mode,
    options: fallback.options,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}
