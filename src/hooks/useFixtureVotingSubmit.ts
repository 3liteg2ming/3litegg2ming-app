import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getFixtureVotingQueryBase, submitFixtureVote } from '../lib/fixtureVotingRepo';
import type { FixtureVoteSubmitInput } from '../types/fixtureVoting';
import { getPersistentVoterKey } from '../utils/voterKey';

export function useFixtureVotingSubmit() {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, FixtureVoteSubmitInput>({
    mutationFn: async ({ fixtureId, selectedTeamSlug }) => {
      await submitFixtureVote({
        fixtureId,
        selectedTeamSlug,
        voterKey: getPersistentVoterKey(),
      });
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: getFixtureVotingQueryBase(variables.fixtureId) });
    },
  });

  return {
    submitVote: (fixtureId: string, selectedTeamSlug: string) =>
      mutation.mutateAsync({ fixtureId, selectedTeamSlug }),
    isSubmitting: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}
