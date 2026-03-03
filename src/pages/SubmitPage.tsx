import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Shield,
  Trophy,
  Upload,
  User,
  Wand2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabaseClient';
import { fetchCoachProfile } from '../lib/profileRepo';
import { TEAM_COLORS, TEAM_SHORT_NAMES } from '../data/teamColors';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { resolvePlayerDisplayName, resolvePlayerPhotoUrl, resolveTeamLogoUrl, resolveTeamName } from '@/lib/entityResolvers';
import '../styles/submitPage.css';

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

type OcrState =
  | { status: 'idle' }
  | { status: 'ocr_running'; step: string; progress01: number }
  | { status: 'done'; rawText: string; teamStats: Record<string, number>; playerLines: string[] }
  | { status: 'timeout'; error: string }
  | { status: 'error'; message: string };

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

type DraftPayload = {
  venue: string;
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
  homeGoalMap: Record<string, number>;
  awayGoalMap: Record<string, number>;
  notes: string;
  currentStep: Step;
  ocrConfirm: boolean;
  uploadedMeta: Array<{ name: string; size: number }>;
  savedAt: number;
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

function parseTeamStatsFromText(raw: string) {
  const keys = [
    'DISPOSALS',
    'KICKS',
    'HANDBALLS',
    'MARKS',
    'TACKLES',
    'INSIDE 50',
    'CLEARANCES',
    'HITOUTS',
    'CONTESTED POSSESSIONS',
    'UNCONTESTED POSSESSIONS',
    'CLANGERS',
    'TURNOVERS',
  ];

  const out: Record<string, number> = {};
  const text = raw.toUpperCase();

  for (const k of keys) {
    const re = new RegExp(`${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\\\$&')}\\s*[:\\-]?\\s*(\\d{1,3})`, 'i');
    const m = text.match(re);
    if (m?.[1]) out[k] = safeNum(m[1]);
  }

  return out;
}

function parsePlayerLinesFromText(raw: string) {
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const l of lines) {
    if (/^[A-Z][A-Z '\-.]{2,}\s+\d{1,3}$/i.test(l)) out.push(l);
    else if (/^[A-Z][A-Z '\-.]{2,}.*\s\d{1,3}$/i.test(l) && /\d{1,3}$/.test(l)) out.push(l);
  }

  return out.slice(0, 50);
}

async function runTesseract(files: File[], onProgress: (step: string, progress01: number) => void) {
  const GLOBAL_TIMEOUT_MS = 20000;

  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string) => {
    return await new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      p.then(
        (v) => {
          window.clearTimeout(t);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(t);
          reject(e);
        },
      );
    });
  };

  return await withTimeout(
    (async () => {
      const mod: any = await import('tesseract.js');
      const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
      if (!createWorker) throw new Error('tesseract.js not available');

      const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
      const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
      const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

      const logger = (m: any) => {
        if (!m?.status) return;
        const status = String(m.status);
        const p = typeof m.progress === 'number' ? clamp(m.progress, 0, 1) : 0;
        if (status.includes('loading')) onProgress('Preparing OCR…', Math.max(0.05, p));
        else if (status.includes('initializ')) onProgress('Reading screenshot…', Math.max(0.1, p));
        else if (status.includes('recogniz')) onProgress('Extracting team stats…', Math.max(0.2, p));
        else onProgress(status, p);
      };

      onProgress('Preparing OCR…', 0.01);

      let worker: any;
      try {
        worker = await createWorker({ logger, workerPath, corePath, langPath });
      } catch {
        worker = await createWorker('eng', 1, { logger, workerPath, corePath, langPath });
      }

      try {
        if (worker?.loadLanguage) await withTimeout(worker.loadLanguage('eng'), 60000, 'loadLanguage');
        if (worker?.initialize) await withTimeout(worker.initialize('eng'), 60000, 'initialize');

        let combined = '';
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          const base = i / Math.max(1, files.length);
          onProgress(`Reading screenshot ${i + 1} of ${files.length}`, clamp(base, 0.15, 0.9));
          const res = await withTimeout(worker.recognize(f), 120000, `recognize(${f.name})`);
          const text = (res as any)?.data?.text ?? '';
          combined += `\n\n--- ${f.name} ---\n${text}`;
        }

        onProgress('Ready to review', 0.98);
        return combined.trim();
      } finally {
        try {
          await worker.terminate();
        } catch {
          // ignore
        }
      }
    })(),
    GLOBAL_TIMEOUT_MS,
    'Overall OCR processing',
  );
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

export default function SubmitPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myCoachName, setMyCoachName] = useState<string | null>(null);

  const [payload, setPayload] = useState<NextFixturePayload>(null);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [venue, setVenue] = useState('');

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');

  const [homeGoalMap, setHomeGoalMap] = useState<Record<string, number>>({});
  const [awayGoalMap, setAwayGoalMap] = useState<Record<string, number>>({});
  const [searchSide, setSearchSide] = useState<'home' | 'away' | 'both'>('both');
  const [playerSearch, setPlayerSearch] = useState('');

  const [notes, setNotes] = useState('');

  const [allPlayers, setAllPlayers] = useState<PlayerLite[]>([]);
  const [playerLoadErr, setPlayerLoadErr] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<Array<{ id: string; file: File; name: string; size: number; previewUrl: string }>>([]);
  const [ocr, setOcr] = useState<OcrState>({ status: 'idle' });
  const [ocrConfirm, setOcrConfirm] = useState(false);
  const [showOcrText, setShowOcrText] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<null | { message: string }>(null);

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

  const kickoffLabel = useMemo(() => formatKickoff(fixture?.startTime), [fixture?.startTime]);

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
        if (!uid) throw new Error('Not signed in.');
        if (!alive) return;

        setSessionUserId(uid);
        setSessionEmail(email);

        const profile = await fetchCoachProfile(uid);
        if (!profile?.team_id) throw new Error('This account is not linked to a team yet.');
        if (!alive) return;

        setMyTeamId(profile.team_id);
        setMyCoachName(profile.display_name || profile.psn || 'Coach');

        const activeComp = getStoredCompetitionKey();
        const seasonSlug = getDataSeasonSlugForCompetition(activeComp);
        const { data: seasonRow, error: seasonErr } = await supabase
          .from('eg_seasons')
          .select('id')
          .eq('slug', seasonSlug)
          .maybeSingle();
        if (seasonErr || !seasonRow?.id) {
          throw new Error(`Active season not found for slug "${seasonSlug}"`);
        }
        const activeSeasonId = String(seasonRow.id);

        const { data: fixtures, error: fxErr } = await supabase
          .from('eg_fixtures')
          .select('id, round, status, venue, season_id, start_time, home_team_id, away_team_id, home_goals, home_behinds, away_goals, away_behinds')
          .eq('season_id', activeSeasonId)
          .or(`home_team_id.eq.${profile.team_id},away_team_id.eq.${profile.team_id}`)
          .neq('status', 'FINAL')
          .order('round', { ascending: true })
          .limit(1);
        if (fxErr) throw fxErr;

        if (!fixtures || fixtures.length === 0) {
          if (alive) {
            setPayload(null);
            setVenue('');
          }
          return;
        }

        const fx = fixtures[0] as any;

        const [{ data: homeTeamData, error: homeErr }, { data: awayTeamData, error: awayErr }] = await Promise.all([
          supabase.from('eg_teams').select('*').eq('id', fx.home_team_id).maybeSingle(),
          supabase.from('eg_teams').select('*').eq('id', fx.away_team_id).maybeSingle(),
        ]);

        if (homeErr || awayErr) throw new Error('Failed to load team info');
        if (!alive) return;

        const homeName = resolveTeamName({
          name: homeTeamData?.name,
          shortName: homeTeamData?.short_name,
          slug: homeTeamData?.slug,
          teamKey: homeTeamData?.team_key,
        });
        const awayName = resolveTeamName({
          name: awayTeamData?.name,
          shortName: awayTeamData?.short_name,
          slug: awayTeamData?.slug,
          teamKey: awayTeamData?.team_key,
        });

        const nextPayload: NextFixturePayload = {
          fixture: {
            id: String(fx.id),
            round: safeNum(fx.round),
            venue: String(fx.venue || 'TBC'),
            status: String(fx.status || 'SCHEDULED'),
            seasonId: fx.season_id ? String(fx.season_id) : undefined,
            startTime: fx.start_time ? String(fx.start_time) : undefined,
          },
          homeTeam: {
            id: String(homeTeamData?.id || fx.home_team_id),
            name: homeName,
            shortName: deriveShortName(homeName, homeTeamData?.short_name || TEAM_SHORT_NAMES[homeName]),
            logo: resolveTeamLogo(homeName, homeTeamData?.logo_url || undefined),
            teamKey: homeTeamData?.team_key || undefined,
          },
          awayTeam: {
            id: String(awayTeamData?.id || fx.away_team_id),
            name: awayName,
            shortName: deriveShortName(awayName, awayTeamData?.short_name || TEAM_SHORT_NAMES[awayName]),
            logo: resolveTeamLogo(awayName, awayTeamData?.logo_url || undefined),
            teamKey: awayTeamData?.team_key || undefined,
          },
        };

        setPayload(nextPayload);
        setVenue(nextPayload.fixture.venue || '');
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
  }, []);

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
      setNotes(String(draft.notes || ''));
      setCurrentStep((draft.currentStep as Step) || 1);
      setOcrConfirm(!!draft.ocrConfirm);
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
      notes,
      currentStep,
      ocrConfirm,
      uploadedMeta: uploaded.map((u) => ({ name: u.name, size: u.size })),
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
    notes,
    currentStep,
    ocrConfirm,
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

  const unlinkedPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.teamName === 'All players (team not linked)')
        .sort((a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name)),
    [allPlayers],
  );

  const mergedPlayerList = useMemo(() => {
    const source = [
      ...(searchSide === 'home' || searchSide === 'both' ? homePlayers : []),
      ...(searchSide === 'away' || searchSide === 'both' ? awayPlayers : []),
      ...(searchSide === 'both' ? unlinkedPlayers : []),
    ];
    const q = playerSearch.trim().toLowerCase();
    const filtered = q
      ? source.filter((p) => p.name.toLowerCase().includes(q) || String(p.number || '').includes(q))
      : source;
    return filtered.sort((a, b) => {
      const aSide = a.teamName === homeTeam?.name ? 'home' : 'away';
      const bSide = b.teamName === homeTeam?.name ? 'home' : 'away';
      const aGoals = aSide === 'home' ? safeNum(homeGoalMap[a.id]) : safeNum(awayGoalMap[a.id]);
      const bGoals = bSide === 'home' ? safeNum(homeGoalMap[b.id]) : safeNum(awayGoalMap[b.id]);
      return bGoals - aGoals || (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name);
    });
  }, [searchSide, homePlayers, awayPlayers, unlinkedPlayers, playerSearch, homeTeam?.name, homeGoalMap, awayGoalMap]);

  const topScorers = useMemo(() => {
    const out: Array<{ id: string; name: string; goals: number; team: 'home' | 'away'; photoUrl?: string }> = [];
    for (const p of homePlayers) {
      const g = safeNum(homeGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'home', photoUrl: p.photoUrl });
    }
    for (const p of awayPlayers) {
      const g = safeNum(awayGoalMap[p.id]);
      if (g > 0) out.push({ id: p.id, name: p.name, goals: g, team: 'away', photoUrl: p.photoUrl });
    }
    return out.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 3);
  }, [homePlayers, awayPlayers, homeGoalMap, awayGoalMap]);

  const homeGoalKickers = useMemo(
    () => homePlayers
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(homeGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [homePlayers, homeGoalMap],
  );

  const awayGoalKickers = useMemo(
    () => awayPlayers
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, goals: safeNum(awayGoalMap[p.id]) }))
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [awayPlayers, awayGoalMap],
  );

  const canRunOcr = useMemo(() => uploaded.length > 0 && ocr.status !== 'ocr_running', [uploaded.length, ocr.status]);

  const isStep2Valid = useMemo(() => homeGoals !== '' && homeBehinds !== '' && awayGoals !== '' && awayBehinds !== '', [homeGoals, homeBehinds, awayGoals, awayBehinds]);
  const isStep3Valid = useMemo(() => isStep2Valid, [isStep2Valid]);
  const isStep4Valid = useMemo(() => uploaded.length > 0, [uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId || isSubmitting) return false;
    if (!isStep2Valid || !uploaded.length) return false;
    if (ocr.status !== 'done' && ocr.status !== 'idle') return false;
    if (ocr.status === 'done' && !ocrConfirm) return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, isStep2Valid, uploaded.length, ocr.status, ocrConfirm]);

  const getStatusChip = () => {
    if (submitSuccess) return { label: 'Submitted', tone: 'success' as const };
    if (draftSavedAt) return { label: 'Draft saved', tone: 'muted' as const };
    return { label: 'Ready to submit', tone: 'warning' as const };
  };

  const statusChip = getStatusChip();
  const competitionLabel = getCompetitionLabel();
  const draftSavedLabel = formatSavedAt(draftSavedAt);

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
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setUploaded((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
  };

  const runOcr = async () => {
    if (!canRunOcr) return;
    setOcr({ status: 'ocr_running', step: 'Preparing OCR…', progress01: 0.02 });
    setConflict(null);

    try {
      const rawText = await runTesseract(uploaded.map((u) => u.file), (step, p) => {
        setOcr({ status: 'ocr_running', step, progress01: p });
      });

      const teamStats = parseTeamStatsFromText(rawText);
      const playerLines = parsePlayerLinesFromText(rawText);
      setOcr({ status: 'done', rawText, teamStats, playerLines });
      setOcrConfirm(false);
    } catch (e: any) {
      const msg = e?.message || 'OCR failed';
      if (msg.includes('timed out')) {
        setOcr({ status: 'timeout', error: 'OCR took too long (20 seconds). Retry or continue with manual verification.' });
      } else {
        setOcr({ status: 'error', message: msg });
      }
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId || !canSubmit) return;
    setIsSubmitting(true);
    setConflict(null);

    try {
      const ocrPayload = ocr.status === 'done' ? {
        rawText: ocr.rawText,
        teamStats: ocr.teamStats,
        playerLines: ocr.playerLines,
      } : null;

      const { error: rpcErr } = await supabase.rpc('eg_submit_result_home_only', {
        p_fixture_id: fixture.id,
        p_home_goals: homeGoalsN,
        p_home_behinds: homeBehindsN,
        p_away_goals: awayGoalsN,
        p_away_behinds: awayBehindsN,
        p_venue: venue || null,
        p_goal_kickers_home: homeGoalKickers.length ? JSON.stringify(homeGoalKickers) : null,
        p_goal_kickers_away: awayGoalKickers.length ? JSON.stringify(awayGoalKickers) : null,
        p_ocr: ocrPayload ? JSON.stringify(ocrPayload) : null,
        p_notes: notes || null,
      });

      if (rpcErr) {
        setConflict({ message: rpcErr.message || 'Submit failed.' });
        return;
      }

      const draftKey = buildDraftKey(sessionUserId, fixture.id);
      window.localStorage.removeItem(draftKey);
      setSubmitSuccess(true);
    } catch (e: any) {
      setConflict({ message: e?.message || 'Submit failed.' });
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
              <div className="mdcLoading__sub">{loadError || 'No upcoming home fixture was found for your team.'}</div>
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
              <div className="mdcHero__chips">
                <span className="mdcChip">Round {fixture.round}</span>
                <span className="mdcChip">{competitionLabel}</span>
                <span className={`mdcChip mdcChip--${statusChip.tone}`}>{statusChip.label}</span>
              </div>
              <div className="mdcCoachPill">
                <Shield size={13} />
                <span>
                  Signed in as: {sessionEmail || myCoachName || 'coach'}
                  {draftSavedLabel ? ` • Draft ${draftSavedLabel}` : ''}
                </span>
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
                <div className="mdcHero__vs">VS</div>
                <div className="mdcHero__meta">{venue || 'TBC'} • {kickoffLabel}</div>
              </div>

              <div className="mdcTeamBlock">
                <div className="mdcTeamBlock__logo">
                  {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <span>{awayTeam.name.slice(0, 1)}</span>}
                </div>
                <div className="mdcTeamBlock__name" title={awayTeam.name}>{awayDisplayName}</div>
              </div>
            </div>

            <div className="mdcHero__bottom">
              <div className="mdcProgressMeta">Step {currentStep} of 5</div>
              <button type="button" className="mdcHeroCta" onClick={() => navigate(`/match-centre/${fixture.id}`)}>
                Match Centre <ChevronRight size={14} />
              </button>
            </div>
          </section>

          {conflict?.message ? (
            <div className="mdcStatus mdcStatus--danger">
              <AlertTriangle size={14} /> {conflict.message}
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
                      <div className="mdcRuleCard__text">This is your next scheduled fixture. Home coach submits final score, kickers and evidence for verification.</div>
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
                  <div className="mdcFilterRow">
                    <div className="mdcSeg">
                      {(['both', 'home', 'away'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          className={`mdcSeg__btn ${searchSide === side ? 'is-active' : ''}`}
                          onClick={() => setSearchSide(side)}
                        >
                          {side === 'both' ? 'Both' : side === 'home' ? homeTeam.shortName || 'Home' : awayTeam.shortName || 'Away'}
                        </button>
                      ))}
                    </div>
                    <label className="mdcSearch">
                      <Search size={14} />
                      <input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search players" />
                    </label>
                  </div>

                  <div className="mdcTopScorers">
                    <div className="mdcTopScorers__label">Top Scorers</div>
                  <div className="mdcTopScorers__chips">
                      {(topScorers.length ? topScorers : [
                        { id: 'ph1', name: 'Awaiting entries', goals: 0, team: 'home' as const, photoUrl: homePlayers[0]?.photoUrl },
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

                  {unlinkedPlayers.length ? (
                    <div className="mdcStatus mdcStatus--muted" style={{ marginTop: 10 }}>
                      Team links missing for some players. Showing “All players (team not linked)” in combined search.
                    </div>
                  ) : null}

                  <div className="mdcPickerGrid" role="list">
                    {mergedPlayerList.map((p) => {
                      const side: 'home' | 'away' =
                        p.teamName === homeTeam.name
                          ? 'home'
                          : p.teamName === awayTeam.name
                            ? 'away'
                            : searchSide === 'home'
                              ? 'home'
                              : 'away';
                      const goals = side === 'home' ? safeNum(homeGoalMap[p.id]) : safeNum(awayGoalMap[p.id]);
                      return (
                        <button
                          key={`${side}-${p.id}`}
                          type="button"
                          className={`mdcPickerHeadshot ${goals > 0 ? 'is-active' : ''}`}
                          onClick={() => setPlayerGoals(side, p.id, goals + 1)}
                          aria-label={`${p.name} (${side === 'home' ? homeDisplayName : awayDisplayName})`}
                          title={`${p.name}${goals > 0 ? ` • ${goals} goal${goals === 1 ? '' : 's'}` : ''}`}
                        >
                          {p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" /> : <span>{p.name.slice(0, 1).toUpperCase()}</span>}
                          {goals > 0 ? <strong>{goals}</strong> : null}
                        </button>
                      );
                    })}
                  </div>
                  {!mergedPlayerList.length ? <div className="mdcEmptyInline">No players found for this filter.</div> : null}

                  <div className="mdcSelectedKickers">
                    {[...homeGoalKickers, ...awayGoalKickers].map((k) => {
                      const side = homeGoalMap[k.id] ? 'home' : 'away';
                      return (
                        <button
                          key={k.id}
                          type="button"
                          className="mdcSelectedKicker"
                          onClick={() => setPlayerGoals(side, k.id, safeNum((side === 'home' ? homeGoalMap : awayGoalMap)[k.id]) - 1)}
                          aria-label={`Reduce ${k.name} goal count`}
                        >
                          <div className="mdcSelectedKicker__photo">
                            {k.photoUrl ? <img src={k.photoUrl} alt={k.name} loading="lazy" /> : <span>{k.name.slice(0, 1).toUpperCase()}</span>}
                          </div>
                          <span>{k.goals}</span>
                        </button>
                      );
                    })}
                    {!homeGoalKickers.length && !awayGoalKickers.length ? (
                      <div className="mdcEmptyInline">Tap player photos to add goal kickers.</div>
                    ) : null}
                  </div>

                  <div className="mdcActions">
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
                <div className="mdcCard__head">Evidence Upload + OCR</div>
                <div className="mdcCard__body">
                  <div className="mdcUploadDrop">
                    <div className="mdcUploadDrop__title">Upload screenshots</div>
                    <div className="mdcUploadDrop__sub">Screenshots are used as verification evidence.</div>
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

                  <div className="mdcOcrBar">
                    <button type="button" className="mdcBtn mdcBtn--primary" disabled={!canRunOcr} onClick={runOcr}>
                      <Wand2 size={14} /> {ocr.status === 'ocr_running' ? 'Running OCR…' : 'Run OCR'}
                    </button>
                    <div className="mdcOcrState">
                      {ocr.status === 'ocr_running' ? (
                        <>
                          <span>{ocr.step}</span>
                          <div className="mdcProgress"><div style={{ width: `${Math.round(ocr.progress01 * 100)}%` }} /></div>
                        </>
                      ) : ocr.status === 'done' ? (
                        <span className="is-done"><Check size={13} /> Ready to review</span>
                      ) : ocr.status === 'timeout' ? (
                        <span className="is-error"><AlertTriangle size={13} /> {ocr.error}</span>
                      ) : ocr.status === 'error' ? (
                        <span className="is-error"><AlertTriangle size={13} /> {ocr.message}</span>
                      ) : (
                        <span>Waiting for OCR run</span>
                      )}
                    </div>
                  </div>

                  {ocr.status === 'done' ? (
                    <div className="mdcOcrPreview">
                      <div className="mdcOcrPreview__head">
                        <span>OCR Summary</span>
                        <button type="button" onClick={() => setShowOcrText((v) => !v)}>
                          {showOcrText ? <><EyeOff size={13} /> Hide text</> : <><Eye size={13} /> View text</>}
                        </button>
                      </div>
                      <div className="mdcOcrPreview__stats">Detected stats: {Object.keys(ocr.teamStats || {}).length} • Player lines: {(ocr.playerLines || []).length}</div>
                      {showOcrText ? <pre className="mdcOcrPreview__text">{ocr.rawText}</pre> : null}
                      <label className="mdcConfirm">
                        <input type="checkbox" checked={ocrConfirm} onChange={(e) => setOcrConfirm(e.target.checked)} />
                        <span>Confirm OCR looks correct</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="mdcActions">
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
                    <div className={`mdcChecklist__row ${uploaded.length > 0 ? 'is-ok' : ''}`}><Check size={13} /> Evidence uploaded ({uploaded.length})</div>
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
              <div className="mdcSuccessCard__sub">Your result has been captured and is now pending verification.</div>
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
