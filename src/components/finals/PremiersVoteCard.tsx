import React from 'react';
import { Shield, Trophy, X } from 'lucide-react';
import SmartImg from '../SmartImg';
import { usePredictionVoting } from '../../hooks/usePredictionVoting';
import { usePredictionVotingSubmit } from '../../hooks/usePredictionVotingSubmit';
import { useAuth } from '../../state/auth/AuthProvider';
import type { PredictionVoteOption } from '../../types/predictionVoting';
import '../../styles/premiers-vote-card.css';

export type PremiersVoteCardOption = PredictionVoteOption & {
  logoUrl?: string | null;
  rank: number;
  points?: number;
  percentage?: number;
};

type PremiersVoteCardProps = {
  pollKey: string;
  options: PremiersVoteCardOption[];
  coachVotes?: Map<string, string[]>;
};

function formatPercentage(value?: number) {
  if (!Number.isFinite(value)) return null;
  return `${Number(value).toFixed(1)}%`;
}

function PremiersVoteCardSkeleton() {
  return (
    <section className="premiersVoteTrigger premiersVoteTrigger--loading" aria-hidden="true">
      <div className="premiersVoteTrigger__top">
        <div className="premiersVoteCard__sk premiersVoteCard__sk--badge" />
        <div className="premiersVoteCard__sk premiersVoteCard__sk--meta" />
      </div>
      <div className="premiersVoteCard__sk premiersVoteCard__sk--headline" />
      <div className="premiersVoteCard__sk premiersVoteCard__sk--footer" />
    </section>
  );
}

export default function PremiersVoteCard({ pollKey, options, coachVotes }: PremiersVoteCardProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const [optimisticVote, setOptimisticVote] = React.useState<string | null>(null);
  const normalizedPollKey = String(pollKey || '').trim();
  const coachVoterKey = React.useMemo(() => {
    const userId = String(user?.id || '').trim();
    const teamId = String(user?.teamId || '').trim();
    if (!userId || !teamId) return '';
    return `coach:${userId}`;
  }, [user?.id, user?.teamId]);
  const canVoteAsCoach = Boolean(coachVoterKey);
  const normalizedOptions = options.map((option) => ({
    ...option,
    key: String(option.key || '').trim().toLowerCase(),
    label: String(option.label || '').trim(),
  }));

  const {
    options: voteOptions,
    totalVotes,
    currentUserVote,
    hasVotes,
    mode,
    isLoading,
    error,
  } = usePredictionVoting(
    normalizedPollKey,
    normalizedOptions.map((option) => ({ key: option.key, label: option.label })),
    coachVoterKey || null,
  );
  const { submitVote, isSubmitting, error: submitError } = usePredictionVotingSubmit(coachVoterKey || null);

  const activeError = submitError || error;
  const voteMap = new Map(voteOptions.map((option) => [option.key, option]));
  const selectedVoteKey = optimisticVote || currentUserVote || null;
  const leader = normalizedOptions
    .map((option) => ({ option, result: voteMap.get(option.key) }))
    .sort((a, b) => (b.result?.votes || 0) - (a.result?.votes || 0))[0];
  const currentSelection = normalizedOptions.find((option) => option.key === selectedVoteKey) || null;
  const featuredOptions = normalizedOptions.slice(0, 3);

  const helperCopy = activeError
    ? 'We could not refresh the public totals just now, but you can still lock in your premiers tip.'
    : !canVoteAsCoach
      ? 'Sign in as your assigned coach account to cast the single live premiers vote for your club.'
    : mode === 'local'
      ? selectedVoteKey
        ? 'Your coach vote is saved. Public totals will appear once the shared poll is available.'
        : 'Every coach gets one live vote. Lock in your premiers tip before finals bounce.'
      : 'One live vote per coach. You can change your tip before first bounce.';

  const handleVote = async (optionKey: string) => {
    if (!canVoteAsCoach || !normalizedPollKey || !optionKey || isSubmitting || selectedVoteKey === optionKey) return;
    setOptimisticVote(optionKey);
    try {
      await submitVote(normalizedPollKey, optionKey);
    } catch {
      setOptimisticVote(currentUserVote || null);
      // Surface via hook error state without breaking the card.
    }
  };

  React.useEffect(() => {
    if (!optimisticVote || optimisticVote !== currentUserVote) return;
    setOptimisticVote(null);
  }, [currentUserVote, optimisticVote]);

  React.useEffect(() => {
    if (!activeError) return;
    setOptimisticVote(currentUserVote || null);
  }, [activeError, currentUserVote]);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!normalizedPollKey || !normalizedOptions.length) return null;
  if (isLoading) return <PremiersVoteCardSkeleton />;

  return (
    <>
      <button
        type="button"
        className={`premiersVoteTrigger ${selectedVoteKey ? 'has-selection' : ''}`}
        aria-label="Open premiers vote"
        onClick={() => setIsOpen(true)}
      >
        <div className="premiersVoteTrigger__top">
          <span className="premiersVoteCard__badge">
            <Trophy size={13} strokeWidth={2.2} />
            Premiers Vote
          </span>
          <span className="premiersVoteCard__meta">
            <Shield size={12} strokeWidth={2.2} />
            Top 8 live ladder
          </span>
        </div>

        {coachVotes && coachVotes.size > 0 ? (
          <div className="premiersVoteTrigger__breakdown">
            {normalizedOptions
              .filter((opt) => (coachVotes.get(opt.key) || []).length > 0)
              .sort((a, b) => (voteMap.get(b.key)?.votes || 0) - (voteMap.get(a.key)?.votes || 0))
              .slice(0, 4)
              .map((opt) => {
                const names = coachVotes.get(opt.key) || [];
                const result = voteMap.get(opt.key);
                const pct = result?.pct || 0;
                return (
                  <div key={opt.key} className={`premiersVoteTrigger__bdRow${selectedVoteKey === opt.key ? ' is-mine' : ''}`}>
                    <SmartImg
                      className="premiersVoteTrigger__bdLogo"
                      src={opt.logoUrl || ''}
                      alt={opt.label}
                      fallbackText={opt.label.slice(0, 2).toUpperCase()}
                      loading="lazy"
                      decoding="async"
                      width={22}
                      height={22}
                    />
                    <span className="premiersVoteTrigger__bdTeam">{opt.label}</span>
                    <span className="premiersVoteTrigger__bdCoaches">{names.join(', ')}</span>
                    {hasVotes && mode === 'live' ? (
                      <span className="premiersVoteTrigger__bdPct">{pct}%</span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="premiersVoteTrigger__body">
            <div className="premiersVoteTrigger__copy">
              <h3 className="premiersVoteTrigger__title">
                {currentSelection ? `${currentSelection.label} tipped` : 'Premiership vote'}
              </h3>
              <p className="premiersVoteTrigger__subline">
                {leader?.result?.votes
                  ? `${leader.option.label} leads with ${leader.result.votes} vote${leader.result.votes === 1 ? '' : 's'}.`
                  : 'Pick your flag favourite before finals begin.'}
              </p>
            </div>
            <div className="premiersVoteTrigger__side">
              <div className="premiersVoteTrigger__logos" aria-hidden="true">
                {featuredOptions.map((option) => (
                  <span key={option.key} className="premiersVoteTrigger__logoChip">
                    <SmartImg
                      className="premiersVoteTrigger__logo"
                      src={option.logoUrl || ''}
                      alt=""
                      fallbackText={option.label.slice(0, 2).toUpperCase()}
                      loading="lazy"
                      decoding="async"
                      width={28}
                      height={28}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="premiersVoteTrigger__footer">
          <span className="premiersVoteCard__voteSummary">
            {mode === 'live'
              ? totalVotes > 0
                ? `${totalVotes} coach vote${totalVotes === 1 ? '' : 's'}`
                : 'No public votes yet'
              : selectedVoteKey
                ? 'Coach vote saved'
                : canVoteAsCoach
                  ? 'Tap to lock your club vote'
                  : 'Coach sign-in required'}
          </span>
          <span className={`premiersVoteTrigger__helper ${activeError ? 'is-error' : ''}`}>
            {currentSelection ? 'Change tip' : canVoteAsCoach ? 'Tap to vote' : 'View totals'}
          </span>
        </div>
      </button>

      {isOpen ? (
        <div className="premiersVoteModal" role="dialog" aria-modal="true" aria-label="Premiers vote" onClick={() => setIsOpen(false)}>
          <div className="premiersVoteModal__panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="premiersVoteModal__close"
              aria-label="Close premiers vote"
              onClick={() => setIsOpen(false)}
            >
              <X size={18} strokeWidth={2.2} />
            </button>

            <section className={`premiersVoteCard ${selectedVoteKey ? 'has-selection' : ''}`} aria-label="Premiers fan vote">
              <div className="premiersVoteCard__header">
                <span className="premiersVoteCard__badge">
                  <Trophy size={13} strokeWidth={2.2} />
                  Premiers Vote
                </span>
                <span className="premiersVoteCard__meta">
                  <Shield size={12} strokeWidth={2.2} />
                  Top 8 live ladder
                </span>
              </div>

              <div className="premiersVoteCard__headlineWrap">
                <h3 className="premiersVoteCard__headline">Who wins the premiership?</h3>
                <p className="premiersVoteCard__subline">Lock in your flag favourite before finals begin.</p>
              </div>

              <div className="premiersVoteCard__statusRow">
                <span
                  className={`premiersVoteCard__status ${
                    isSubmitting ? 'is-saving' : selectedVoteKey ? 'is-selected' : ''
                  }`}
                >
                  {isSubmitting
                    ? 'Saving your tip...'
                    : currentSelection
                      ? `${currentSelection.label} locked in`
                      : canVoteAsCoach
                        ? 'Tap a club to save instantly'
                        : 'Coach sign-in required to vote'}
                </span>
              </div>

              <div className="premiersVoteCard__grid">
                {normalizedOptions.map((option) => {
                  const result = voteMap.get(option.key);
                  const isSelected = selectedVoteKey === option.key;
                  const livePct = result?.pct || 0;
                  const statLine = [`#${option.rank}`, option.points != null ? `${option.points} pts` : null, formatPercentage(option.percentage)]
                    .filter(Boolean)
                    .join(' • ');

                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`premiersVoteCard__option ${isSelected ? 'is-selected' : ''}`}
                      aria-pressed={isSelected}
                      disabled={isSubmitting || !canVoteAsCoach}
                      onClick={() => void handleVote(option.key)}
                    >
                      <div className="premiersVoteCard__optionTop">
                        <span className="premiersVoteCard__seed">#{option.rank}</span>
                        <span className={`premiersVoteCard__share ${!hasVotes ? 'is-muted' : ''}`}>
                          {hasVotes && mode === 'live' ? `${livePct}%` : isSelected ? 'Your tip' : 'Select'}
                        </span>
                      </div>

                      <div className="premiersVoteCard__optionBody">
                        <div className="premiersVoteCard__logoWrap">
                          <SmartImg
                            className="premiersVoteCard__logo"
                            src={option.logoUrl || ''}
                            alt={option.label}
                            fallbackText={option.label.slice(0, 3).toUpperCase()}
                            loading="lazy"
                            decoding="async"
                            width={42}
                            height={42}
                          />
                        </div>
                        <div className="premiersVoteCard__copy">
                          <span className="premiersVoteCard__teamName">{option.label}</span>
                          <span className="premiersVoteCard__teamMeta">{statLine}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="premiersVoteCard__footer">
                <div className="premiersVoteCard__voteSummary">
                  {mode === 'live'
                    ? totalVotes > 0
                      ? `${totalVotes} coach vote${totalVotes === 1 ? '' : 's'}`
                      : 'No public votes yet'
                    : selectedVoteKey
                      ? 'Coach vote saved'
                      : canVoteAsCoach
                        ? 'Choose your premiers tip'
                        : 'Coach sign-in required to vote'}
                </div>
                {leader?.result?.votes ? (
                  <div className="premiersVoteCard__leaderCallout">
                    Leader: {leader.option.label} with {leader.result.votes} vote{leader.result.votes === 1 ? '' : 's'}
                  </div>
                ) : null}
                <div className={`premiersVoteCard__helper ${activeError ? 'is-error' : ''}`}>{helperCopy}</div>
              </div>

              <div className="premiersVoteCard__modalActions">
                <button
                  type="button"
                  className="premiersVoteCard__closeBtn"
                  onClick={() => setIsOpen(false)}
                >
                  Close vote
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
