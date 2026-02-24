import React from 'react';
import FixtureSpotlightCard, {
  type FixtureMatch,
  type FixtureScore,
} from './FixtureSpotlightCard';

// Keep the old exported types so the rest of the app doesn’t need refactors.
export type ScoreLine = FixtureScore;
export type SpotlightMatch = FixtureMatch;

export default function SpotlightMatchCard({ m }: { m: SpotlightMatch }) {
  return <FixtureSpotlightCard m={m} />;
}
