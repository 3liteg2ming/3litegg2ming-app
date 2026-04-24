import React from 'react';
import SmartImg from '../SmartImg';
import { useFixtureVoting } from '../../hooks/useFixtureVoting';
import { useFixtureVotingSubmit } from '../../hooks/useFixtureVotingSubmit';
import { resolveTeamLogoUrl } from '../../lib/entityResolvers';
import '../../styles/finals-vote-card.css';

type FinalsVoteCardProps = {
  fixtureId: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamSlug?: string;
  awayTeamSlug?: string;
  roundLabel?: string;
  startTime?: string;
  status?: string;
};

function text(value: unknown) {
  return String(value || '').trim();
}

function normalizeTeamName(name?: string, slug?: string) {
  const explicit = text(name);
  if (explicit) return explicit;

  const fromSlug = text(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return fromSlug || 'TBC';
}

function normalizeTeamSlug(slug?: string) {
  const normalized = text(slug).toLowerCase();
  return normalized || null;
}

function formatKickoffLabel(startTime?: string, status?: string) {
  const normalizedStatus = text(status).toUpperCase();
  if (normalizedStatus === 'LIVE') return 'Live now';
  if (normalizedStatus === 'FINAL') return 'Final';

  const raw = text(startTime);
  if (!raw) return '';

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function FinalsVoteCardSkeleton({ roundLabel }: { roundLabel?: string }) {
  return (
    <section className="finalsVoteCard finalsVoteCard--loading" aria-hidden="true">
      <div className="finalsVoteCard__topRow">
        <div className="finalsVoteCard__sk finalsVoteCard__sk--pill" />
        {roundLabel ? <div className="finalsVoteCard__sk finalsVoteCard__sk--round" /> : null}
      </div>
      <div className="finalsVoteCard__sk finalsVoteCard__sk--headline" />
      <div className="finalsVoteCard__actions">
        <div className="finalsVoteCard__sk finalsVoteCard__sk--teamBtn" />
        <div className="finalsVoteCard__sk finalsVoteCard__sk--teamBtn" />
      </div>
      <div className="finalsVoteCard__sk finalsVoteCard__sk--bar" />
      <div className="finalsVoteCard__sk finalsVoteCard__sk--foot" />
    </section>
  );
}

export default function FinalsVoteCard({
  fixtureId,
  homeTeamName,
  awayTeamName,
  homeTeamSlug,
  awayTeamSlug,
  roundLabel,
  startTime,
  status,
}: FinalsVoteCardProps) {
  const safeFixtureId = text(fixtureId);
  if (!safeFixtureId) return null;

  const resolvedHomeName = normalizeTeamName(homeTeamName, homeTeamSlug);
  const resolvedAwayName = normalizeTeamName(awayTeamName, awayTeamSlug);
  const safeHomeSlug = normalizeTeamSlug(homeTeamSlug);
  const safeAwaySlug = normalizeTeamSlug(awayTeamSlug);
  const kickoffLabel = formatKickoffLabel(startTime, status);

  const hasKnownMatchup = resolvedHomeName !== 'TBC' && resolvedAwayName !== 'TBC';
  const homeName = hasKnownMatchup ? resolvedHomeName : 'TBC';
  const awayName = hasKnownMatchup ? resolvedAwayName : 'TBC';
  const canVote = Boolean(safeHomeSlug && safeAwaySlug && hasKnownMatchup);

  const homeLogo = hasKnownMatchup
    ? resolveTeamLogoUrl({
        slug: safeHomeSlug,
        name: homeName,
        fallbackPath: 'elite-gaming-logo.png',
      })
    : '';
  const awayLogo = hasKnownMatchup
    ? resolveTeamLogoUrl({
        slug: safeAwaySlug,
        name: awayName,
        fallbackPath: 'elite-gaming-logo.png',
      })
    : '';

  const {
    homeVotes,
    awayVotes,
    totalVotes,
    homePct,
    awayPct,
    currentUserVote,
    hasVotes,
    isLoading,
    error,
  } = useFixtureVoting(safeFixtureId, safeHomeSlug, safeAwaySlug);
  const { submitVote, isSubmitting, error: submitError } = useFixtureVotingSubmit();

  const activeError = submitError || error;
  const neutralPct = 50;
  const displayedHomePct = hasVotes ? homePct : neutralPct;
  const displayedAwayPct = hasVotes ? awayPct : neutralPct;
  const isHomeSelected = currentUserVote != null && currentUserVote === safeHomeSlug;
  const isAwaySelected = currentUserVote != null && currentUserVote === safeAwaySlug;
  const helperCopy = !hasKnownMatchup
    ? 'Matchup to be confirmed.'
    : !canVote
      ? 'Voting opens once this matchup is ready.'
    : activeError
      ? 'Live vote totals are unavailable right now.'
      : 'Vote updates live as fans lock in their tip.';

  const handleVote = async (teamSlug: string | null) => {
    if (!teamSlug || !canVote || isSubmitting || currentUserVote === teamSlug) return;
    try {
      await submitVote(safeFixtureId, teamSlug);
    } catch {
      // Surface via hook error state without breaking the card.
    }
  };

  if (isLoading) {
    return <FinalsVoteCardSkeleton roundLabel={roundLabel} />;
  }

  return (
    <section
      className={`finalsVoteCard ${!canVote ? 'is-disabled' : ''} ${currentUserVote ? 'has-selection' : ''}`}
      aria-label="Finals fan vote"
    >
      {homeLogo ? (
        <div className="finalsVoteCard__watermark finalsVoteCard__watermark--home" aria-hidden="true">
          <img src={homeLogo} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
      {awayLogo ? (
        <div className="finalsVoteCard__watermark finalsVoteCard__watermark--away" aria-hidden="true">
          <img src={awayLogo} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}

      <div className="finalsVoteCard__topRow">
        <span className="finalsVoteCard__badge">Fan Vote</span>
        <div className="finalsVoteCard__topMeta">
          {kickoffLabel ? <span className="finalsVoteCard__kickoff">{kickoffLabel}</span> : null}
          {text(roundLabel) ? <span className="finalsVoteCard__round">{roundLabel}</span> : null}
        </div>
      </div>

      <div className="finalsVoteCard__headlineWrap">
        <h3 className="finalsVoteCard__headline">Who wins this final?</h3>
        <p className="finalsVoteCard__subline">{homeName} vs {awayName}</p>
      </div>

      <div className="finalsVoteCard__actions">
        <button
          type="button"
          className={`finalsVoteCard__teamButton ${isHomeSelected ? 'is-selected' : ''}`}
          disabled={!canVote || isSubmitting}
          aria-pressed={isHomeSelected}
          onClick={() => void handleVote(safeHomeSlug)}
        >
          <div className="finalsVoteCard__teamButtonLogo">
            <SmartImg
              className="finalsVoteCard__teamLogo"
              src={homeLogo}
              alt={homeName}
              fallbackText={homeName.slice(0, 3).toUpperCase()}
              loading="lazy"
              decoding="async"
              width={44}
              height={44}
            />
          </div>
          <div className="finalsVoteCard__teamButtonText">
            <span className="finalsVoteCard__teamLabel">{homeName}</span>
            <span className="finalsVoteCard__teamMeta">{isHomeSelected ? 'Your tip' : 'Vote home'}</span>
          </div>
        </button>

        <button
          type="button"
          className={`finalsVoteCard__teamButton ${isAwaySelected ? 'is-selected' : ''}`}
          disabled={!canVote || isSubmitting}
          aria-pressed={isAwaySelected}
          onClick={() => void handleVote(safeAwaySlug)}
        >
          <div className="finalsVoteCard__teamButtonLogo">
            <SmartImg
              className="finalsVoteCard__teamLogo"
              src={awayLogo}
              alt={awayName}
              fallbackText={awayName.slice(0, 3).toUpperCase()}
              loading="lazy"
              decoding="async"
              width={44}
              height={44}
            />
          </div>
          <div className="finalsVoteCard__teamButtonText">
            <span className="finalsVoteCard__teamLabel">{awayName}</span>
            <span className="finalsVoteCard__teamMeta">{isAwaySelected ? 'Your tip' : 'Vote away'}</span>
          </div>
        </button>
      </div>

      <div className="finalsVoteCard__barBlock">
        <div className="finalsVoteCard__percentRow">
          <div className={`finalsVoteCard__percentStat ${!hasVotes ? 'is-neutral' : ''}`}>
            <span className="finalsVoteCard__percentTeam">{homeName}</span>
            <strong>{displayedHomePct}%</strong>
          </div>
          <div className={`finalsVoteCard__percentStat finalsVoteCard__percentStat--away ${!hasVotes ? 'is-neutral' : ''}`}>
            <span className="finalsVoteCard__percentTeam">{awayName}</span>
            <strong>{displayedAwayPct}%</strong>
          </div>
        </div>

        <div className={`finalsVoteCard__splitBar ${!hasVotes ? 'is-empty' : ''}`}>
          <span
            className="finalsVoteCard__splitFill finalsVoteCard__splitFill--home"
            style={{ width: `${displayedHomePct}%` }}
          />
          <span
            className="finalsVoteCard__splitFill finalsVoteCard__splitFill--away"
            style={{ width: `${displayedAwayPct}%` }}
          />
          <span className="finalsVoteCard__splitDivider" aria-hidden="true" />
          {!hasVotes ? (
            <span className="finalsVoteCard__emptyLabel">
              {canVote ? 'Be the first to vote' : !hasKnownMatchup ? 'Matchup to be confirmed' : 'Voting unavailable'}
            </span>
          ) : null}
        </div>

        <div className="finalsVoteCard__voteMeta">
          <span className="finalsVoteCard__voteCount">
            {totalVotes > 0 ? `${totalVotes} total vote${totalVotes === 1 ? '' : 's'}` : 'No votes yet'}
          </span>
          {hasVotes ? (
            <span className="finalsVoteCard__voteBreakdown">
              {homeVotes} for {homeName} • {awayVotes} for {awayName}
            </span>
          ) : null}
        </div>
      </div>

      <div className={`finalsVoteCard__helper ${activeError ? 'is-error' : ''}`}>{helperCopy}</div>
    </section>
  );
}
