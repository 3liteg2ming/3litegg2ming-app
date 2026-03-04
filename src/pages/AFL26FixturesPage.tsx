import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Filter } from 'lucide-react';

const supabase = requireSupabaseClient();

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { FixtureSkeletons } from '../components/FixtureSkeleton';
import FixturesCompetitionSheet from '../components/fixtures/FixturesCompetitionSheet';
import FixturesFilterSheet from '../components/fixtures/FixturesFilterSheet';
import { useAllFixtures, useNextFixtures } from '../hooks/useFixtures';
import {
  getDataSeasonSlugForCompetition,
  getStoredCompetitionKey,
  getUiCompetition,
  setStoredCompetitionKey,
  type CompetitionKey,
} from '../lib/competitionRegistry';
import { resolveTeamKey } from '../lib/entityResolvers';
import { requireSupabaseClient } from '../lib/supabaseClient';

import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'FINAL';

type FixtureRow = {
  id: string;
  round?: number;
  stage_name?: string | null;
  stage_index?: number | null;
  bracket_slot?: string | null;
  week_index?: number | null;
  is_preseason?: boolean;
  next_fixture_id?: string | null;
  status?: string;
  start_time?: string | null;
  venue?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team_slug?: string | null;
  away_team_slug?: string | null;
  home_goals?: number | null;
  home_behinds?: number | null;
  home_total?: number | null;
  away_goals?: number | null;
  away_behinds?: number | null;
  away_total?: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_logo_url?: string | null;
  away_team_logo_url?: string | null;
  eg_teams?: { slug?: string; name?: string; logo_url?: string } | null;
  away_team?: { slug?: string; name?: string; logo_url?: string } | null;
};

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

function normalizeStatus(status: string | undefined | null) {
  return String(status || 'SCHEDULED').toUpperCase();
}

function deriveFixtureRound(fixture: FixtureRow): number {
  const explicitWeek = toPositiveInt(fixture.week_index);
  if (explicitWeek) return explicitWeek;

  const round = toPositiveInt(fixture.round);
  if (round) return round;

  const stageIndex = toPositiveInt(fixture.stage_index);
  if (stageIndex) return stageIndex;

  const stageName = String(fixture.stage_name || '').toLowerCase();
  if (stageName.includes('grand')) return 4;
  if (stageName.includes('semi')) return 3;
  return 1;
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
  const byJoinName =
    side === 'home' ? fixture.home_team_name || fixture.eg_teams?.name : fixture.away_team_name || fixture.away_team?.name;
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
): FixturePosterMatch {
  const roundNumber = deriveFixtureRound(fixture);
  const home = resolveTeamKey({
    slug: fixture.home_team_slug,
    name: fixture.home_team_name || fixture.eg_teams?.name,
  });
  const away = resolveTeamKey({
    slug: fixture.away_team_slug,
    name: fixture.away_team_name || fixture.away_team?.name,
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

  return {
    id: fixture.id,
    round: roundNumber,
    dateText: formatDateText(fixture.start_time),
    venue: fixture.venue || 'TBA',
    status: normalizeStatus(fixture.status) as FixturePosterMatch['status'],
    home: stageHasIdentity(fixture, 'home') ? home : 'unknown',
    away: stageHasIdentity(fixture, 'away') ? away : 'unknown',
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
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('ALL');
  const [selectedVenue, setSelectedVenue] = useState<string>('ALL');

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const nextFixturesQuery = useNextFixtures(seasonSlug, 3);
  const allFixturesQuery = useAllFixtures(seasonSlug, nextFixturesQuery.isSuccess);

  const allFixtures = useMemo<FixtureRow[]>(
    () => ((allFixturesQuery.data ?? nextFixturesQuery.data ?? []) as FixtureRow[]),
    [allFixturesQuery.data, nextFixturesQuery.data],
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

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('eg_teams').select('id,name').order('name', { ascending: true });

      if (!alive || error) return;

      const options = ((data || []) as Array<{ id?: string | null; name?: string | null }>)
        .map((row) => ({
          id: String(row.id || '').trim(),
          name: String(row.name || '').trim(),
        }))
        .filter((row) => row.id && row.name);

      setTeamOptions(options);
    })();

    return () => {
      alive = false;
    };
  }, []);

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
    if (isPreseasonMode) {
      return allFixtures.filter((fixture) => deriveFixtureRound(fixture) === activeWeek);
    }

    const stage = regularStageGroups.find((entry) => entry.id === activeStageId) || regularStageGroups[0];
    return stage?.matches || [];
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
    const scheduled = matchesAfterFilterSheet.filter((fixture) => normalizeStatus(fixture.status) === 'SCHEDULED').length;
    const final = matchesAfterFilterSheet.filter((fixture) => normalizeStatus(fixture.status) === 'FINAL').length;
    return { all, scheduled, final };
  }, [matchesAfterFilterSheet]);

  const filteredMatches = useMemo(() => {
    if (activeStatus === 'ALL') return matchesAfterFilterSheet;
    return matchesAfterFilterSheet.filter((fixture) => {
      const status = normalizeStatus(fixture.status);
      return activeStatus === 'SCHEDULED' ? status === 'SCHEDULED' : status === 'FINAL';
    });
  }, [activeStatus, matchesAfterFilterSheet]);

  const uiMatches = useMemo(
    () => filteredMatches.map((fixture) => mapToPosterMatch(fixture, navigate, isPreseasonMode)),
    [filteredMatches, isPreseasonMode, navigate],
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

  const isLoading = nextFixturesQuery.isLoading;
  const isError = nextFixturesQuery.isError;

  const statusPills: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'All', count: counts.all },
    { key: 'SCHEDULED', label: 'Scheduled', count: counts.scheduled },
    { key: 'FINAL', label: 'Final', count: counts.final },
  ];

  const competitionOptions = getCompetitionOptions();

  return (
    <div className="fxAflPage">
      <div className="fxAflInner">
        <div className={`fxAflStickyNav ${isDockCompact ? 'is-compact' : ''}`}>
          <div className="fxAflTopHead">
            <div className="fxAflHeaderTitle">Fixtures</div>
            <div className="fxAflCountPill">{counts.all} matches</div>
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
            Scheduled {counts.scheduled} • Final {counts.final} • {displayedMatches.length}/{uiMatches.length}
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
