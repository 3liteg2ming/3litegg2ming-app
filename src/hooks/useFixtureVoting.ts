import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFixtureVotingQueryBase, getFixtureVotingQueryKey, fetchFixtureVoteSummary } from '../lib/fixtureVotingRepo';
import { getSupabaseClient } from '../lib/supabaseClient';
import type { FixtureVotingResult } from '../types/fixtureVoting';
import { getPersistentVoterKey } from '../utils/voterKey';

function toPercentages(homeVotes: number, awayVotes: number, totalVotes: number) {
  if (totalVotes <= 0) {
    return {
      homePct: 50,
      awayPct: 50,
      hasVotes: false,
    };
  }

  const homePct = Math.round((homeVotes / totalVotes) * 100);
  const awayPct = Math.max(0, 100 - homePct);

  return {
    homePct,
    awayPct,
    hasVotes: true,
  };
}

export function useFixtureVoting(
  fixtureId?: string | null,
  homeTeamSlug?: string | null,
  awayTeamSlug?: string | null,
): FixtureVotingResult {
  const queryClient = useQueryClient();
  const [voterKey] = useState(() => getPersistentVoterKey());

  const query = useQuery({
    queryKey: getFixtureVotingQueryKey(fixtureId, voterKey),
    queryFn: () =>
      fetchFixtureVoteSummary({
        fixtureId: String(fixtureId || ''),
        homeTeamSlug,
        awayTeamSlug,
        voterKey,
      }),
    enabled: Boolean(fixtureId),
    staleTime: 10_000,
    gcTime: 600_000,
  });

  useEffect(() => {
    if (!fixtureId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`fixture-voting:${fixtureId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eg_fixture_votes',
          filter: `fixture_id=eq.${fixtureId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: getFixtureVotingQueryBase(fixtureId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fixtureId, queryClient]);

  const fallback = query.data || {
    fixtureId: String(fixtureId || ''),
    homeVotes: 0,
    awayVotes: 0,
    totalVotes: 0,
    currentUserVote: null,
    hasVotes: false,
  };

  const percentages = useMemo(
    () => toPercentages(fallback.homeVotes, fallback.awayVotes, fallback.totalVotes),
    [fallback.awayVotes, fallback.homeVotes, fallback.totalVotes],
  );

  return {
    homeVotes: fallback.homeVotes,
    awayVotes: fallback.awayVotes,
    totalVotes: fallback.totalVotes,
    homePct: percentages.homePct,
    awayPct: percentages.awayPct,
    currentUserVote: fallback.currentUserVote,
    hasVotes: fallback.hasVotes && percentages.hasVotes,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}
