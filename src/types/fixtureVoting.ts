export type FixtureVoteFixtureId = string;

export type FixtureVoteTeamSlug = string;

export type FixtureVoteSummary = {
  fixtureId: FixtureVoteFixtureId;
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
  currentUserVote: FixtureVoteTeamSlug | null;
  hasVotes: boolean;
};

export type FixtureVotingResult = {
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
  homePct: number;
  awayPct: number;
  currentUserVote: FixtureVoteTeamSlug | null;
  hasVotes: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

export type FixtureVoteSubmitInput = {
  fixtureId: FixtureVoteFixtureId;
  selectedTeamSlug: FixtureVoteTeamSlug;
};
