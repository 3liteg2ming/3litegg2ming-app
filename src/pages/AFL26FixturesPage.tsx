import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { FixtureSkeletons } from '../components/FixtureSkeleton';
import { useNextFixtures, useAllFixtures } from '../hooks/useFixtures';
import { afl26LocalRounds } from '../data/afl26LocalRounds';

import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'LIVE' | 'FINAL';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SCHEDULED', label: 'Upcoming' },
  { key: 'LIVE', label: 'Live' },
  { key: 'FINAL', label: 'Full Time' },
];

export default function AFL26FixturesPage() {
  const navigate = useNavigate();

  const [activeRound, setActiveRound] = useState(1);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');

  // Load next fixtures immediately, all fixtures in background
  const nextFixturesQuery = useNextFixtures('afl26', 3);
  const allFixturesQuery = useAllFixtures('afl26', nextFixturesQuery.isSuccess);

  // Extract fixtures - combine next + all for complete list
  const allFixtures = useMemo(() => {
    // Prefer all fixtures if loaded, fallback to next fixtures
    const fixtures = allFixturesQuery.data ?? nextFixturesQuery.data ?? [];

    // Group by round
    const rounds = new Map<number, any[]>();
    fixtures.forEach((f: any) => {
      const roundNum = f.round || 1;
      if (!rounds.has(roundNum)) rounds.set(roundNum, []);
      rounds.get(roundNum)!.push(f);
    });

    return Array.from(rounds.entries())
      .sort((a, b) => b[0] - a[0]) // Descending round order
      .map(([roundNum, fixtures]) => ({
        round: roundNum,
        matches: fixtures.sort((a: any, b: any) => {
          // Sort by start_time ascending within round
          const aTime = new Date(a.start_time || 0).getTime();
          const bTime = new Date(b.start_time || 0).getTime();
          return aTime - bTime;
        }),
      }));
  }, [nextFixturesQuery.data, allFixturesQuery.data]);

  // Set initial active round
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
      const status = f.status || 'SCHEDULED';
      if (activeFilter === 'SCHEDULED') return status === 'SCHEDULED';
      if (activeFilter === 'LIVE') return status === 'LIVE';
      if (activeFilter === 'FINAL') return status === 'FINAL';
      return true;
    });
  }, [currentRound, activeFilter]);

  const uiMatches: FixturePosterMatch[] = useMemo(
    () =>
      (filteredMatches || []).map((f: any) => {
        // Use team slug as the key (matches TEAM_ASSETS structure)
        const homeTeamKey = (f.home_team_slug || f.home_team_key || '') as any;
        const awayTeamKey = (f.away_team_slug || f.away_team_key || '') as any;

        // Build score objects
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

        return {
          id: f.id,
          round: activeRound,
          venue: f.venue || 'TBA',
          status: f.status || 'SCHEDULED',
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
