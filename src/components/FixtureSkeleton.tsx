import React from 'react';

/**
 * Skeleton loader for a single fixture card
 * Matches the dimensions of FixturePosterCard
 */
export function FixtureSkeleton() {
  return (
    <div className="fx-skeleton-card">
      <div className="fx-skeleton-header">
        <div className="fx-skeleton-round" />
        <div className="fx-skeleton-time" />
      </div>
      <div className="fx-skeleton-teams">
        <div className="fx-skeleton-team">
          <div className="fx-skeleton-logo" />
          <div className="fx-skeleton-name" />
          <div className="fx-skeleton-score" />
        </div>
        <div className="fx-skeleton-divider" />
        <div className="fx-skeleton-team">
          <div className="fx-skeleton-score" />
          <div className="fx-skeleton-name" />
          <div className="fx-skeleton-logo" />
        </div>
      </div>
      <div className="fx-skeleton-footer">
        <div className="fx-skeleton-status" />
      </div>
    </div>
  );
}

/**
 * Render multiple skeleton loaders
 */
export function FixtureSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="fxAflList">
      {Array.from({ length: count }).map((_, i) => (
        <FixtureSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  );
}
