export type PredictionVoteOptionKey = string;

export type PredictionVoteOption = {
  key: PredictionVoteOptionKey;
  label: string;
};

export type PredictionVoteSummaryOption = {
  key: PredictionVoteOptionKey;
  votes: number;
  pct: number;
};

export type PredictionVoteSummary = {
  pollKey: string;
  totalVotes: number;
  currentUserVote: PredictionVoteOptionKey | null;
  hasVotes: boolean;
  mode: 'live' | 'local';
  options: PredictionVoteSummaryOption[];
};

export type PredictionVotingResult = {
  totalVotes: number;
  currentUserVote: PredictionVoteOptionKey | null;
  hasVotes: boolean;
  mode: 'live' | 'local';
  options: PredictionVoteSummaryOption[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

export type PredictionVoteSubmitInput = {
  pollKey: string;
  selectedOptionKey: PredictionVoteOptionKey;
};
