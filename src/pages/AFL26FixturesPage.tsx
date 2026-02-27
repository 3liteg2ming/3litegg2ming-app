import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { FixtureSkeletons } from '../components/FixtureSkeleton';
import { useNextFixtures, useAllFixtures } from '../hooks/useFixtures';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';

import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'FINAL';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SCHEDULED', label: 'Upcoming' },
  { key: 'FINAL', label: 'Full Time' },
];

export default function AFL26FixturesPage() {
  const navigate = useNavigate();

  const [activeRound, setActiveRound] = useState(1);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');
  const seasonSlug = getDataSeasonSlugForCompetition(getStoredCompetitionKey());

  // Load next fixtures immediately, all fixtures in background
  const nextFixturesQuery = useNextFixtures(seasonSlug, 3);
  const allFixturesQuery = useAllFixtures(seasonSlug, nextFixturesQuery.isSuccess);

  // Extract fixtures - combine next + all for complete list
  const allFixtures = useMemo(() => {
    const fixtures = (allFixturesQuery.data ?? nextFixturesQuery.data ?? []) as any[];

    const rounds = new Map<number, any[]>();
    fixtures.forEach((f: any) => {
      const roundNum = f.round || 1;
      if (!rounds.has(roundNum)) rounds.set(roundNum, []);
      rounds.get(roundNum)!.push(f);
    });

    return Array.from(rounds.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([roundNum, roundFixtures]) => ({
        round: roundNum,
        matches: roundFixtures.sort((a: any, b: any) => {
          const aTime = new Date(a.start_time || 0).getTime();
          const bTime = new Date(b.start_time || 0).getTime();
          return aTime - bTime;
        }),
      }));
  }, [nextFixturesQuery.data, allFixturesQuery.data]);

  useEffect(() => {
    if (allFixtures.length && !allFixtures.find((x) => x.round === activeRound)) {
      setActiveRound(allFixtures[0].round);
    }
  }, [allFixtures, activeRound]);

  const currentRound = allFixtures.find((r) => r.round === activeRound) || allFixtures[0];
  const totalMatches = currentRound?.matches?.length || 0;

  const filteredMatches = useMemo(() => {
    const list = currentRound?.matches || [];
    if (activeFilter === 'ALL') return list;

    return list.filter((f: any) => {
      const status = String(f.status || 'SCHEDULED').toUpperCase();
      if (activeFilter === 'SCHEDULED') return status === 'SCHEDULED';
      if (activeFilter === 'FINAL') return status === 'FINAL';
      return true;
    });
  }, [currentRound, activeFilter]);

  const uiMatches: FixturePosterMatch[] = useMemo(
    () =>
      (filteredMatches || []).map((f: any) => {
        const homeTeamKey = (f.home_team_slug || f.home_team_key || '') as any;
        const awayTeamKey = (f.away_team_slug || f.away_team_key || '') as any;

        const homeScore = f.home_goals !== null && f.home_goals !== undefined
          ? {
              goals: f.home_goals,
              behinds: f.home_behinds || 0,
              total: f.home_total || (f.home_goals * 6) + (f.home_behinds || 0),
            }
          : undefined;

        const awayScore = f.away_goals !== null && f.away_goals !== undefined
          ? {
              goals: f.away_goals,
              behinds: f.away_behinds || 0,
              total: f.away_total || (f.away_goals * 6) + (f.away_behinds || 0),
            }
          : undefined;

        const status = String(f.status || 'SCHEDULED').toUpperCase() as FixturePosterMatch['status'];

        return {
          id: f.id,
          round: activeRound,
          venue: f.venue || 'TBA',
          status,
          home: homeTeamKey,
          away: awayTeamKey,
          homeScore,
          awayScore,
          onMatchCentreClick: () => navigate(`/match-centre/${f.id}`),
        };
      }),
    [filteredMatches, navigate, activeRound]
  );

  const isLoading = nextFixturesQuery.isLoading;
  const isError = nextFixturesQuery.isError;

  return (
    <div className="fxAflPage">
      <div className="fxAflInner">
        <div className="fxAflStickyNav">
          <div className="fxAflRounds" aria-label="Rounds">
            {(allFixtures || []).map((r) => (
              <button
                key={r.round}
                type="button"
                className={`fxAflRound ${r.round === activeRound ? 'fxAflRound--active' : ''}`}
                onClick={() => setActiveRound(r.round)}
              >
                {r.round}
              </button>
            ))}
          </div>
        </div>

        <div className="fxAflPanel">
          <div className="fxAflPanel__top">
            <div className="fxAflRoundTitle">Round {activeRound}</div>
            <div className="fxAflRoundMeta">{totalMatches} Matches</div>
          </div>

          <div className="fxAflFilters" aria-label="Filter matches">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`fxAflFilter ${activeFilter === f.key ? 'fxAflFilter--active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isError ? (
            <div className="fxAflNotice">
              Unable to load fixtures. Please check your connection.
            </div>
          ) : null}

          {isLoading ? (
            <FixtureSkeletons count={3} />
          ) : uiMatches.length === 0 ? (
            <div className="fxAflEmpty">No matches found for this filter.</div>
          ) : (
            <div className="fxAflList">
              {uiMatches.map((m) => (
                <FixturePosterCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 18 }} />
      </div>
    </div>
  );
}
