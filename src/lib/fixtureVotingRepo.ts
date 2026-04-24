import { getSupabaseClient } from './supabaseClient';
import type { FixtureVoteSubmitInput, FixtureVoteSummary } from '../types/fixtureVoting';

const FIXTURE_VOTING_QUERY_ROOT = 'fixture-voting';

type FetchFixtureVoteSummaryInput = {
  fixtureId: string;
  homeTeamSlug?: string | null;
  awayTeamSlug?: string | null;
  voterKey: string;
};

type FixtureVoteSummaryRpcRow = {
  fixture_id?: string | null;
  home_votes?: number | string | null;
  away_votes?: number | string | null;
  total_votes?: number | string | null;
  current_user_vote?: string | null;
};

function text(value: unknown) {
  return String(value || '').trim();
}

function normalizeTeamSlug(value?: string | null) {
  const normalized = text(value).toLowerCase();
  return normalized || null;
}

function assertUuid(value: string, fieldName: string) {
  const normalized = text(value);
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);

  if (!valid) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
}

function toCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

export function getFixtureVotingQueryBase(fixtureId?: string | null) {
  return [FIXTURE_VOTING_QUERY_ROOT, text(fixtureId)] as const;
}

export function getFixtureVotingQueryKey(fixtureId?: string | null, voterKey?: string | null) {
  return [...getFixtureVotingQueryBase(fixtureId), text(voterKey)] as const;
}

export async function fetchFixtureVoteSummary(
  input: FetchFixtureVoteSummaryInput,
): Promise<FixtureVoteSummary> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client is not configured (missing env vars).');
  }

  assertUuid(input.fixtureId, 'fixtureId');

  const { data, error } = await supabase
    .rpc('eg_get_fixture_vote_summary', {
      p_fixture_id: input.fixtureId,
      p_home_team_slug: normalizeTeamSlug(input.homeTeamSlug),
      p_away_team_slug: normalizeTeamSlug(input.awayTeamSlug),
      p_voter_key: text(input.voterKey) || null,
    })
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to fetch fixture vote summary');
  }

  const row = ((data || {}) as FixtureVoteSummaryRpcRow) || {};
  const homeVotes = toCount(row.home_votes);
  const awayVotes = toCount(row.away_votes);
  const totalVotes = toCount(row.total_votes);

  return {
    fixtureId: text(row.fixture_id) || text(input.fixtureId),
    homeVotes,
    awayVotes,
    totalVotes,
    currentUserVote: normalizeTeamSlug(row.current_user_vote),
    hasVotes: totalVotes > 0,
  };
}

export async function submitFixtureVote(
  input: FixtureVoteSubmitInput & { voterKey: string },
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client is not configured (missing env vars).');
  }

  assertUuid(input.fixtureId, 'fixtureId');

  const selectedTeamSlug = normalizeTeamSlug(input.selectedTeamSlug);
  const voterKey = text(input.voterKey);

  if (!selectedTeamSlug) {
    throw new Error('selectedTeamSlug is required');
  }

  if (!voterKey) {
    throw new Error('voterKey is required');
  }

  const { error } = await supabase.rpc('eg_cast_fixture_vote', {
    p_fixture_id: input.fixtureId,
    p_team_slug: selectedTeamSlug,
    p_voter_key: voterKey,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit fixture vote');
  }
}
