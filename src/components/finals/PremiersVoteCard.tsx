import React from 'react';
import { Shield, Trophy } from 'lucide-react';
import SmartImg from '../SmartImg';
import { usePredictionVoting } from '../../hooks/usePredictionVoting';
import { usePredictionVotingSubmit } from '../../hooks/usePredictionVotingSubmit';
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
};

function formatPercentage(value?: number) {
  if (!Number.isFinite(value)) return null;
  return `${Number(value).toFixed(1)}%`;
}

function PremiersVoteCardSkeleton() {
  return (
    <section className="premiersVoteCard premiersVoteCard--loading" aria-hidden="true">
      <div className="premiersVoteCard__header">
        <div className="premiersVoteCard__sk premiersVoteCard__sk--badge" />
        <div className="premiersVoteCard__sk premiersVoteCard__sk--meta" />
      </div>
      <div className="premiersVoteCard__sk premiersVoteCard__sk--headline" />
      <div className="premiersVoteCard__grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="premiersVoteCard__sk premiersVoteCard__sk--option" />
        ))}
      </div>
      <div className="premiersVoteCard__sk premiersVoteCard__sk--footer" />
    </section>
  );
}

export default function PremiersVoteCard({ pollKey, options }: PremiersVoteCardProps) {
  const normalizedPollKey = String(pollKey || '').trim();
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
  );
  const { submitVote, isSubmitting, error: submitError } = usePredictionVotingSubmit();

  const activeError = submitError || error;
  const voteMap = new Map(voteOptions.map((option) => [option.key, option]));
  const leader = normalizedOptions
    .map((option) => ({ option, result: voteMap.get(option.key) }))
    .sort((a, b) => (b.result?.votes || 0) - (a.result?.votes || 0))[0];

  const helperCopy = activeError
    ? 'We could not refresh the public totals just now, but you can still lock in your premiers tip.'
    : mode === 'local'
      ? currentUserVote
        ? 'Your premiers tip is saved on this device. Public totals will appear once the shared poll is available.'
        : 'Pick your premiers now. Your tip will stay saved on this device until the live poll backend is available.'
      : 'You can change your premiers tip any time before finals bounce.';

  const handleVote = async (optionKey: string) => {
    if (!normalizedPollKey || !optionKey || isSubmitting || currentUserVote === optionKey) return;
    try {
      await submitVote(normalizedPollKey, optionKey);
    } catch {
      // Surface via hook error state without breaking the card.
    }
  };

  if (!normalizedPollKey || !normalizedOptions.length) return null;
  if (isLoading) return <PremiersVoteCardSkeleton />;

  return (
    <section className={`premiersVoteCard ${currentUserVote ? 'has-selection' : ''}`} aria-label="Premiers fan vote">
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

      <div className="premiersVoteCard__grid">
        {normalizedOptions.map((option) => {
          const result = voteMap.get(option.key);
          const isSelected = currentUserVote === option.key;
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
              disabled={isSubmitting}
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
              ? `${totalVotes} total vote${totalVotes === 1 ? '' : 's'}`
              : 'No public votes yet'
            : currentUserVote
              ? 'Private tip saved on this device'
              : 'Choose your premiers tip'}
        </div>
        {leader?.result?.votes ? (
          <div className="premiersVoteCard__leaderCallout">
            Leader: {leader.option.label} on {leader.result.pct}%
          </div>
        ) : null}
        <div className={`premiersVoteCard__helper ${activeError ? 'is-error' : ''}`}>{helperCopy}</div>
      </div>
    </section>
  );
}
