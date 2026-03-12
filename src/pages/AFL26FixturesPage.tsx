import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Filter } from 'lucide-react';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { FixtureSkeletons } from '../components/FixtureSkeleton';
import FixturesCompetitionSheet from '../components/fixtures/FixturesCompetitionSheet';
import FixturesFilterSheet from '../components/fixtures/FixturesFilterSheet';
import { useSeasonFixtures } from '../hooks/useFixtures';
import { useTeamOptions } from '../hooks/useTeams';
import {
  getDataSeasonSlugForCompetition,
  getStoredCompetitionKey,
  getUiCompetition,
  setStoredCompetitionKey,
  type CompetitionKey,
} from '../lib/competitionRegistry';
import { resolveTeamKey } from '../lib/entityResolvers';
import { deriveFixtureRound, normalizeFixtureStatus, type FixtureRow } from '../lib/fixturesRepo';
import { fetchCurrentCoaches, type HomeCoach } from '../lib/homeRepo';
import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'FINAL';

type StageGroup = {
  id: string;
  label: string;
  index: number;
  matches: FixtureRow[];
};

type TeamOption = {
  id: string;
  name: string;
};

const INITIAL_RENDER_COUNT = 6;
const RENDER_BATCH = 6;

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.trunc(n);
  return rounded > 0 ? rounded : null;
}

function buildRegularStageGroups(fixtures: FixtureRow[]): StageGroup[] {
  const grouped = new Map<number, FixtureRow[]>();

  for (const fixture of fixtures) {
    const index = toPositiveInt(fixture.round) ?? toPositiveInt(fixture.stage_index) ?? 1;
    const list = grouped.get(index) || [];
    list.push(fixture);
    grouped.set(index, list);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, matches]) => ({
      id: `round-${index}`,
      index,
      label: `R${index}`,
      matches: matches.sort((a, b) => {
        const aTime = new Date(a.start_time || 0).getTime();
        const bTime = new Date(b.start_time || 0).getTime();
        return aTime - bTime;
      }),
    }));
}

function stageHasIdentity(fixture: FixtureRow, side: 'home' | 'away') {
  const byId = side === 'home' ? fixture.home_team_id : fixture.away_team_id;
  const bySlug = side === 'home' ? fixture.home_team_slug : fixture.away_team_slug;
  const byJoinName = side === 'home' ? fixture.home_team_name : fixture.away_team_name;
  return Boolean(String(byId || bySlug || byJoinName || '').trim());
}

function formatDateText(startTime?: string | null): string {
  const raw = String(startTime || '').trim();
  if (!raw) return 'Time TBA';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Time TBA';
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function mapToPosterMatch(
  fixture: FixtureRow,
  navigate: ReturnType<typeof useNavigate>,
  isPreseasonMode: boolean,
  coachesByTeamId: Map<string, HomeCoach>,
): FixturePosterMatch {
  const roundNumber = deriveFixtureRound(fixture);
  const home = resolveTeamKey({
    slug: fixture.home_team_slug,
    teamKey: fixture.home_team_key,
    name: fixture.home_team_name || fixture.home_team_short_name,
  });
  const away = resolveTeamKey({
    slug: fixture.away_team_slug,
    teamKey: fixture.away_team_key,
    name: fixture.away_team_name || fixture.away_team_short_name,
  });

  const homeGoals = Number(fixture.home_goals ?? 0);
  const homeBehinds = Number(fixture.home_behinds ?? 0);
  const awayGoals = Number(fixture.away_goals ?? 0);
  const awayBehinds = Number(fixture.away_behinds ?? 0);

  const homeScore =
    fixture.home_goals !== null && fixture.home_goals !== undefined
      ? {
          goals: homeGoals,
          behinds: homeBehinds,
          total: Number(fixture.home_total ?? homeGoals * 6 + homeBehinds),
        }
      : undefined;

  const awayScore =
    fixture.away_goals !== null && fixture.away_goals !== undefined
      ? {
          goals: awayGoals,
          behinds: awayBehinds,
          total: Number(fixture.away_total ?? awayGoals * 6 + awayBehinds),
        }
      : undefined;

  const homeCoach = String(fixture.home_team_id || '').trim()
    ? coachesByTeamId.get(String(fixture.home_team_id || '').trim()) || null
    : null;
  const awayCoach = String(fixture.away_team_id || '').trim()
    ? coachesByTeamId.get(String(fixture.away_team_id || '').trim()) || null
    : null;

  return {
    id: fixture.id,
    round: roundNumber,
    dateText: formatDateText(fixture.start_time),
    venue: fixture.venue || 'TBA',
    status: normalizeFixtureStatus(fixture.status, fixture) as FixturePosterMatch['status'],
    home: stageHasIdentity(fixture, 'home') ? home : 'unknown',
    away: stageHasIdentity(fixture, 'away') ? away : 'unknown',
    homeCoachName: homeCoach?.display_name || undefined,
    awayCoachName: awayCoach?.display_name || undefined,
    homePsn: homeCoach?.psn || undefined,
    awayPsn: awayCoach?.psn || undefined,
    homeCoachPsn: homeCoach?.psn || undefined,
    awayCoachPsn: awayCoach?.psn || undefined,
    homeScore,
    awayScore,
    headerTag: isPreseasonMode ? `Knockout • Round ${roundNumber}` : undefined,
    onMatchCentreClick: () => navigate(`/match-centre/${fixture.id}`),
  };
}

function getCompetitionOptions(): Array<{ key: CompetitionKey; label: string }> {
  return [
    { key: 'preseason', label: 'Knockout Preseason' },
    { key: 'afl26', label: 'AFL 26 Season Two' },
  ];
}

export default function AFL26FixturesPage() {
  const navigate = useNavigate();

  const competitionKey = getStoredCompetitionKey();
  const competitionLabel = competitionKey === 'afl26' ? 'AFL 26 Season Two' : getUiCompetition(competitionKey).label;
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);
  const isPreseasonMode = competitionKey === 'preseason';

  const [activeStageId, setActiveStageId] = useState<string>('');
  const [activeWeek, setActiveWeek] = useState<number>(1);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const [isDockCompact, setIsDockCompact] = useState(false);
  const [competitionSheetOpen, setCompetitionSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('ALL');
  const [selectedVenue, setSelectedVenue] = useState<string>('ALL');

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const seasonFixturesQuery = useSeasonFixtures(seasonSlug, { limit: 1000 });
  const coachesQuery = useQuery({
    queryKey: ['home', 'current-coaches'],
    queryFn: fetchCurrentCoaches,
    staleTime: 60_000,
    gcTime: 1_200_000,
  });
  const teamOptionsQuery = useTeamOptions();
  const teamOptions = (teamOptionsQuery.data || []) as TeamOption[];
  const coachesByTeamId = useMemo(() => {
    const map = new Map<string, HomeCoach>();
    for (const coach of coachesQuery.data || []) {
      const teamId = String(coach.team_id || '').trim();
      if (!teamId) continue;
      if (!map.has(teamId)) map.set(teamId, coach);
    }
    return map;
  }, [coachesQuery.data]);
  const allFixtures = useMemo<FixtureRow[]>(
    () => (Array.isArray(seasonFixturesQuery.data?.fixtures) ? seasonFixturesQuery.data?.fixtures || [] : []),
    [seasonFixturesQuery.data?.fixtures],
  );

  useEffect(() => {
    const scrollEl = document.querySelector('.eg-content-scroll') as HTMLElement | null;
    if (!scrollEl) return;

    const onScroll = () => {
      setIsDockCompact(scrollEl.scrollTop > 24);
    };

    onScroll();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setActiveStatus('ALL');
    setSelectedTeamId('ALL');
    setSelectedVenue('ALL');
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [competitionKey]);

  const regularStageGroups = useMemo(() => buildRegularStageGroups(allFixtures), [allFixtures]);

  useEffect(() => {
    if (isPreseasonMode) return;
    const first = regularStageGroups[0]?.id || '';
    if (!activeStageId || !regularStageGroups.some((stage) => stage.id === activeStageId)) {
      setActiveStageId(first);
    }
  }, [activeStageId, isPreseasonMode, regularStageGroups]);

  const preseasonRounds = useMemo(() => {
    const rounds = Array.from(
      new Set(
        allFixtures
          .map((fixture) => toPositiveInt(fixture.week_index) ?? toPositiveInt(fixture.stage_index) ?? toPositiveInt(fixture.round))
          .filter((round): round is number => Boolean(round && round > 0)),
      ),
    ).sort((a, b) => a - b);

    const hasFinals = allFixtures.some((fixture) => {
      const stageName = String(fixture.stage_name || '').toLowerCase();
      return stageName.includes('semi') || stageName.includes('final') || stageName.includes('grand');
    });

    if (!hasFinals) {
      const base = rounds.filter((round) => round <= 2);
      return base.length ? base : [1, 2];
    }

    return rounds.length ? rounds : [1, 2];
  }, [allFixtures]);

  useEffect(() => {
    if (!isPreseasonMode) return;
    if (!preseasonRounds.includes(activeWeek)) {
      setActiveWeek(preseasonRounds[0] || 1);
    }
  }, [activeWeek, isPreseasonMode, preseasonRounds]);

  const scopeMatches = useMemo(() => {
    if (!allFixtures.length) return [];

    if (isPreseasonMode) {
      const roundMatches = allFixtures.filter((fixture) => deriveFixtureRound(fixture) === activeWeek);
      if (roundMatches.length) return roundMatches;

      return allFixtures;
    }

    const stage = regularStageGroups.find((entry) => entry.id === activeStageId) || regularStageGroups[0];
    const stageMatches = stage?.matches || [];
    if (stageMatches.length) return stageMatches;

    return allFixtures;
  }, [activeStageId, activeWeek, allFixtures, isPreseasonMode, regularStageGroups]);

  const venueOptions = useMemo(() => {
    return Array.from(new Set(allFixtures.map((fixture) => String(fixture.venue || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [allFixtures]);

  const matchesAfterFilterSheet = useMemo(() => {
    return scopeMatches.filter((fixture) => {
      const teamPass =
        selectedTeamId === 'ALL' ||
        String(fixture.home_team_id || '') === selectedTeamId ||
        String(fixture.away_team_id || '') === selectedTeamId;

      const venue = String(fixture.venue || '').trim();
      const venuePass = selectedVenue === 'ALL' || venue === selectedVenue;

      return teamPass && venuePass;
    });
  }, [scopeMatches, selectedTeamId, selectedVenue]);

  const counts = useMemo(() => {
    const all = matchesAfterFilterSheet.length;
    const scheduled = matchesAfterFilterSheet.filter((fixture) => normalizeFixtureStatus(fixture.status, fixture) === 'SCHEDULED').length;
    const final = matchesAfterFilterSheet.filter((fixture) => normalizeFixtureStatus(fixture.status, fixture) === 'FINAL').length;
    return { all, scheduled, final };
  }, [matchesAfterFilterSheet]);

  const filteredMatches = useMemo(() => {
    if (activeStatus === 'ALL') return matchesAfterFilterSheet;
    return matchesAfterFilterSheet.filter((fixture) => {
      const status = normalizeFixtureStatus(fixture.status, fixture);
      return activeStatus === 'SCHEDULED' ? status === 'SCHEDULED' : status === 'FINAL';
    });
  }, [activeStatus, matchesAfterFilterSheet]);

  const uiMatches = useMemo(
    () => filteredMatches.map((fixture) => mapToPosterMatch(fixture, navigate, isPreseasonMode, coachesByTeamId)),
    [coachesByTeamId, filteredMatches, isPreseasonMode, navigate],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [activeStageId, activeStatus, activeWeek, selectedTeamId, selectedVenue, uiMatches.length]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + RENDER_BATCH, uiMatches.length));
      },
      { root: null, rootMargin: '220px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [uiMatches.length]);

  const displayedMatches = useMemo(() => uiMatches.slice(0, visibleCount), [uiMatches, visibleCount]);
  const activeMatchCount = filteredMatches.length;

  const hasSettled = seasonFixturesQuery.isSuccess || seasonFixturesQuery.isError;
  const isLoading = !hasSettled && allFixtures.length === 0;
  const isError = seasonFixturesQuery.isError;

  const statusPills: Array<{ key: StatusFilter; label: string; count: number | string }> = [
    { key: 'ALL', label: 'All', count: isLoading ? '—' : counts.all },
    { key: 'SCHEDULED', label: 'Scheduled', count: isLoading ? '—' : counts.scheduled },
    { key: 'FINAL', label: 'Final', count: isLoading ? '—' : counts.final },
  ];

  const competitionOptions = getCompetitionOptions();

  return (
    <div className="fxAflPage">
      <div className="fxAflInner">
        <div className={`fxAflStickyNav ${isDockCompact ? 'is-compact' : ''}`}>
          <div className="fxAflTopHead">
            <div className="fxAflHeaderTitle">Fixtures</div>
            <div className="fxAflCountPill">{isLoading ? 'Loading…' : `${activeMatchCount} matches`}</div>
          </div>

          <div className="fxAflControlRow">
            <button
              type="button"
              className="fxAflCompetitionBar"
              onClick={() => setCompetitionSheetOpen(true)}
              aria-label="Change competition"
            >
              <span className="fxAflCompetitionBar__label">Competition</span>
              <span className="fxAflCompetitionBar__value">{competitionLabel}</span>
              <ChevronDown size={17} className="fxAflCompetitionBar__chev" />
            </button>

            <button
              type="button"
              className="fxAflFilterBtn"
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Open fixtures filters"
            >
              <Filter size={15} />
              Filter
            </button>
          </div>

          {isPreseasonMode ? (
            <div className="fxAflFormatStrip" aria-label="Preseason format">
              <span className="fxAflFormatStrip__label">Format:</span>
              <span>2 Rounds guaranteed</span>
              <span className="fxAflFormatStrip__dot" aria-hidden="true">
                •
              </span>
              <span className="fxAflFormatStrip__accent">Top 8 seeded finals</span>
              <span className="fxAflFormatStrip__dot" aria-hidden="true">
                •
              </span>
              <span>Grand Final</span>
            </div>
          ) : null}

          <div className="fxAflRoundStrip" aria-label="Round selector">
            {isPreseasonMode
              ? preseasonRounds.map((roundNum) => (
                  <button
                    key={roundNum}
                    type="button"
                    className={`fxAflRoundChip ${roundNum === activeWeek ? 'is-active' : ''}`}
                    onClick={() => setActiveWeek(roundNum)}
                  >
                    {`R${roundNum}`}
                  </button>
                ))
              : regularStageGroups.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={`fxAflRoundChip ${stage.id === activeStageId ? 'is-active' : ''}`}
                    onClick={() => setActiveStageId(stage.id)}
                  >
                    {stage.label}
                  </button>
                ))}
          </div>

          <div className="fxAflStatusRow" aria-label="Status filters">
            {statusPills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                className={`fxAflStatusPill ${activeStatus === pill.key ? 'is-active' : ''}`}
                onClick={() => setActiveStatus(pill.key)}
              >
                <span>{pill.label}</span>
                <span className="fxAflStatusPill__count">{pill.count}</span>
              </button>
            ))}
          </div>

          <div className="fxAflMetaLine">
            {isLoading ? 'Loading fixtures…' : `Scheduled ${counts.scheduled} • Final ${counts.final} • ${displayedMatches.length}/${activeMatchCount}`}
          </div>
        </div>

        <div className="fxAflPanel">
          {isError ? <div className="fxAflNotice">Unable to load fixtures. Please check your connection.</div> : null}

          {isLoading ? (
            <FixtureSkeletons count={3} />
          ) : allFixtures.length === 0 ? (
            <div className="fxAflEmpty fxAflEmpty--preseason">
              <div className="fxAflEmpty__title">Fixtures will appear once teams are registered.</div>
            </div>
          ) : displayedMatches.length === 0 ? (
            <div className="fxAflEmpty">No matches found for this filter.</div>
          ) : (
            <div className="fxAflList">
              {displayedMatches.map((match) => (
                <FixturePosterCard key={match.id} m={match} />
              ))}
            </div>
          )}

          {!isLoading && !isError && displayedMatches.length > 0 && displayedMatches.length < uiMatches.length ? (
            <div ref={loadMoreRef} className="fxAflLoadSentinel" aria-hidden="true" />
          ) : null}
        </div>

        <div className="fxAflBottomPad" />
      </div>

      <FixturesCompetitionSheet
        open={competitionSheetOpen}
        options={competitionOptions}
        currentKey={competitionKey}
        onClose={() => setCompetitionSheetOpen(false)}
        onSelect={(key) => {
          setStoredCompetitionKey(key);
          window.location.assign('/fixtures');
        }}
      />

      <FixturesFilterSheet
        open={filterSheetOpen}
        teamOptions={teamOptions}
        venueOptions={venueOptions}
        selectedTeamId={selectedTeamId}
        selectedVenue={selectedVenue}
        onClose={() => setFilterSheetOpen(false)}
        onTeamChange={setSelectedTeamId}
        onVenueChange={setSelectedVenue}
        onReset={() => {
          setSelectedTeamId('ALL');
          setSelectedVenue('ALL');
        }}
      />
    </div>
  );
}
