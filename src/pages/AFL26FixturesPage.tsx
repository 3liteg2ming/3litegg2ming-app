import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Filter, Settings2 } from 'lucide-react';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { FixtureSkeletons } from '../components/FixtureSkeleton';
import FixturesCompetitionSheet from '../components/fixtures/FixturesCompetitionSheet';
import FixturesFilterSheet from '../components/fixtures/FixturesFilterSheet';
import FinalsBracket from '../components/finals/FinalsBracket';
import { bracketSlotForStage, type BracketSlot } from '../lib/finalsBracket';
import { FINALS_CONFIG, getFinalsLabel } from '../config/finals';
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
import { fetchMatchCentre } from '../lib/matchCentreRepo';
import { fetchCurrentCoaches, type Coach } from '../lib/homeRepo';
import { FIXTURES_UNLOCK_LABEL, useFixtureVisibility } from '../lib/fixtureVisibility';
import {
  SUBMISSION_DEADLINE_LABEL,
  SUBMISSION_DEADLINE_MS,
  useDeadlineCountdown,
} from '../hooks/useDeadlineCountdown';
import { isRoundVisible } from '../lib/visibleRounds';
import { useMelvinOdds } from '../hooks/useMelvinOdds';
import { useLadder } from '../hooks/useLadder';
import { buildTeamRatings, generateFixtureOdds } from '../lib/autoOdds';
import { useAuth } from '../state/auth/AuthProvider';
import { useFixtureVoting } from '../hooks/useFixtureVoting';
import { useFixtureVotingSubmit } from '../hooks/useFixtureVotingSubmit';
import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'FINAL' | 'PENDING_RESULTS';
type ViewMode = 'HOME_AND_AWAY' | 'FINALS';
type FinalsWeek = 'WEEK_1' | 'SF' | 'PF' | 'GF';

const FINALS_WEEK_TABS: Array<{ id: FinalsWeek; label: string; slots: BracketSlot[] }> = [
  { id: 'WEEK_1', label: 'Week 1', slots: ['QF1', 'QF2', 'EF1', 'EF2'] },
  { id: 'SF', label: 'Semis', slots: ['SF1', 'SF2'] },
  { id: 'PF', label: 'Prelims', slots: ['PF1', 'PF2'] },
  { id: 'GF', label: 'Grand Final', slots: ['GF'] },
];
const FINALS_SUBMISSION_OPEN_LABEL = 'Finals are live. Home coaches can submit results for open finals fixtures.';

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

function getFixtureFinalsLabel(fixture: FixtureRow) {
  const source = [fixture.stage_name, fixture.bracket_slot, fixture.round_label].join(' ').toLowerCase();

  if (source.includes('qualifying')) return 'Qualifying Final';
  if (source.includes('elimination')) return 'Elimination Final';
  if (source.includes('semi')) return 'Semi Final';
  if (source.includes('prelim')) return 'Preliminary Final';
  if (source.includes('grand')) return 'Grand Final';

  return getFinalsLabel(FINALS_CONFIG.week);
}

function isFixtureFinals(fixture: FixtureRow) {
  const source = [fixture.stage_name, fixture.bracket_slot, fixture.round_label].join(' ').toLowerCase();
  return (
    source.includes('qualifying') ||
    source.includes('elimination') ||
    source.includes('semi') ||
    source.includes('prelim') ||
    source.includes('grand') ||
    source.includes('final')
  );
}

function mapToPosterMatch(
  fixture: FixtureRow,
  navigate: ReturnType<typeof useNavigate>,
  queryClient: ReturnType<typeof useQueryClient>,
  coachesByTeamId: Map<string, Coach>,
  oddsMap?: Record<string, { home: number; away: number }> | null,
): FixturePosterMatch {
  const roundNumber = deriveFixtureRound(fixture);
  const homeHasIdentity = stageHasIdentity(fixture, 'home');
  const awayHasIdentity = stageHasIdentity(fixture, 'away');
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

  const homeDisplayName = homeHasIdentity ? fixture.home_team_name || fixture.home_team_short_name || home : 'TBC';
  const awayDisplayName = awayHasIdentity ? fixture.away_team_name || fixture.away_team_short_name || away : 'TBC';
  const homeCoach = String(fixture.home_team_id || '').trim()
    ? coachesByTeamId.get(String(fixture.home_team_id || '').trim()) || null
    : null;
  const awayCoach = String(fixture.away_team_id || '').trim()
    ? coachesByTeamId.get(String(fixture.away_team_id || '').trim()) || null
    : null;

  const posterStatus = normalizeFixtureStatus(fixture.status, fixture) as FixturePosterMatch['status'];

  // Gold Coast Suns games show as TBA while coach is unavailable
  const isGoldCoastGame = home === 'goldcoast' || away === 'goldcoast';
  const isNotFinal = posterStatus !== 'FINAL';
  const showAsTba = isGoldCoastGame && isNotFinal;
  const hasMissingTeams = !homeHasIdentity || !awayHasIdentity;
  const fixtureIsFinals = isFixtureFinals(fixture);

  let headerTag: string | undefined;
  let matchupLabel: string | undefined;

  try {
    if (hasMissingTeams) {
      headerTag = 'Matchup TBC';
      matchupLabel = `${homeDisplayName} vs ${awayDisplayName}`;
    } else if (fixtureIsFinals) {
      headerTag = getFixtureFinalsLabel(fixture) || undefined;
    }
  } catch {
    headerTag = undefined;
    matchupLabel = undefined;
  }

  const previewState = {
    matchCentrePreview: {
      fixtureId: fixture.id,
      round: roundNumber,
      dateText: showAsTba ? 'TBC' : formatDateText(fixture.start_time),
      venue: fixture.venue || 'TBA',
      statusLabel: posterStatus,
      home: {
        id: fixture.home_team_id || undefined,
        slug: fixture.home_team_slug || (homeHasIdentity ? home : 'tbc'),
        key: homeHasIdentity ? home : 'tbc',
        name: homeDisplayName,
        fullName: homeDisplayName,
        shortName: homeHasIdentity ? fixture.home_team_short_name || fixture.home_team_name || home : 'TBC',
        abbreviation: homeHasIdentity ? fixture.home_team_short_name || fixture.home_team_name || home : 'TBC',
        colour: fixture.home_team_colour || '#1e4ed8',
        color: fixture.home_team_colour || '#1e4ed8',
        logoUrl: fixture.home_team_logo_url || '',
        goals: homeScore?.goals ?? 0,
        behinds: homeScore?.behinds ?? 0,
        score: homeScore?.total ?? 0,
      },
      away: {
        id: fixture.away_team_id || undefined,
        slug: fixture.away_team_slug || (awayHasIdentity ? away : 'tbc'),
        key: awayHasIdentity ? away : 'tbc',
        name: awayDisplayName,
        fullName: awayDisplayName,
        shortName: awayHasIdentity ? fixture.away_team_short_name || fixture.away_team_name || away : 'TBC',
        abbreviation: awayHasIdentity ? fixture.away_team_short_name || fixture.away_team_name || away : 'TBC',
        colour: fixture.away_team_colour || '#c71f2d',
        color: fixture.away_team_colour || '#c71f2d',
        logoUrl: fixture.away_team_logo_url || '',
        goals: awayScore?.goals ?? 0,
        behinds: awayScore?.behinds ?? 0,
        score: awayScore?.total ?? 0,
      },
    },
  } as const;

  return {
    id: fixture.id,
    round: roundNumber,
    dateText: showAsTba ? 'TBC' : formatDateText(fixture.start_time),
    venue: fixture.venue || 'TBA',
    status: showAsTba ? 'SCHEDULED' as FixturePosterMatch['status'] : posterStatus,
    statusTextOverride: showAsTba ? 'DELAYED' : undefined,
    headerTag,
    roundType: fixtureIsFinals ? 'finals' : 'regular',
    matchupLabel,
    home: homeHasIdentity ? home : 'TBC',
    away: awayHasIdentity ? away : 'TBC',
    homeCoachName: homeCoach?.display_name || undefined,
    awayCoachName: awayCoach?.display_name || undefined,
    homePsn: homeCoach?.psn || undefined,
    awayPsn: awayCoach?.psn || undefined,
    homeCoachPsn: homeCoach?.psn || undefined,
    awayCoachPsn: awayCoach?.psn || undefined,
    homeScore,
    awayScore,
    adminHomeOdds: oddsMap?.[fixture.id]?.home,
    adminAwayOdds: oddsMap?.[fixture.id]?.away,
    onMatchCentreClick: () => {
      void queryClient.prefetchQuery({
        queryKey: ['match-centre', fixture.id],
        queryFn: () => fetchMatchCentre(fixture.id),
        staleTime: 45_000,
      });
      navigate(`/match-centre/${fixture.id}`, { state: previewState });
    },
  };
}

const SLOT_ADVANCE: Partial<Record<BracketSlot, string>> = {
  QF1: 'Winner advances to Semi Final',
  QF2: 'Winner advances to Semi Final',
  EF1: 'Winner advances to Semi Final · Loser eliminated',
  EF2: 'Winner advances to Semi Final · Loser eliminated',
  SF1: 'Winner advances to Preliminary Final',
  SF2: 'Winner advances to Preliminary Final',
  PF1: 'Winner advances to Grand Final',
  PF2: 'Winner advances to Grand Final',
};

function getAdvanceLabel(fixture: FixtureRow): string | null {
  const slot = fixture.bracket_slot as BracketSlot | null;
  return slot ? (SLOT_ADVANCE[slot] ?? null) : null;
}

function FixtureVoteInline({
  fixtureId,
  homeSlug,
  awaySlug,
  homeName,
  awayName,
}: {
  fixtureId: string;
  homeSlug?: string;
  awaySlug?: string;
  homeName: string;
  awayName: string;
}) {
  const { user } = useAuth();
  const voterKey = user?.id ?? null;
  const voting = useFixtureVoting(fixtureId, homeSlug, awaySlug, voterKey);
  const { submitVote, isSubmitting } = useFixtureVotingSubmit(voterKey);

  const handleVote = (slug: string) => {
    void submitVote(fixtureId, slug);
  };

  return (
    <div className="fxVoteInline">
      <span className="fxVoteInline__label">Who wins?</span>
      <div className="fxVoteInline__btns">
        <button
          type="button"
          className={`fxVoteInline__btn${voting.currentUserVote === homeSlug ? ' fxVoteInline__btn--picked' : ''}`}
          onClick={() => homeSlug && handleVote(homeSlug)}
          disabled={isSubmitting || !!voting.currentUserVote}
        >
          {homeName}
          {voting.hasVotes ? <span className="fxVoteInline__pct">{voting.homePct}%</span> : null}
        </button>
        <button
          type="button"
          className={`fxVoteInline__btn${voting.currentUserVote === awaySlug ? ' fxVoteInline__btn--picked' : ''}`}
          onClick={() => awaySlug && handleVote(awaySlug)}
          disabled={isSubmitting || !!voting.currentUserVote}
        >
          {awayName}
          {voting.hasVotes ? <span className="fxVoteInline__pct">{voting.awayPct}%</span> : null}
        </button>
      </div>
      {voting.hasVotes && (
        <div className="fxVoteInline__bar">
          <div className="fxVoteInline__barHome" style={{ width: `${voting.homePct}%` }} />
        </div>
      )}
    </div>
  );
}

function getCompetitionOptions(): Array<{ key: CompetitionKey; label: string }> {
  // UI-only filter: hide Knockout preseason, keep AFL26 Season Two visible
  return [
    { key: 'afl26', label: 'AFL 26 Season Two' },
  ];
}

function MatchInfoPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fxMI__scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="Match Settings">
      <div className="fxMI__card" onClick={(e) => e.stopPropagation()}>
        <div className="fxMI__glow" aria-hidden="true" />
        <div className="fxMI__head">
          <div className="fxMI__headLeft">
            <Settings2 size={15} className="fxMI__headIcon" />
            <span className="fxMI__headTitle">Match Settings</span>
          </div>
          <button type="button" className="fxMI__close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="fxMI__body">
          <div className="fxMI__row">
            <span className="fxMI__label">Quarter Length</span>
            <span className="fxMI__val">5 min</span>
          </div>
          <div className="fxMI__divider" />
          <div className="fxMI__row">
            <span className="fxMI__label">Attributes</span>
            <span className="fxMI__val fxMI__val--off">Off</span>
          </div>
          <div className="fxMI__divider" />
          <div className="fxMI__row">
            <span className="fxMI__label">Difficulty</span>
            <span className="fxMI__val fxMI__val--hard">Hardest</span>
          </div>
        </div>
        <div className="fxMI__foot">
          <span>All Season Two matches use these settings.</span>
          <br />
          <span className="fxMI__footNote">Home team must take all photos and submit results.</span>
        </div>
      </div>
    </div>
  );
}

export default function AFL26FixturesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fixturesPubliclyVisible = useFixtureVisibility(user?.role);
  const submissionDeadline = useDeadlineCountdown(SUBMISSION_DEADLINE_MS);
  const { data: adminOddsMap } = useMelvinOdds();

  let competitionKey = getStoredCompetitionKey();
  // Ensure AFL 26 is always the default on this page
  if (competitionKey !== 'afl26') {
    setStoredCompetitionKey('afl26');
    competitionKey = 'afl26';
  }

  const competitionLabel = 'AFL 26 Season Two';
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);

  const [activeStageId, setActiveStageId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(FINALS_CONFIG.enabled ? 'FINALS' : 'HOME_AND_AWAY');
  const [activeFinalsWeek, setActiveFinalsWeek] = useState<FinalsWeek>('WEEK_1');
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const [isDockCompact, setIsDockCompact] = useState(false);
  const [competitionSheetOpen, setCompetitionSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('ALL');
  const [selectedVenue, setSelectedVenue] = useState<string>('ALL');
  const [matchInfoOpen, setMatchInfoOpen] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const roundBarRef = useRef<HTMLDivElement | null>(null);

  const seasonFixturesQuery = useSeasonFixtures(seasonSlug, {
    limit: 1000,
    enabled: fixturesPubliclyVisible,
  });
  const coachesQuery = useQuery({
    queryKey: ['home', 'current-coaches'],
    queryFn: fetchCurrentCoaches,
    staleTime: 60_000,
    gcTime: 1_200_000,
  });
  const teamOptionsQuery = useTeamOptions();
  const teamOptions = (teamOptionsQuery.data || []) as TeamOption[];
  const coachesByTeamId = useMemo(() => {
    const map = new Map<string, Coach>();
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

  // Auto-odds: merge admin-set odds with algorithm-generated odds from ladder data
  const ladderQuery = useLadder(seasonSlug);
  const oddsMap = useMemo(() => {
    const admin = adminOddsMap || {};
    const ladder = ladderQuery.data;
    if (!ladder || !ladder.length) return admin;

    const ratings = buildTeamRatings(ladder);
    const autoOdds = generateFixtureOdds(allFixtures, ratings, admin);

    // Admin odds take priority, auto-odds fill the gaps
    return { ...autoOdds, ...admin };
  }, [adminOddsMap, ladderQuery.data, allFixtures]);

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

  const regularStageGroups = useMemo(() => {
    const regularOnly = allFixtures.filter((fixture) => !fixture.is_finals);
    const allGroups = buildRegularStageGroups(regularOnly);
    return allGroups.filter((stage) => isRoundVisible(stage.index));
  }, [allFixtures]);

  const finalsFixtures = useMemo(
    () => allFixtures.filter((fixture) => Boolean(fixture.is_finals)),
    [allFixtures],
  );

  const hasFinals = finalsFixtures.length > 0;

  useEffect(() => {
    if (!hasFinals && viewMode === 'FINALS') {
      setViewMode('HOME_AND_AWAY');
    }
  }, [hasFinals, viewMode]);

  useEffect(() => {
    if (!fixturesPubliclyVisible) return;
    const defaultRound = regularStageGroups[regularStageGroups.length - 1]?.id || '';
    if (!activeStageId || !regularStageGroups.some((stage) => stage.id === activeStageId)) {
      setActiveStageId(defaultRound);
    }
  }, [activeStageId, fixturesPubliclyVisible, regularStageGroups]);

  // Auto-scroll round bar so the active pill is visible
  useEffect(() => {
    const el = roundBarRef.current;
    if (!el || !activeStageId) return;
    const active = el.querySelector('.is-active') as HTMLElement | null;
    if (active) {
      requestAnimationFrame(() => {
        active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [activeStageId]);

  const isTeamView = selectedTeamId !== 'ALL';
  const isFinalsView = viewMode === 'FINALS';

  const finalsWeekMatches = useMemo(() => {
    if (!isFinalsView) return [] as FixtureRow[];
    const slots = new Set<string>(bracketSlotForStage(
      activeFinalsWeek === 'WEEK_1' ? 'QF' : activeFinalsWeek,
    ));
    if (activeFinalsWeek === 'WEEK_1') {
      bracketSlotForStage('EF').forEach((slot) => slots.add(slot));
    }
    return finalsFixtures.filter((f) => f.bracket_slot && slots.has(f.bracket_slot));
  }, [activeFinalsWeek, finalsFixtures, isFinalsView]);

  const scopeMatches = useMemo(() => {
    if (!allFixtures.length) return [];

    if (isFinalsView) {
      if (isTeamView) {
        return finalsFixtures.filter((fixture) => {
          const homeId = String(fixture.home_team_id || '');
          const awayId = String(fixture.away_team_id || '');
          return homeId === selectedTeamId || awayId === selectedTeamId;
        });
      }
      return finalsWeekMatches;
    }

    if (isTeamView) {
      return allFixtures.filter((fixture) => {
        if (fixture.is_finals) return false;
        const homeId = String(fixture.home_team_id || '');
        const awayId = String(fixture.away_team_id || '');
        const teamMatches = homeId === selectedTeamId || awayId === selectedTeamId;

        // When filtering by team, only show rounds that are currently visible
        const roundNumber = toPositiveInt(fixture.round) ?? toPositiveInt(fixture.stage_index) ?? 1;
        const roundValid = isRoundVisible(roundNumber);

        return teamMatches && roundValid;
      });
    }

    const stage = regularStageGroups.find((entry) => entry.id === activeStageId) || regularStageGroups[0];
    const stageMatches = stage?.matches || [];
    if (stageMatches.length) return stageMatches;

    return allFixtures.filter((f) => !f.is_finals);
  }, [activeStageId, allFixtures, regularStageGroups, selectedTeamId, isTeamView, isFinalsView, finalsFixtures, finalsWeekMatches]);

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

  const selectedTeamName = useMemo(() => {
    if (selectedTeamId === 'ALL') return '';
    return teamOptions.find((t) => t.id === selectedTeamId)?.name || '';
  }, [selectedTeamId, teamOptions]);

  const counts = useMemo(() => {
    const all = matchesAfterFilterSheet.length;
    let scheduled = 0;
    let pending = 0;
    let final = 0;
    for (const fixture of matchesAfterFilterSheet) {
      const s = normalizeFixtureStatus(fixture.status, fixture);
      if (s === 'FINAL') final += 1;
      else if (s === 'PENDING_RESULTS') pending += 1;
      else scheduled += 1;
    }
    return { all, scheduled, pending, final };
  }, [matchesAfterFilterSheet]);

  const filteredMatches = useMemo(() => {
    if (activeStatus === 'ALL') return matchesAfterFilterSheet;
    return matchesAfterFilterSheet.filter((fixture) => {
      const status = normalizeFixtureStatus(fixture.status, fixture);
      return status === activeStatus;
    });
  }, [activeStatus, matchesAfterFilterSheet]);

  const uiMatches = useMemo(
    () => filteredMatches.map((fixture) => mapToPosterMatch(fixture, navigate, queryClient, coachesByTeamId, oddsMap)),
    [coachesByTeamId, filteredMatches, navigate, queryClient, oddsMap],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [activeStageId, activeStatus, selectedTeamId, selectedVenue, uiMatches.length]);

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
  const isLoading = !hasSettled && allFixtures.length === 0 && fixturesPubliclyVisible;
  const isError = seasonFixturesQuery.isError;

  const statusPills: Array<{ key: StatusFilter; label: string; count: number | string }> = [
    { key: 'ALL', label: 'All', count: isLoading ? '—' : counts.all },
    { key: 'SCHEDULED', label: 'Scheduled', count: isLoading ? '—' : counts.scheduled },
    { key: 'PENDING_RESULTS', label: 'Pending', count: isLoading ? '—' : counts.pending },
    { key: 'FINAL', label: 'Final', count: isLoading ? '—' : counts.final },
  ];

  const competitionOptions = getCompetitionOptions();

  return (
    <div className="fxAflPage">
      <div className="fxAflInner">
        <section className="fxHero">
          <div className="fxHero__top">
            <div className="fxHero__titleGroup">
              <h1 className="fxHero__title">Fixtures</h1>
              <span className="fxHero__kicker">AFL 26 &bull; Season Two</span>
            </div>
            <div className="fxHero__countPill">
              {fixturesPubliclyVisible
                ? isLoading
                  ? 'Loading\u2026'
                  : `${activeMatchCount} matches`
                : 'Registration Open'}
            </div>
          </div>
          <button
            type="button"
            className="fxMatchSettingsBtn"
            onClick={() => setMatchInfoOpen(true)}
          >
            <Settings2 size={14} className="fxMatchSettingsBtn__icon" />
            <span className="fxMatchSettingsBtn__label">Match Settings</span>
            <span className="fxMatchSettingsBtn__arrow">&rsaquo;</span>
          </button>
        </section>

        {fixturesPubliclyVisible && (hasFinals || FINALS_CONFIG.enabled) ? (
          <div className="fxViewModeBar" role="tablist" aria-label="Season view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'HOME_AND_AWAY'}
              className={`fxViewModeBar__tab ${viewMode === 'HOME_AND_AWAY' ? 'is-active' : ''}`}
              onClick={() => setViewMode('HOME_AND_AWAY')}
            >
              Home &amp; Away
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'FINALS'}
              className={`fxViewModeBar__tab ${viewMode === 'FINALS' ? 'is-active' : ''}`}
              onClick={() => setViewMode('FINALS')}
            >
              Finals
            </button>
          </div>
        ) : null}

        {fixturesPubliclyVisible && !isFinalsView ? (
          <div className={`fxRoundBar ${isDockCompact ? 'is-compact' : ''}`} aria-label="Round selector">
            <div className="fxRoundBar__inner" ref={roundBarRef}>
              {regularStageGroups.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  disabled={isTeamView}
                  className={`fxRoundBar__pill ${!isTeamView && stage.id === activeStageId ? 'is-active' : ''} ${isTeamView ? 'is-disabled' : ''}`}
                  onClick={() => { if (!isTeamView) setActiveStageId(stage.id); }}
                  aria-disabled={isTeamView ? 'true' : undefined}
                >
                  {stage.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="fxRoundBar__filterBtn"
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Open fixtures filters"
            >
              <Filter size={14} />
            </button>
          </div>
        ) : null}

        {fixturesPubliclyVisible && FINALS_CONFIG.enabled ? (
          <div className="fxDeadlineNotice fxDeadlineNotice--open">
            <div className="fxDeadlineNotice__text">{FINALS_SUBMISSION_OPEN_LABEL}</div>
            <div className="fxDeadlineNotice__countdown">
              <div className="fxDeadlineNotice__expiredWrap">
                <span className="fxDeadlineNotice__expired">Finals Open</span>
                <span className="fxDeadlineNotice__subtext">
                  Season Two home-and-away is closed, but finals submissions stay open for the home side.
                </span>
              </div>
            </div>
          </div>
        ) : fixturesPubliclyVisible && !submissionDeadline.expired ? (
          <div className="fxDeadlineNotice">
            <div className="fxDeadlineNotice__text">
              {`All open fixture submissions close ${SUBMISSION_DEADLINE_LABEL}`}
            </div>
            <div className="fxDeadlineNotice__countdown">
              <div className="fxDeadlineNotice__unit">
                <span className="fxDeadlineNotice__num">{submissionDeadline.days}</span>
                <span className="fxDeadlineNotice__lbl">days</span>
              </div>
              <span className="fxDeadlineNotice__sep">:</span>
              <div className="fxDeadlineNotice__unit">
                <span className="fxDeadlineNotice__num">{String(submissionDeadline.hours).padStart(2, '0')}</span>
                <span className="fxDeadlineNotice__lbl">hrs</span>
              </div>
              <span className="fxDeadlineNotice__sep">:</span>
              <div className="fxDeadlineNotice__unit">
                <span className="fxDeadlineNotice__num">{String(submissionDeadline.minutes).padStart(2, '0')}</span>
                <span className="fxDeadlineNotice__lbl">min</span>
              </div>
              <span className="fxDeadlineNotice__sep">:</span>
              <div className="fxDeadlineNotice__unit">
                <span className="fxDeadlineNotice__num">{String(submissionDeadline.seconds).padStart(2, '0')}</span>
                <span className="fxDeadlineNotice__lbl">sec</span>
              </div>
            </div>
          </div>
        ) : null}

        {fixturesPubliclyVisible && isFinalsView && hasFinals ? (
          <FinalsBracket fixtures={finalsFixtures} seasonId={seasonSlug} />
        ) : null}

        {fixturesPubliclyVisible && isFinalsView ? (
          <div className={`fxRoundBar fxRoundBar--belowBracket ${isDockCompact ? 'is-compact' : ''}`} aria-label="Finals round selector">
            <div className="fxRoundBar__inner" ref={roundBarRef}>
              {FINALS_WEEK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  disabled={isTeamView}
                  className={`fxRoundBar__pill ${!isTeamView && activeFinalsWeek === tab.id ? 'is-active' : ''} ${isTeamView ? 'is-disabled' : ''}`}
                  onClick={() => { if (!isTeamView) setActiveFinalsWeek(tab.id); }}
                  aria-disabled={isTeamView ? 'true' : undefined}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="fxRoundBar__filterBtn"
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Open fixtures filters"
            >
              <Filter size={14} />
            </button>
          </div>
        ) : null}

        <div className="fxAflPanel">
          {!fixturesPubliclyVisible ? (
            <div className="fxAflLaunchGate">
              <h2 className="fxAflLaunchGate__title">{FIXTURES_UNLOCK_LABEL}</h2>
              <p className="fxAflLaunchGate__body">
                Matchups and rounds will appear once the season reveal goes live.
              </p>
            </div>
          ) : isError ? (
            <div className="fxAflNotice">Unable to load fixtures. Please check your connection.</div>
          ) : isLoading ? (
            <FixtureSkeletons count={3} />
          ) : allFixtures.length === 0 ? (
            <div className="fxAflEmpty fxAflEmpty--preseason">
              <div className="fxAflEmpty__title">Fixtures will appear once teams are registered.</div>
            </div>
          ) : displayedMatches.length === 0 ? (
            <div className="fxAflEmpty">No matches found for this filter.</div>
          ) : (
            <div className="fxAflList">
              {displayedMatches.map((match, i) => {
                const raw = filteredMatches[i];
                const isFinals = raw?.is_finals ?? false;
                const advanceLabel =
                  isFinals && match.status !== 'FINAL' ? getAdvanceLabel(raw) : null;
                const isHomeCoach = !!(
                  user &&
                  raw?.home_team_id &&
                  coachesByTeamId.get(String(raw.home_team_id))?.user_id === user.id &&
                  match.status === 'SCHEDULED'
                );
                return (
                  <div key={match.id} className="fxCardGroup">
                    <FixturePosterCard m={match} />
                    {advanceLabel ? (
                      <div className="fxAdvanceBadge">{advanceLabel}</div>
                    ) : null}
                    {isHomeCoach ? (
                      <Link to="/submit" className="fxSubmitCta">Submit Result</Link>
                    ) : null}
                    {isFinals && raw?.id ? (
                      <FixtureVoteInline
                        fixtureId={raw.id}
                        homeSlug={raw.home_team_slug ?? undefined}
                        awaySlug={raw.away_team_slug ?? undefined}
                        homeName={match.home}
                        awayName={match.away}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading &&
          !isError &&
          fixturesPubliclyVisible &&
          displayedMatches.length > 0 &&
          displayedMatches.length < uiMatches.length ? (
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

      <MatchInfoPopup open={matchInfoOpen} onClose={() => setMatchInfoOpen(false)} />
    </div>
  );
}
