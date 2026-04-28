import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPredictionVotingQueryBase, submitPredictionVote } from '../lib/predictionVotingRepo';
import type { PredictionVoteSubmitInput } from '../types/predictionVoting';
import { getPersistentVoterKey } from '../utils/voterKey';

export function usePredictionVotingSubmit(voterKeyOverride?: string | null) {
  const queryClient = useQueryClient();
  const normalizedOverride = voterKeyOverride == null ? '' : String(voterKeyOverride).trim();

  const mutation = useMutation<void, Error, PredictionVoteSubmitInput>({
    mutationFn: async ({ pollKey, selectedOptionKey }) => {
      await submitPredictionVote({
        pollKey,
        selectedOptionKey,
        voterKey: voterKeyOverride === undefined ? getPersistentVoterKey() : normalizedOverride,
      });
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: getPredictionVotingQueryBase(variables.pollKey) });
    },
  });

  return {
    submitVote: (pollKey: string, selectedOptionKey: string) =>
      mutation.mutateAsync({ pollKey, selectedOptionKey }),
    isSubmitting: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}
