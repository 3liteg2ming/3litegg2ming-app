import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Shield,
  Trophy,
  Upload,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { requireSupabaseClient } from '../lib/supabaseClient';
import { GoalKickerPicker } from '../components/submit/GoalKickerPicker';
import { fetchCoachProfile } from '../lib/profileRepo';
import { TEAM_COLORS, TEAM_SHORT_NAMES } from '../data/teamColors';
import { invalidateAfl26Cache } from '../data/afl26Supabase';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { fetchSeasonFixturesBySeasonId, invalidateFixturesCache, type FixtureRow } from '../lib/fixturesRepo';
import { invalidateLadderCache } from '../lib/ladderRepo';
import { resolveSeasonId as resolveAppSeasonId } from '../lib/seasonResolver';
import { clearStatsCategoriesCache } from '../lib/statsRepo';
import { clearStatLeadersCache } from '../lib/stats-leaders-cache';
import { resolvePlayerDisplayName, resolvePlayerPhotoUrl, resolveTeamLogoUrl } from '@/lib/entityResolvers';
import '../styles/submitPage.css';

const supabase = requireSupabaseClient();
const DATA_SYNC_EVENT = 'eg:data-sync';

type NextFixturePayload = {
  fixture: {
    id: string;
    round: number;
    venue: string;
    status: string;
    seasonId?: string;
    startTime?: string;
  };
  homeTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
  awayTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
} | null;

type EligibleFixtureOption = {
  id: string;
  label: string;
  payload: Exclude<NextFixturePayload, null>;
  sortTime: number;
};

type Step = 1 | 2 | 3 | 4 | 5;

type PlayerLite = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  number?: number;
  position?: string;
  photoUrl?: string;
};

type UploadedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
};

type UploadedEvidenceAsset = {
  bucket: string;
  path: string;
  publicUrl: string;
  name: string;
  size: number;
  mimeType: string | null;
};

type DraftPayload = {
  venue: string;
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
  homeGoalMap: Record<string, number>;
  awayGoalMap: Record<string, number>;
  manualHomePlayers?: PlayerLite[];
  manualAwayPlayers?: PlayerLite[];
  notes: string;
  currentStep: Step;
  savedAt: number;
};

type SubmitConflict = {
  message: string;
  detail?: string;
};

const STEP_LABELS: Record<Step, string> = {
  1: 'Fixture',
  2: 'Score',
  3: 'Kickers',
  4: 'Upload',
  5: 'Review',
};

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(v: any) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bytesToKb(n: number) {
  return Math.max(1, Math.round((n || 0) / 1024));
}

function resolveTeamLogo(teamName: string, logo?: string) {
  const fallback = TEAM_COLORS[teamName]?.logo || 'elite-gaming-logo.png';
  return resolveTeamLogoUrl({
    logoUrl: logo,
    name: teamName,
    fallbackPath: fallback,
  });
}

function formatKickoff(startTime?: string) {
  if (!startTime) return 'TBC';
  const d = new Date(startTime);
  if (!Number.isFinite(d.getTime())) return 'TBC';
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function deriveShortName(name: string, explicit?: string) {
  const short = String(explicit || '').trim();
  if (short) return short;
  const base = String(name || '').trim();
  if (!base) return 'Team';
  const firstWord = base.split(/\s+/)[0] || base;
  if (firstWord.length <= 12) return firstWord;
  return `${firstWord.slice(0, 11)}…`;
}

function normalizeToken(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function dedupePlayers(players: PlayerLite[]) {
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}

function normalizeFixtureStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function isEligibleSubmitFixtureStatus(value: unknown): boolean {
  const status = normalizeFixtureStatus(value);
  return status !== 'FINAL' && status !== 'COMPLETED' && status !== 'COMPLETE';
}

function fixtureSortTime(startTime?: string) {
  const raw = String(startTime || '').trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function buildFixturePickerLabel(payload: Exclude<NextFixturePayload, null>) {
  const kickoff = formatKickoff(payload.fixture.startTime);
  return `R${payload.fixture.round} • ${payload.homeTeam.shortName || payload.homeTeam.name} vs ${payload.awayTeam.shortName || payload.awayTeam.name} • ${kickoff}`;
}

function mapFixtureToSubmitOption(fx: FixtureRow): EligibleFixtureOption {
  const homeName = String(fx.home_team_name || 'unknown');
  const awayName = String(fx.away_team_name || 'unknown');

  const payload: Exclude<NextFixturePayload, null> = {
    fixture: {
      id: String(fx.id),
      round: safeNum(fx.round),
      venue: String(fx.venue || 'TBC'),
      status: String(fx.status || 'SCHEDULED'),
      seasonId: fx.season_id ? String(fx.season_id) : undefined,
      startTime: fx.start_time ? String(fx.start_time) : undefined,
    },
    homeTeam: {
      id: String(fx.home_team_id || ''),
      name: homeName,
      shortName: deriveShortName(homeName, fx.home_team_short_name || TEAM_SHORT_NAMES[homeName]),
      logo: resolveTeamLogo(homeName, fx.home_team_logo_url || undefined),
      teamKey: fx.home_team_key || undefined,
    },
    awayTeam: {
      id: String(fx.away_team_id || ''),
      name: awayName,
      shortName: deriveShortName(awayName, fx.away_team_short_name || TEAM_SHORT_NAMES[awayName]),
      logo: resolveTeamLogo(awayName, fx.away_team_logo_url || undefined),
      teamKey: fx.away_team_key || undefined,
    },
  };

  return {
    id: payload.fixture.id,
    label: buildFixturePickerLabel(payload),
    payload,
    sortTime: fixtureSortTime(payload.fixture.startTime),
  };
}

function pickDefaultFixtureId(options: EligibleFixtureOption[]): string | null {
  if (!options.length) return null;
  const now = Date.now();
  const upcoming = options.find((option) => option.sortTime >= now);
  return upcoming?.id || options[0].id;
}

async function resolveSeasonIdForSlug(seasonSlug: string): Promise<string> {
  return resolveAppSeasonId(supabase, seasonSlug, { preferFixtureRows: true });
}

function buildDraftKey(userId?: string | null, fixtureId?: string | null) {
  const comp = getStoredCompetitionKey();
  return `eg_submit_draft:${comp}:${userId || 'guest'}:${fixtureId || 'none'}`;
}

function getCompetitionLabel() {
  const key = getStoredCompetitionKey();
  return key === 'preseason' ? 'Preseason' : 'AFL26';
}

function formatSavedAt(ts: number | null) {
  if (!ts) return '';
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function hasMeaningfulMeta(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  return normalized !== 'tbc' && normalized !== 'venue tbc' && normalized !== 'time tba';
}

function sanitizeFileName(name: string) {
  const cleaned = String(name || 'screenshot')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'screenshot.jpg';
}

function formatSubmitError(error: any): SubmitConflict {
  const message = String(error?.message || 'Submit failed.').trim() || 'Submit failed.';
  const details = [error?.details, error?.hint, error?.code ? `Code: ${error.code}` : null]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  return details.length ? { message, detail: details.join('\n') } : { message };
}

function buildEvidencePath(fixtureId: string, sessionUserId: string, fileName: string) {
  const safeName = sanitizeFileName(fileName);
  return `submissions/${fixtureId}/${sessionUserId}/${Date.now()}-${uuid()}-${safeName}`;
}

async function uploadEvidenceFiles(
  fixtureId: string,
  sessionUserId: string,
  uploadedFiles: UploadedFile[],
): Promise<UploadedEvidenceAsset[]> {
  const assets: UploadedEvidenceAsset[] = [];

  for (const item of uploadedFiles) {
    const path = buildEvidencePath(fixtureId, sessionUserId, item.name);
    const { error } = await supabase.storage.from('Assets').upload(path, item.file, {
      upsert: false,
      contentType: item.file.type || undefined,
    });

    if (error) {
      throw new Error(error.message || `Failed to upload screenshot ${item.name}`);
    }

    const publicUrl = supabase.storage.from('Assets').getPublicUrl(path).data.publicUrl;
    assets.push({
      bucket: 'Assets',
      path,
      publicUrl,
      name: item.name,
      size: item.size,
      mimeType: item.file.type || null,
    });
  }

  return assets;
}

async function cleanupEvidenceFiles(assets: UploadedEvidenceAsset[]): Promise<void> {
  if (!assets.length) return;
  try {
    await supabase.storage.from('Assets').remove(assets.map((asset) => asset.path));
  } catch {
    // Best effort cleanup only.
  }
}

export default function SubmitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeCompetitionKey = getStoredCompetitionKey();
  const requestedSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myCoachName, setMyCoachName] = useState<string | null>(null);

  const [eligibleFixtures, setEligibleFixtures] = useState<EligibleFixtureOption[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('');
  const [payload, setPayload] = useState<NextFixturePayload>(null);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [venue, setVenue] = useState('');

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');

  const [homeGoalMap, setHomeGoalMap] = useState<Record<string, number>>({});
  const [awayGoalMap, setAwayGoalMap] = useState<Record<string, number>>({});
  const [manualHomePlayers, setManualHomePlayers] = useState<PlayerLite[]>([]);
  const [manualAwayPlayers, setManualAwayPlayers] = useState<PlayerLite[]>([]);

  const [notes, setNotes] = useState('');

  const [allPlayers, setAllPlayers] = useState<PlayerLite[]>([]);
  const [playerLoadErr, setPlayerLoadErr] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<UploadedFile[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<SubmitConflict | null>(null);

  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  const fixture = payload?.fixture || null;
  const homeTeam = payload?.homeTeam || null;
  const awayTeam = payload?.awayTeam || null;
  const homeDisplayName = useMemo(
    () => deriveShortName(homeTeam?.name || '', homeTeam?.shortName),
    [homeTeam?.name, homeTeam?.shortName],
  );
  const awayDisplayName = useMemo(
    () => deriveShortName(awayTeam?.name || '', awayTeam?.shortName),
    [awayTeam?.name, awayTeam?.shortName],
  );

  const homeGoalsN = useMemo(() => safeNum(homeGoals), [homeGoals]);
  const homeBehindsN = useMemo(() => safeNum(homeBehinds), [homeBehinds]);
  const awayGoalsN = useMemo(() => safeNum(awayGoals), [awayGoals]);
  const awayBehindsN = useMemo(() => safeNum(awayBehinds), [awayBehinds]);

  const homeScore = useMemo(() => homeGoalsN * 6 + homeBehindsN, [homeGoalsN, homeBehindsN]);
  const awayScore = useMemo(() => awayGoalsN * 6 + awayBehindsN, [awayGoalsN, awayBehindsN]);
  const homeTaggedGoals = useMemo(() => Object.values(homeGoalMap).reduce((sum, value) => sum + safeNum(value), 0), [homeGoalMap]);
  const awayTaggedGoals = useMemo(() => Object.values(awayGoalMap).reduce((sum, value) => sum + safeNum(value), 0), [awayGoalMap]);
  const totalTaggedGoals = useMemo(() => homeTaggedGoals + awayTaggedGoals, [awayTaggedGoals, homeTaggedGoals]);

  const kickoffLabel = useMemo(() => formatKickoff(fixture?.startTime), [fixture?.startTime]);
  const isMyFixtureSideHome = useMemo(
    () => Boolean(myTeamId && homeTeam?.id && String(myTeamId) === String(homeTeam.id)),
    [homeTeam?.id, myTeamId],
  );

  const homeTeamColors = useMemo(() => {
    if (!homeTeam?.name) return { r: '0', g: '0', b: '0' };
    const colors = TEAM_COLORS[homeTeam.name];
    if (!colors) return { r: '0', g: '0', b: '0' };
    const match = colors.glow.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [homeTeam?.name]);

  const awayTeamColors = useMemo(() => {
    if (!awayTeam?.name) return { r: '0', g: '0', b: '0' };
    const colors = TEAM_COLORS[awayTeam.name];
    if (!colors) return { r: '0', g: '0', b: '0' };
    const match = colors.glow.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? { r: match[1], g: match[2], b: match[3] } : { r: '0', g: '0', b: '0' };
  }, [awayTeam?.name]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw authErr;
        const uid = authData.session?.user?.id || null;
        const email = authData.session?.user?.email || null;
        if (!uid) throw new Error('You must sign in to submit results.');
        if (!alive) return;

        setSessionUserId(uid);
        setSessionEmail(email);

        const profile = await fetchCoachProfile(uid);
        if (!profile?.team_id) {
          throw new Error('No team is linked to this account.');
        }
        if (!alive) return;

        setMyTeamId(profile.team_id);
        setMyCoachName(profile.display_name || profile.psn || 'Coach');
        if (!alive) return;

        const activeSeasonId = await resolveSeasonIdForSlug(requestedSeasonSlug);
        if (!alive) return;

        const { fixtures } = await fetchSeasonFixturesBySeasonId(activeSeasonId, { limit: 1000, offset: 0 });
        const teamId = String(profile.team_id || '');
        const teamFixtures = fixtures
          .filter((row) => String(row.home_team_id || '') === teamId || String(row.away_team_id || '') === teamId)
          .sort((a, b) => {
            const diff = fixtureSortTime(a.start_time || undefined) - fixtureSortTime(b.start_time || undefined);
            if (diff !== 0) return diff;
            return String(a.id).localeCompare(String(b.id));
          });
        if (!alive) return;

        const eligible = teamFixtures
          .filter((row) => isEligibleSubmitFixtureStatus(row?.status))
          .map(mapFixtureToSubmitOption);

        if (eligible.length === 0) {
          if (alive) {
            const nextMessage =
              teamFixtures.length === 0
                ? `No fixtures found for your team in ${requestedSeasonSlug}.`
                : `All fixtures for your team in ${requestedSeasonSlug} are already FINAL.`;
            setEligibleFixtures([]);
            setSelectedFixtureId('');
            setPayload(null);
            setVenue('');
            setLoadError(nextMessage);
          }
          return;
        }

        const defaultFixtureId = pickDefaultFixtureId(eligible);
        const defaultFixture = eligible.find((item) => item.id === defaultFixtureId) || eligible[0];

        if (!alive) return;
        setEligibleFixtures(eligible);
        setSelectedFixtureId(defaultFixture.id);
        setPayload(defaultFixture.payload);
        setVenue(defaultFixture.payload.fixture.venue || '');
      } catch (e: any) {
        console.error('[Submit] load failed:', e);
        if (!alive) return;
        setLoadError(e?.message || 'Failed to load submit page.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestedSeasonSlug]);

  useEffect(() => {
    if (!eligibleFixtures.length) return;
    const selected = eligibleFixtures.find((item) => item.id === selectedFixtureId) || eligibleFixtures[0];
    if (!selected) return;
    setPayload(selected.payload);
    setVenue((current) => current || selected.payload.fixture.venue || '');
  }, [eligibleFixtures, selectedFixtureId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!homeTeam?.id || !awayTeam?.id) return;
      try {
        const selectAttempts = [
          'id,name,display_name,full_name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
          'id,name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
          'id,name,team_id,team_name,position,number,headshot_url,photo_url',
        ] as const;

        let rawPlayers: any[] = [];
        let loaded = false;
        for (const select of selectAttempts) {
          const result = await supabase.from('eg_players').select(select).limit(5000);
          if (result.error) {
            if (!String(result.error.message || '').toLowerCase().includes('column')) {
              throw result.error;
            }
            continue;
          }
          rawPlayers = (result.data || []) as any[];
          loaded = true;
          break;
        }

        if (!loaded) throw new Error('Failed to load player data from Supabase');

        const homeKey = normalizeToken(homeTeam.teamKey || homeTeam.name);
        const awayKey = normalizeToken(awayTeam.teamKey || awayTeam.name);
        const homeNameToken = normalizeToken(homeTeam.name);
        const awayNameToken = normalizeToken(awayTeam.name);

        const rows = rawPlayers.map((p) => {
          const teamId = String(p.team_id || '').trim();
          const teamNameRaw = String(p.team_name || '').trim();
          const teamKeyRaw = String(p.team_key || '').trim();
          const fullName = resolvePlayerDisplayName({
            name: p.name,
            displayName: p.display_name,
            fullName: p.full_name,
          });

          let side: 'home' | 'away' | 'unlinked' = 'unlinked';
          if (teamId && teamId === String(homeTeam.id)) side = 'home';
          else if (teamId && teamId === String(awayTeam.id)) side = 'away';
          else {
            const token = normalizeToken(teamKeyRaw || teamNameRaw);
            if (token && (token === homeKey || token === homeNameToken)) side = 'home';
            else if (token && (token === awayKey || token === awayNameToken)) side = 'away';
          }

          const resolvedTeamName =
            side === 'home' ? homeTeam.name : side === 'away' ? awayTeam.name : 'All players (team not linked)';

          return {
            id: String(p.id || uuid()),
            name: fullName,
            teamId,
            teamName: resolvedTeamName,
            number: safeNum(p.number),
            position: String(p.position || ''),
            photoUrl: resolvePlayerPhotoUrl({
              photoUrl: p.photo_url,
              headshotUrl: p.headshot_url,
              fallbackPath: 'elite-gaming-logo.png',
            }),
          } as PlayerLite;
        });

        if (!alive) return;
        setAllPlayers(rows);
        setPlayerLoadErr(null);
      } catch (e: any) {
        if (!alive) return;
        setAllPlayers([]);
        setPlayerLoadErr(e?.message || 'Failed to load player data from Supabase');
      }
    })();

    return () => {
      alive = false;
    };
  }, [homeTeam?.id, homeTeam?.name, awayTeam?.id, awayTeam?.name]);

  useEffect(() => {
    if (!fixture?.id) return;

    uploaded.forEach((file) => {
      try {
        URL.revokeObjectURL(file.previewUrl);
      } catch {
        // ignore
      }
    });

    setCurrentStep(1);
    setVenue(fixture.venue || '');
    setHomeGoals('');
    setHomeBehinds('');
    setAwayGoals('');
    setAwayBehinds('');
    setHomeGoalMap({});
    setAwayGoalMap({});
    setManualHomePlayers([]);
    setManualAwayPlayers([]);
    setNotes('');
    setUploaded([]);
    setSubmitSuccess(false);
    setConflict(null);
    setDraftSavedAt(null);
  }, [fixture?.id]);

  useEffect(() => {
    const draftKey = buildDraftKey(sessionUserId, fixture?.id);
    if (!sessionUserId || !fixture?.id) return;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftPayload;
      if (!draft || typeof draft !== 'object') return;

      setVenue(String(draft.venue || fixture.venue || ''));
      setHomeGoals(String(draft.homeGoals || ''));
      setHomeBehinds(String(draft.homeBehinds || ''));
      setAwayGoals(String(draft.awayGoals || ''));
      setAwayBehinds(String(draft.awayBehinds || ''));
      setHomeGoalMap(draft.homeGoalMap || {});
      setAwayGoalMap(draft.awayGoalMap || {});
      setManualHomePlayers(Array.isArray(draft.manualHomePlayers) ? draft.manualHomePlayers : []);
      setManualAwayPlayers(Array.isArray(draft.manualAwayPlayers) ? draft.manualAwayPlayers : []);
      setNotes(String(draft.notes || ''));
      setCurrentStep((draft.currentStep as Step) || 1);
      setDraftSavedAt(Number(draft.savedAt) || null);
    } catch {
      // ignore malformed draft
    }
  }, [sessionUserId, fixture?.id, fixture?.venue]);

  useEffect(() => {
    if (!sessionUserId || !fixture?.id) return;
    const draftKey = buildDraftKey(sessionUserId, fixture.id);

    const payload: DraftPayload = {
      venue,
      homeGoals,
      homeBehinds,
      awayGoals,
      awayBehinds,
      homeGoalMap,
      awayGoalMap,
      manualHomePlayers,
      manualAwayPlayers,
      notes,
      currentStep,
      savedAt: Date.now(),
    };

    const t = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(payload));
      setDraftSavedAt(payload.savedAt);
    }, 250);

    return () => window.clearTimeout(t);
  }, [
    sessionUserId,
    fixture?.id,
    venue,
    homeGoals,
    homeBehinds,
    awayGoals,
    awayBehinds,
    homeGoalMap,
    awayGoalMap,
    manualHomePlayers,
    manualAwayPlayers,
    notes,
    currentStep,
    uploaded,
  ]);

  useEffect(() => {
    return () => {
      uploaded.forEach((u) => {
        try {
          URL.revokeObjectURL(u.previewUrl);
        } catch {
          // ignore
        }
      });
    };
  }, [uploaded]);

  const homePlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === homeTeam?.name)
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers, homeTeam?.name],
  );
  const awayPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === awayTeam?.name)
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers, awayTeam?.name],
  );

  const goalKickerGuidance = useMemo(() => {
    const messages: string[] = [];
    const homeLabel = homeTeam?.shortName || homeTeam?.name || 'Home team';
    const awayLabel = awayTeam?.shortName || awayTeam?.name || 'Away team';

    if (homePlayers.length === 0) {
      messages.push(`No linked players found for ${homeLabel}. Manual names can still be added.`);
    }
    if (awayPlayers.length === 0) {
      messages.push(`No linked players found for ${awayLabel}. Manual names can still be added.`);
    }

    return messages;
  }, [awayPlayers.length, awayTeam?.name, awayTeam?.shortName, homePlayers.length, homeTeam?.name, homeTeam?.shortName]);

  const homeKickerPool = useMemo(
    () =>
      dedupePlayers([...homePlayers, ...manualHomePlayers]).sort(
        (a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name),
      ),
    [homePlayers, manualHomePlayers],
  );

  const awayKickerPool = useMemo(
    () =>
      dedupePlayers([...awayPlayers, ...manualAwayPlayers]).sort(
        (a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name),
      ),
    [awayPlayers, manualAwayPlayers],
  );

  const topScorers = useMemo(() => {
    const out: Array<{ id: string; name: string; goals: number; team: 'home' | 'away'; photoUrl?: string }> = [];
    for (const p of homeKickerPool) {
      const g = safeNum(homeGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'home', photoUrl: p.photoUrl });
    }
    for (const p of awayKickerPool) {
      const g = safeNum(awayGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'away', photoUrl: p.photoUrl });
    }
    return out.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 3);
  }, [homeKickerPool, awayKickerPool, homeGoalMap, awayGoalMap]);

  const homeGoalKickers = useMemo(
    () => homeKickerPool
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(homeGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [homeKickerPool, homeGoalMap],
  );

  const awayGoalKickers = useMemo(
    () => awayKickerPool
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(awayGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [awayKickerPool, awayGoalMap],
  );

  const isStep2Valid = useMemo(() => homeGoals !== '' && homeBehinds !== '' && awayGoals !== '' && awayBehinds !== '', [homeGoals, homeBehinds, awayGoals, awayBehinds]);
  const isStep3Valid = useMemo(() => isStep2Valid, [isStep2Valid]);
  const isStep4Valid = useMemo(() => uploaded.length > 0, [uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId || isSubmitting) return false;
    if (!isStep2Valid || !uploaded.length) return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, isStep2Valid, uploaded.length]);

  const getStatusChip = () => {
    if (submitSuccess) return { label: 'Submitted', tone: 'success' as const };
    if (draftSavedAt) return { label: 'Draft saved', tone: 'muted' as const };
    return { label: 'Ready to submit', tone: 'warning' as const };
  };

  const statusChip = getStatusChip();
  const competitionLabel = getCompetitionLabel();
  const draftSavedLabel = formatSavedAt(draftSavedAt);
  const fixtureAvailabilityLabel = eligibleFixtures.length > 1 ? `${eligibleFixtures.length} eligible fixtures` : 'Fixture locked in';
  const heroMetaItems = useMemo(() => {
    const items = [
      fixture ? `Round ${fixture.round}` : null,
      competitionLabel,
    ].filter(Boolean) as string[];
    if (hasMeaningfulMeta(kickoffLabel)) items.push(kickoffLabel);
    if (hasMeaningfulMeta(venue)) items.push(venue);
    return items;
  }, [competitionLabel, fixture, kickoffLabel, venue]);
  const heroCoachLabel = useMemo(() => {
    const identity = String(sessionEmail || myCoachName || 'coach').trim();
    return identity || 'coach';
  }, [myCoachName, sessionEmail]);
  const heroFooterLabel = useMemo(() => {
    const parts = [fixtureAvailabilityLabel];
    if (draftSavedLabel && statusChip.tone !== 'muted') {
      parts.push(`Draft ${draftSavedLabel}`);
    }
    return parts.join(' • ');
  }, [draftSavedLabel, fixtureAvailabilityLabel, statusChip.tone]);

  const canGoToStep = (step: Step) => {
    if (step <= 2) return true;
    if (step === 3) return isStep2Valid;
    if (step === 4) return isStep3Valid;
    if (step === 5) return isStep4Valid;
    return false;
  };

  const setPlayerGoals = (side: 'home' | 'away', playerId: string, next: number) => {
    const val = clamp(next, 0, 99);
    if (side === 'home') {
      setHomeGoalMap((prev) => {
        if (val <= 0) {
          const copy = { ...prev };
          delete copy[playerId];
          return copy;
        }
        return { ...prev, [playerId]: val };
      });
    } else {
      setAwayGoalMap((prev) => {
        if (val <= 0) {
          const copy = { ...prev };
          delete copy[playerId];
          return copy;
        }
        return { ...prev, [playerId]: val };
      });
    }
  };

  const addGoalKicker = (
    side: 'home' | 'away',
    player: {
      id?: string;
      name: string;
      photoUrl?: string;
    },
  ) => {
    const name = String(player.name || '').trim();
    if (!name) return;

    const linkedPool = side === 'home' ? homePlayers : awayPlayers;
    const manualPool = side === 'home' ? manualHomePlayers : manualAwayPlayers;
    const explicitId = String(player.id || '').trim();
    const normalizedName = normalizeToken(name);

    const existing =
      (explicitId ? [...linkedPool, ...manualPool].find((entry) => entry.id === explicitId) : null) ||
      [...linkedPool, ...manualPool].find((entry) => normalizeToken(entry.name) === normalizedName);

    if (existing) {
      const currentGoals = safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[existing.id]);
      setPlayerGoals(side, existing.id, currentGoals + 1);
      return;
    }

    const manualId = explicitId || `manual:${side}:${normalizedName || uuid()}`;
    const manualPlayer: PlayerLite = {
      id: manualId,
      name,
      teamId: side === 'home' ? homeTeam?.id || 'manual-home' : awayTeam?.id || 'manual-away',
      teamName: side === 'home' ? homeTeam?.name || homeDisplayName : awayTeam?.name || awayDisplayName,
      photoUrl: player.photoUrl,
    };

    if (side === 'home') {
      setManualHomePlayers((prev) => dedupePlayers([...prev, manualPlayer]));
    } else {
      setManualAwayPlayers((prev) => dedupePlayers([...prev, manualPlayer]));
    }

    setPlayerGoals(side, manualId, safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[manualId]) + 1);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const next = files.map((f) => ({
      id: uuid(),
      file: f,
      name: f.name,
      size: f.size,
      previewUrl: URL.createObjectURL(f),
    }));

    setUploaded((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setUploaded((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submit = async () => {
    if (!fixture || !myTeamId || !canSubmit) return;
    if (!sessionUserId) {
      setConflict({ message: 'You must sign in to submit results.' });
      return;
    }
    if (!uploaded.length) {
      setConflict({ message: 'At least one screenshot is required before submit.' });
      return;
    }

    setIsSubmitting(true);
    setConflict(null);
    let uploadedAssets: UploadedEvidenceAsset[] = [];

    try {
      uploadedAssets = await uploadEvidenceFiles(fixture.id, sessionUserId, uploaded);

      const { data: rpcData, error: rpcErr } = await supabase.rpc('eg_submit_result_v2', {
        p_fixture_id: fixture.id,
        p_home_goals: homeGoalsN,
        p_home_behinds: homeBehindsN,
        p_away_goals: awayGoalsN,
        p_away_behinds: awayBehindsN,
        p_venue: venue || null,
        p_goal_kickers_home: homeGoalKickers.length ? homeGoalKickers : null,
        p_goal_kickers_away: awayGoalKickers.length ? awayGoalKickers : null,
        p_ocr: { screenshots: uploadedAssets },
        p_notes: notes || null,
      });

      if (rpcErr) {
        console.error('[Submit] eg_submit_result_v2 failed:', rpcErr);
        await cleanupEvidenceFiles(uploadedAssets);
        setConflict(formatSubmitError(rpcErr));
        return;
      }

      const draftKey = buildDraftKey(sessionUserId, fixture.id);
      window.localStorage.removeItem(draftKey);
      const activeCompetitionKey = getStoredCompetitionKey();
      const activeSeasonSlug = getDataSeasonSlugForCompetition(activeCompetitionKey);
      invalidateAfl26Cache();
      invalidateFixturesCache({ fixtureId: fixture.id, seasonId: fixture.seasonId || null });
      invalidateLadderCache({ seasonSlug: activeSeasonSlug, seasonId: fixture.seasonId || null });
      clearStatsCategoriesCache();
      clearStatLeadersCache();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['fixtures', 'season', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['fixture', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['submissions', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre'] }),
        queryClient.invalidateQueries({ queryKey: ['match-centre', fixture.id] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder'] }),
        queryClient.invalidateQueries({ queryKey: ['eg_ladder', activeSeasonSlug] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(DATA_SYNC_EVENT, {
            detail: { fixtureId: fixture.id, seasonId: fixture.seasonId || null, submission: rpcData || null },
          }),
        );
      }
      setSubmitSuccess(true);
    } catch (e: any) {
      if (uploadedAssets.length) {
        await cleanupEvidenceFiles(uploadedAssets);
      }
      setConflict(formatSubmitError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">Loading Match Day Console…</div>
              <div className="mdcLoading__sub">Fetching your next fixture</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !fixture || !homeTeam || !awayTeam) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="mdcLoading">
              <div className="mdcLoading__title">Nothing to submit right now</div>
              <div className="mdcLoading__sub">{loadError || 'No eligible non-final fixture was found for your assigned team.'}</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="egSubmitPage">
      <main className="egSubmitPage__main">
        <div className="egSubmitPage__wrap">
          <section
            className="mdcHero"
            style={{
              '--homeR': homeTeamColors.r,
              '--homeG': homeTeamColors.g,
              '--homeB': homeTeamColors.b,
              '--awayR': awayTeamColors.r,
              '--awayG': awayTeamColors.g,
              '--awayB': awayTeamColors.b,
            } as React.CSSProperties}
          >
            <div className="mdcHero__top">
              <div className="mdcHero__titleWrap">
                <div className="mdcHero__eyebrow">Submit Results</div>
                <div className="mdcHero__titleRow">
                  <div className="mdcHero__title">Coach Submission</div>
                  <span className={`mdcChip mdcChip--${statusChip.tone}`}>{statusChip.label}</span>
                </div>
                {heroMetaItems.length ? (
                  <div className="mdcHero__metaRow" aria-label="Fixture metadata">
                    {heroMetaItems.map((item) => (
                      <span key={item} className="mdcHero__metaItem">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mdcCoachPill">
                <Shield size={13} />
                <span>{heroCoachLabel}</span>
              </div>
            </div>

            <div className="mdcHero__match">
              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">
                  {homeTeam.logo ? <img src={homeTeam.logo} alt={homeTeam.name} /> : <span>{homeTeam.name.slice(0, 1)}</span>}
                </div>
                <div className="mdcTeamBlock__name" title={homeTeam.name}>{homeDisplayName}</div>
              </div>

              <div className="mdcHero__center">
                <div className="mdcHero__divider" aria-hidden="true" />
              </div>

              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">
                  {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <span>{awayTeam.name.slice(0, 1)}</span>}
                </div>
                <div className="mdcTeamBlock__name" title={awayTeam.name}>{awayDisplayName}</div>
              </div>
            </div>

            <div className="mdcHero__bottom">
              <div className="mdcHero__bottomMeta">
                <div className="mdcProgressMeta">Step {currentStep} of 5</div>
                <div className="mdcHero__bottomSub">{heroFooterLabel}</div>
              </div>
              <button type="button" className="mdcHeroCta" onClick={() => navigate(`/match-centre/${fixture.id}`)}>
                Match Centre <ChevronRight size={14} />
              </button>
            </div>
          </section>

          {conflict?.message ? (
            <div className="mdcStatus mdcStatus--danger">
              <AlertTriangle size={14} />
              <div style={{ minWidth: 0 }}>
                <div>{conflict.message}</div>
                {conflict.detail ? (
                  <pre
                    style={{
                      margin: '6px 0 0',
                      whiteSpace: 'pre-wrap',
                      fontSize: 11,
                      lineHeight: 1.45,
                      color: 'rgba(255, 220, 220, 0.9)',
                    }}
                  >
                    {conflict.detail}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : null}
          {playerLoadErr ? <div className="mdcStatus mdcStatus--muted">{playerLoadErr}</div> : null}

          <div className="mdcStepper" role="tablist" aria-label="Submit steps">
            {([1, 2, 3, 4, 5] as Step[]).map((step) => {
              const active = step === currentStep;
              const done = step < currentStep;
              const enabled = canGoToStep(step);
              return (
                <button
                  key={step}
                  type="button"
                  className={`mdcStep ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => enabled && setCurrentStep(step)}
                  disabled={!enabled}
                  aria-selected={active}
                >
                  <span className="mdcStep__node">{done ? <Check size={14} /> : step}</span>
                  <span className="mdcStep__label">{STEP_LABELS[step]}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.section key="s1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Confirm Match</div>
                <div className="mdcCard__body">
                  <div className="mdcConfirmMatch">
                    {eligibleFixtures.length > 1 ? (
                      <label className="mdcFixtureSelect">
                        <span className="mdcFixtureSelect__label">Fixture</span>
                        <select value={selectedFixtureId} onChange={(e) => setSelectedFixtureId(e.target.value)}>
                          {eligibleFixtures.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className="mdcConfirmMatch__teams">
                      <span>{homeDisplayName}</span>
                      <strong>vs</strong>
                      <span>{awayDisplayName}</span>
                    </div>
                    <div className="mdcConfirmMatch__meta">Round {fixture.round} • {venue || 'Venue TBC'} • {kickoffLabel}</div>
                  </div>

                  <div className="mdcRuleCard">
                    <Trophy size={16} />
                    <div>
                      <div className="mdcRuleCard__title">Submission Rules</div>
                      <div className="mdcRuleCard__text">
                        {isMyFixtureSideHome
                          ? 'You are submitting as the home coach. Final score, goal kickers and evidence will update the live result pipeline.'
                          : 'You are submitting as the away coach. Final score, goal kickers and evidence will update the live result pipeline.'}
                      </div>
                    </div>
                  </div>

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(2)}>
                      Continue to Score
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 2 && (
              <motion.section key="s2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Score Entry</div>
                <div className="mdcCard__body">
                  <div className="mdcScorePanel">
                    <div className="mdcScoreTeam">
                      <div className="mdcScoreTeam__head">{homeDisplayName}</div>
                      <div className="mdcScoreInputs">
                        <label>Goals
                          <input inputMode="numeric" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                        <label>Behinds
                          <input inputMode="numeric" value={homeBehinds} onChange={(e) => setHomeBehinds(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                      </div>
                      <div className="mdcScoreTotal">{homeGoalsN}.{homeBehindsN} <span>({homeScore})</span></div>
                    </div>

                    <div className="mdcScoreTeam">
                      <div className="mdcScoreTeam__head">{awayDisplayName}</div>
                      <div className="mdcScoreInputs">
                        <label>Goals
                          <input inputMode="numeric" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                        <label>Behinds
                          <input inputMode="numeric" value={awayBehinds} onChange={(e) => setAwayBehinds(e.target.value.replace(/[^\d]/g, ''))} />
                        </label>
                      </div>
                      <div className="mdcScoreTotal">{awayGoalsN}.{awayBehindsN} <span>({awayScore})</span></div>
                    </div>
                  </div>

                  <div className="mdcLivePreview">
                    <div className="mdcLivePreview__title">Final Score Preview</div>
                    <div className="mdcLivePreview__row">
                      <span>{homeDisplayName}</span>
                      <strong>{homeScore}</strong>
                      <span>—</span>
                      <strong>{awayScore}</strong>
                      <span>{awayDisplayName}</span>
                    </div>
                  </div>

                  <div className="mdcActions">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(1)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(3)} disabled={!isStep2Valid}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 3 && (
              <motion.section key="s3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Goal Kickers</div>
                <div className="mdcCard__body">
                  <div className="mdcTopScorers">
                    <div className="mdcTopScorers__head">
                      <div className="mdcTopScorers__label">Tagged Total</div>
                      <div className="mdcTopScorers__meta">{totalTaggedGoals} tagged across both teams</div>
                    </div>
                    <div className="mdcTopScorers__chips">
                      {(topScorers.length ? topScorers : [
                        { id: 'ph1', name: 'Awaiting entries', goals: 0, team: 'home' as const, photoUrl: homeKickerPool[0]?.photoUrl },
                      ]).map((k) => (
                        <div key={k.id} className="mdcTopChip">
                          <div className="mdcTopChip__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User size={12} />}
                          </div>
                          <span>{k.name}</span>
                          <strong>{k.goals}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {goalKickerGuidance.length ? (
                    <div className="mdcCompactEmptyStack">
                      {goalKickerGuidance.map((message) => (
                        <div key={message} className="mdcCompactEmptyCard">
                          <div className="mdcCompactEmptyCard__title">{message}</div>
                          <div className="mdcCompactEmptyCard__text">The compact picker supports manual names, so you can still finish the submission cleanly.</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <GoalKickerPicker
                    homeTeamId={homeTeam.id}
                    homeTeamName={homeDisplayName}
                    awayTeamId={awayTeam.id}
                    awayTeamName={awayDisplayName}
                    allPlayers={[...homeKickerPool, ...awayKickerPool]}
                    homeKickers={homeGoalKickers}
                    awayKickers={awayGoalKickers}
                    homeTaggedGoals={homeTaggedGoals}
                    awayTaggedGoals={awayTaggedGoals}
                    homeScoredGoals={homeGoalsN}
                    awayScoredGoals={awayGoalsN}
                    onAddKicker={addGoalKicker}
                    onIncGoal={(side, kickerId) =>
                      setPlayerGoals(side, kickerId, safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[kickerId]) + 1)
                    }
                    onDecGoal={(side, kickerId) =>
                      setPlayerGoals(side, kickerId, safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[kickerId]) - 1)
                    }
                    onRemoveKicker={(side, kickerId) => setPlayerGoals(side, kickerId, 0)}
                  />

                  <div className="mdcActions mdcActions--sticky">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(2)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(4)}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 4 && (
              <motion.section key="s4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Evidence Upload</div>
                <div className="mdcCard__body">
                  <div className="mdcRequirementCard">
                    <div className="mdcRequirementCard__title">Screenshots required</div>
                    <div className="mdcRequirementCard__text">
                      Upload at least one scoreboard or match-summary screenshot. OCR is not used in the launch submit flow.
                    </div>
                  </div>

                  <div className="mdcUploadDrop">
                    <div className="mdcUploadDrop__title">Upload screenshots</div>
                    <div className="mdcUploadDrop__sub">These screenshots are stored as live evidence for this fixture submission.</div>
                    <label className="mdcBtn mdcBtn--primary mdcUploadDrop__btn">
                      <Upload size={14} /> Choose Images
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickFiles} hidden />
                    </label>
                  </div>

                  {!!uploaded.length && (
                    <div className="mdcUploadGrid">
                      {uploaded.map((f) => (
                        <div key={f.id} className="mdcUploadItem">
                          <div className="mdcUploadItem__thumb">{f.previewUrl ? <img src={f.previewUrl} alt={f.name} /> : <Upload size={14} />}</div>
                          <div className="mdcUploadItem__meta">
                            <div className="mdcUploadItem__name">{f.name}</div>
                            <div className="mdcUploadItem__size">{bytesToKb(f.size)} KB</div>
                          </div>
                          <button type="button" className="mdcUploadItem__remove" onClick={() => removeFile(f.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!uploaded.length ? (
                    <div className="mdcStatus mdcStatus--danger mdcStatus--inline">
                      <AlertTriangle size={14} /> At least one screenshot is required before you can continue to review.
                    </div>
                  ) : null}

                  <div className="mdcActions mdcActions--sticky">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(3)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => setCurrentStep(5)} disabled={!uploaded.length}>Continue</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {currentStep === 5 && (
              <motion.section key="s5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mdcCard">
                <div className="mdcCard__head">Review + Confirm</div>
                <div className="mdcCard__body">
                  <div className="mdcReviewScore">
                    <div className="mdcReviewScore__value">{homeScore}</div>
                    <div className="mdcReviewScore__teams">
                      {homeDisplayName} <span>vs</span> {awayDisplayName}
                    </div>
                    <div className="mdcReviewScore__value">{awayScore}</div>
                  </div>

                  <div className="mdcChecklist">
                    <div className={`mdcChecklist__row ${fixture ? 'is-ok' : ''}`}><Check size={13} /> Fixture confirmed</div>
                    <div className={`mdcChecklist__row ${isStep2Valid ? 'is-ok' : ''}`}><Check size={13} /> Score entered</div>
                    <div className={`mdcChecklist__row ${(homeGoalKickers.length + awayGoalKickers.length) > 0 ? 'is-ok' : ''}`}><Check size={13} /> Goal kickers added</div>
                    <div className={`mdcChecklist__row ${uploaded.length > 0 ? 'is-ok' : ''}`}><Check size={13} /> Screenshots uploaded ({uploaded.length})</div>
                  </div>

                  <div className="mdcReviewBlock">
                    <div className="mdcReviewBlock__title">Top Goal Kickers</div>
                    {(topScorers.length ? topScorers : [{ id: 'none', name: 'Awaiting coach input', goals: 0, team: 'home' as const }]).map((k) => (
                      <div key={k.id} className="mdcReviewKicker">
                        <div className="mdcReviewKicker__left">
                          <div className="mdcReviewKicker__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User size={12} />}
                          </div>
                          <span>{k.name}</span>
                        </div>
                        <strong>{k.goals}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mdcReviewBlock">
                    <div className="mdcReviewBlock__title">Notes</div>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details for admins?" />
                  </div>

                  <div className="mdcReviewBlock">
                    <div className="mdcReviewBlock__title">Evidence Screenshots</div>
                    <div className="mdcReviewAssetList">
                      {uploaded.map((file) => (
                        <div key={file.id} className="mdcReviewAsset">
                          <div className="mdcReviewAsset__thumb">
                            {file.previewUrl ? <img src={file.previewUrl} alt={file.name} /> : <Upload size={14} />}
                          </div>
                          <div className="mdcReviewAsset__meta">
                            <div className="mdcReviewAsset__name">{file.name}</div>
                            <div className="mdcReviewAsset__sub">{bytesToKb(file.size)} KB</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mdcActions mdcActions--sticky">
                    <button type="button" className="mdcBtn" onClick={() => setCurrentStep(4)}>Back</button>
                    <button type="button" className="mdcBtn mdcBtn--primary" disabled={!canSubmit || isSubmitting} onClick={submit}>
                      {isSubmitting ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {submitSuccess && (
          <motion.div className="mdcSuccessOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="mdcSuccessCard" initial={{ y: 10, scale: 0.97 }} animate={{ y: 0, scale: 1 }}>
              <div className="mdcSuccessCard__icon"><Check size={24} /></div>
              <div className="mdcSuccessCard__title">Submitted</div>
              <div className="mdcSuccessCard__sub">Your result is now live across Fixtures, Match Centre, Ladder, and Stats.</div>
              <div className="mdcSuccessCard__score">{homeScore} — {awayScore}</div>
              <div className="mdcSuccessCard__actions">
                <button type="button" className="mdcBtn mdcBtn--primary" onClick={() => navigate(`/match-centre/${fixture.id}`)}>
                  Open Match Centre
                </button>
                <button type="button" className="mdcBtn" onClick={() => navigate('/fixtures')}>
                  Back to Fixtures
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
