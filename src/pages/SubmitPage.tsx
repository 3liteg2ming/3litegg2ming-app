import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Search,
  Trophy,
  Upload,
  User,
  X,
  Wand2,
  AlertTriangle,
  Home,
  Zap,
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { TEAM_COLORS, TEAM_SHORT_NAMES } from '../data/teamColors';
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

type GoalKicker = {
  id: string;
  name: string;
  photoUrl?: string;
  goals: number;
};

type Uploaded = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
};

type OcrState =
  | { status: 'idle' }
  | { status: 'uploading'; progress01: number }
  | { status: 'preprocessing'; progress01: number }
  | { status: 'ocr_running'; step: string; progress01: number }
  | { status: 'parsing'; progress01: number }
  | { status: 'done'; rawText: string; teamStats: Record<string, number>; playerLines: string[] }
  | { status: 'timeout'; error: string }
  | { status: 'error'; message: string };

type Step = 1 | 2 | 3 | 4 | 5;

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

function normLine(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim();
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
    const re = new RegExp(`${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*[:\\-]?\\s*(\\d{1,3})`, 'i');
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
    const ll = normLine(l);
    if (/^[A-Z][A-Z '\-\.]{2,}\s+\d{1,3}$/i.test(ll)) out.push(ll);
    else if (/^[A-Z][A-Z '\-\.]{2,}.*\s\d{1,3}$/i.test(ll) && /\d{1,3}$/.test(ll)) out.push(ll);
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

      if (!createWorker) {
        throw new Error('tesseract.js not available');
      }

      const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
      const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
      const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

      const logger = (m: any) => {
        if (!m?.status) return;
        const status = String(m.status);
        const p = typeof m.progress === 'number' ? clamp(m.progress, 0, 1) : 0;

        if (status.includes('loading')) onProgress('Loading OCR…', Math.max(0.05, p));
        else if (status.includes('initializ')) onProgress('Initialising OCR…', Math.max(0.1, p));
        else if (status.includes('recogniz')) onProgress('Recognising text…', Math.max(0.2, p));
        else onProgress(status, p);
      };

      onProgress('Starting…', 0.01);

      let worker: any;
      try {
        worker = await createWorker({ logger, workerPath, corePath, langPath });
      } catch {
        worker = await createWorker('eng', 1, { logger, workerPath, corePath, langPath });
      }

      try {
        if (worker?.loadLanguage) {
          onProgress('Loading language…', 0.06);
          await withTimeout(worker.loadLanguage('eng'), 60000, 'loadLanguage');
        }

        if (worker?.initialize) {
          onProgress('Initialising…', 0.12);
          await withTimeout(worker.initialize('eng'), 60000, 'initialize');
        }

        let combined = '';
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const base = i / Math.max(1, files.length);
          onProgress(`Reading image ${i + 1} of ${files.length}…`, clamp(base, 0.15, 0.9));

          const res = await withTimeout(worker.recognize(f), 120000, `recognize(${f.name})`);
          const text = (res as any)?.data?.text ?? '';

          combined += `\n\n--- ${f.name} ---\n`;
          combined += text;
        }

        onProgress('Finishing…', 0.98);
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

export default function SubmitPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myCoachName, setMyCoachName] = useState<string | null>(null);

  const [payload, setPayload] = useState<NextFixturePayload>(null);

  // Stepper
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // UI state
  const [venue, setVenue] = useState('');
  const [venueEditable, setVenueEditable] = useState(false);

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');

  const homeGoalsN = useMemo(() => safeNum(homeGoals), [homeGoals]);
  const homeBehindsN = useMemo(() => safeNum(homeBehinds), [homeBehinds]);
  const awayGoalsN = useMemo(() => safeNum(awayGoals), [awayGoals]);
  const awayBehindsN = useMemo(() => safeNum(awayBehinds), [awayBehinds]);

  const homeScore = useMemo(() => homeGoalsN * 6 + homeBehindsN, [homeGoalsN, homeBehindsN]);
  const awayScore = useMemo(() => awayGoalsN * 6 + awayBehindsN, [awayGoalsN, awayBehindsN]);

  const [homeGoalKickers, setHomeGoalKickers] = useState<GoalKicker[]>([]);
  const [awayGoalKickers, setAwayGoalKickers] = useState<GoalKicker[]>([]);

  const [homePlayerSearch, setHomePlayerSearch] = useState('');
  const [awayPlayerSearch, setAwayPlayerSearch] = useState('');
  const [notes, setNotes] = useState('');

  const [allPlayers, setAllPlayers] = useState<AflPlayer[]>([]);
  const [playerLoadErr, setPlayerLoadErr] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const [ocr, setOcr] = useState<OcrState>({ status: 'idle' });
  const [ocrConfirm, setOcrConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<null | { message: string; other?: any }>(null);

  const fixture = payload?.fixture || null;
  const homeTeam = payload?.homeTeam || null;
  const awayTeam = payload?.awayTeam || null;

  const youAreHome = useMemo(() => {
    if (!myTeamId || !homeTeam?.id) return false;
    return myTeamId === homeTeam.id;
  }, [myTeamId, homeTeam?.id]);

  // Get team colors for CSS variables
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

  // Load session, profile, and next fixture
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw authErr;
        const uid = authData.session?.user?.id || null;
        if (!uid) throw new Error('Not signed in.');
        if (!alive) return;

        setSessionUserId(uid);

        const { data: profile, error: pErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!profile?.team_id) throw new Error('This account is not linked to a team yet.');
        if (!alive) return;

        setMyTeamId(profile.team_id);
        setMyRole(profile.role || null);
        setMyCoachName(profile.display_name || profile.psn || 'Coach');

        const { data: fixtures, error: fxErr } = await supabase
          .from('eg_fixtures')
          .select('id, round, status, venue, home_team_id, away_team_id, home_goals, home_behinds, away_goals, away_behinds')
          .eq('home_team_id', profile.team_id)
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

        const fixture = fixtures[0];

        const { data: homeTeamData, error: homeErr } = await supabase
          .from('eg_teams')
          .select('*')
          .eq('id', fixture.home_team_id)
          .maybeSingle();

        const { data: awayTeamData, error: awayErr } = await supabase
          .from('eg_teams')
          .select('*')
          .eq('id', fixture.away_team_id)
          .maybeSingle();

        if (homeErr || awayErr) {
          throw new Error('Failed to load team info');
        }

        if (!alive) return;

        // Get logo from database or fall back to TEAM_COLORS
        const homeTeamName = homeTeamData?.name || 'Home Team';
        const awayTeamName = awayTeamData?.name || 'Away Team';
        const homeTeamLogo = homeTeamData?.logo_url || TEAM_COLORS[homeTeamName]?.logo;
        const awayTeamLogo = awayTeamData?.logo_url || TEAM_COLORS[awayTeamName]?.logo;

        const nextPayload: NextFixturePayload = {
          fixture: {
            id: fixture.id,
            round: fixture.round,
            venue: fixture.venue,
            status: fixture.status,
          },
          homeTeam: {
            id: homeTeamData?.id || fixture.home_team_id,
            name: homeTeamName,
            shortName: homeTeamData?.short_name,
            logo: homeTeamLogo,
            teamKey: homeTeamData?.team_key,
          },
          awayTeam: {
            id: awayTeamData?.id || fixture.away_team_id,
            name: awayTeamName,
            shortName: awayTeamData?.short_name,
            logo: awayTeamLogo,
            teamKey: awayTeamData?.team_key,
          },
        };

        setPayload(nextPayload);
        setVenue(nextPayload.fixture.venue);
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

  // Fetch AFL players
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const players = await fetchAflPlayers();
        if (alive) {
          setAllPlayers(players);
          setPlayerLoadErr(null);
        }
      } catch (e: any) {
        console.error('[Submit] failed to load players:', e);
        if (alive) {
          setPlayerLoadErr(e?.message || 'Failed to load player data');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Reset state when fixture changes
  useEffect(() => {
    setVenue((fixture?.venue as any) || '');
    setVenueEditable(false);
    setHomeGoals('');
    setHomeBehinds('');
    setAwayGoals('');
    setAwayBehinds('');
    setHomeGoalKickers([]);
    setAwayGoalKickers([]);
    setHomePlayerSearch('');
    setAwayPlayerSearch('');
    setNotes('');
    setUploaded([]);
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
    setSubmitSuccess(false);
    setConflict(null);
    setCurrentStep(1);
  }, [fixture?.id]);

  const canRunOcr = useMemo(() => {
    if (!fixture) return false;
    if (ocr.status === 'ocr_running') return false;
    return uploaded.length > 0;
  }, [fixture, ocr.status, uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId) return false;
    if (isSubmitting) return false;
    if (ocr.status !== 'done' && ocr.status !== 'idle') return false;
    if (ocr.status === 'done' && !ocrConfirm) return false;
    if (!uploaded.length) return false;
    if (!homeGoals || !homeBehinds || !awayGoals || !awayBehinds) return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, ocr.status, ocrConfirm, uploaded.length, homeGoals, homeBehinds, awayGoals, awayBehinds]);

  const getTeamPlayers = (teamId: string | undefined, search: string) => {
    if (!teamId || !allPlayers.length) return [];
    return allPlayers
      .filter((p) => {
        const teamMatch = p.teamId === teamId;
        const searchMatch =
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.teamName?.toLowerCase().includes(search.toLowerCase());
        return teamMatch && searchMatch;
      })
      .slice(0, 20);
  };

  const homeTeamPlayers = useMemo(() => getTeamPlayers(homeTeam?.id, homePlayerSearch), [homeTeam?.id, homePlayerSearch, allPlayers]);
  const awayTeamPlayers = useMemo(() => getTeamPlayers(awayTeam?.id, awayPlayerSearch), [awayTeam?.id, awayPlayerSearch, allPlayers]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const next: Uploaded[] = files.map((f) => ({
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
      const f = prev.find((x) => x.id === id);
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
  };

  const ensureKicker = (side: 'home' | 'away', name: string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setList((prev) => {
      const idx = prev.findIndex((k) => k.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        return prev.map((k, i) => (i === idx ? { ...k, goals: clamp(k.goals + 1, 0, 99) } : k));
      }
      return [...prev, { id: uuid(), name, goals: 1 }];
    });
  };

  const incGoal = (side: 'home' | 'away', id: string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setList((prev) => prev.map((k) => (k.id === id ? { ...k, goals: clamp(k.goals + 1, 0, 99) } : k)));
  };

  const decGoal = (side: 'home' | 'away', id: string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setList((prev) =>
      prev.map((k) => (k.id === id ? { ...k, goals: clamp(k.goals - 1, 0, 99) } : k)).filter((k) => k.goals > 0),
    );
  };

  const runOcr = async () => {
    if (!canRunOcr) return;

    setOcr({ status: 'ocr_running', step: 'Starting…', progress01: 0.02 });
    setConflict(null);

    try {
      const rawText = await runTesseract(
        uploaded.map((u) => u.file),
        (step, p) => setOcr({ status: 'ocr_running', step, progress01: p }),
      );

      const teamStats = parseTeamStatsFromText(rawText);
      const playerLines = parsePlayerLinesFromText(rawText);

      setOcr({ status: 'done', rawText, teamStats, playerLines });
      setOcrConfirm(false);
    } catch (e: any) {
      console.error('[Submit] OCR failed:', e);
      const msg = e?.message || 'OCR failed';
      if (msg.includes('timed out')) {
        setOcr({ status: 'timeout', error: 'OCR took too long (exceeded 20 seconds). You can retry or skip to manual entry.' });
      } else {
        setOcr({ status: 'error', message: msg });
      }
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId) return;
    if (!canSubmit) return;
    setIsSubmitting(true);
    setConflict(null);

    try {
      const ocrPayload = ocr.status === 'done' ? {
        rawText: (ocr as any).rawText,
        teamStats: (ocr as any).teamStats,
        playerLines: (ocr as any).playerLines,
      } : null;

      const { data: result, error: rpcErr } = await supabase.rpc('eg_submit_result_home_only', {
        p_fixture_id: fixture.id,
        p_home_goals: homeGoalsN,
        p_home_behinds: homeBehindsN,
        p_away_goals: awayGoalsN,
        p_away_behinds: awayBehindsN,
        p_venue: venue || null,
        p_goal_kickers_home: homeGoalKickers.length > 0 ? JSON.stringify(homeGoalKickers) : null,
        p_goal_kickers_away: awayGoalKickers.length > 0 ? JSON.stringify(awayGoalKickers) : null,
        p_ocr: ocrPayload ? JSON.stringify(ocrPayload) : null,
        p_notes: notes || null,
      });

      if (rpcErr) {
        setConflict({ message: rpcErr.message || 'Submit failed.' });
        setIsSubmitting(false);
        return;
      }

      setSubmitSuccess(true);
    } catch (e: any) {
      console.error('[Submit] submit failed:', e);
      setConflict({ message: e?.message || 'Submit failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const GoalKickerRow = ({ k, side }: { k: GoalKicker; side: 'home' | 'away' }) => (
    <div className="goalKickerRow">
      <div className="goalKickerRow__left">
        <div className="goalKickerRow__avatar">
          {k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User size={20} />}
        </div>
        <div className="goalKickerRow__meta">
          <div className="goalKickerRow__name" title={k.name}>
            {k.name}
          </div>
          <div className="goalKickerRow__label">Goals</div>
        </div>
      </div>
      <div className="goalKickerRow__right">
        <button type="button" className="goalKickerBtn" onClick={() => decGoal(side, k.id)} title="Remove goal">
          <Minus size={16} className="goalKickerBtn__icon" />
        </button>
        <div className="goalKickerCount">{k.goals}</div>
        <button type="button" className="goalKickerBtn" onClick={() => incGoal(side, k.id)} title="Add goal">
          <Plus size={16} className="goalKickerBtn__icon" />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div style={{ padding: '20px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '850', marginBottom: '10px' }}>Loading…</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Fetching your next fixture…</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !payload || !fixture || !homeTeam || !awayTeam) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div style={{ padding: '20px 4px' }}>
              <div style={{ fontSize: '16px', fontWeight: '850', marginBottom: '12px' }}>No eligible match</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.5' }}>
                {loadError || 'No upcoming fixtures available for submission. Check back when your next match is scheduled.'}
              </div>
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
          {/* Premium Fixture Header */}
          <div
            className="submitFixtureHeader"
            style={{
              '--homeR': homeTeamColors.r,
              '--homeG': homeTeamColors.g,
              '--homeB': homeTeamColors.b,
              '--awayR': awayTeamColors.r,
              '--awayG': awayTeamColors.g,
              '--awayB': awayTeamColors.b,
            } as any}
          >
            <div className="submitFixtureHeader__halo"></div>

            <div className="submitFixtureHeader__top">
              <div className="submitFixtureHeader__status">
                <div className="submitFixtureHeader__dot submitFixtureHeader__dot--upcoming"></div>
                <span>ROUND {fixture.round}</span>
              </div>
              <div className="submitFixtureHeader__coachBadge">
                <span>Signed in as:</span>
                <span className="submitFixtureHeader__coachName">{myCoachName}</span>
              </div>
            </div>

            <div className="submitFixtureHeader__main">
              <div className="submitFixtureHeader__side">
                <div className="submitFixtureHeader__teamBox">
                  {homeTeam.logo ? (
                    <img src={homeTeam.logo} alt={homeTeam.name} className="submitFixtureHeader__logo" />
                  ) : (
                    <span style={{ fontSize: '28px', fontWeight: '900', color: 'rgba(245,196,0,0.9)' }}>H</span>
                  )}
                </div>
                <div className="submitFixtureHeader__abbr">{TEAM_SHORT_NAMES[homeTeam.name] || homeTeam.name}</div>
              </div>

              <div className="submitFixtureHeader__center">
                <div className="submitFixtureHeader__vs">VS</div>
                <div className="submitFixtureHeader__meta">
                  {venue && (
                    <>
                      <span>{venue}</span>
                      <div className="submitFixtureHeader__metaDivider"></div>
                    </>
                  )}
                  <span>Ready to submit</span>
                </div>
              </div>

              <div className="submitFixtureHeader__side">
                <div className="submitFixtureHeader__teamBox">
                  {awayTeam.logo ? (
                    <img src={awayTeam.logo} alt={awayTeam.name} className="submitFixtureHeader__logo" />
                  ) : (
                    <span style={{ fontSize: '28px', fontWeight: '900', color: 'rgba(245,196,0,0.9)' }}>A</span>
                  )}
                </div>
                <div className="submitFixtureHeader__abbr">{TEAM_SHORT_NAMES[awayTeam.name] || awayTeam.name}</div>
              </div>
            </div>

            <div className="submitFixtureHeader__psnRow">
              <div className="submitFixtureHeader__psn">
                <Home size={16} className="submitFixtureHeader__psnIcon" />
                <span className="submitFixtureHeader__psnText">{homeTeam.name}</span>
              </div>
              <div className="submitFixtureHeader__psn">
                <Zap size={16} className="submitFixtureHeader__psnIcon" />
                <span className="submitFixtureHeader__psnText">{awayTeam.name}</span>
              </div>
            </div>
          </div>

          {/* Status bar */}
          {conflict?.message && (
            <div className="egSubmitStatus egSubmitStatus--danger">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} />
                {conflict.message}
              </div>
            </div>
          )}

          {/* Stepper Navigation */}
          <div className="submitStepper">
            {[1, 2, 3, 4, 5].map((step) => (
              <button
                key={step}
                type="button"
                className={`submitStepperItem ${currentStep === step ? 'isActive' : ''} ${currentStep > step ? 'isCompleted' : ''}`}
                onClick={() => setCurrentStep(step as Step)}
              >
                <div className="submitStepperItem__circle">
                  {currentStep > step ? <Check size={20} className="submitStepperItem__check" /> : step}
                </div>
                <div className="submitStepperItem__label">
                  {step === 1 && 'Fixture'}
                  {step === 2 && 'Score'}
                  {step === 3 && 'Kickers'}
                  {step === 4 && 'Upload'}
                  {step === 5 && 'Review'}
                </div>
              </button>
            ))}
          </div>

          {/* Step 1: Confirm Fixture */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="submitStepContent">
                <div className="submitGlassCard">
                  <div className="submitGlassCard__head">
                    <span>Confirm Match</span>
                  </div>
                  <div className="submitGlassCard__body">
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5', marginBottom: '14px' }}>
                      This is your next scheduled fixture. Once you submit results, this match will be marked as final and data will auto-update across the app.
                    </div>
                    <div className="egSubmitHint egSubmitHint--gold">
                      <Trophy size={16} className="egSubmitHint__icon" />
                      This is a home-team-only submission. Both teams' results must match before going live.
                    </div>
                    <div style={{ marginTop: '14px' }}>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        onClick={() => setCurrentStep(2)}
                      >
                        Continue to Score Entry →
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 2: Score Entry */}
          <AnimatePresence mode="wait">
            {currentStep === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="submitStepContent">
                <div className="submitGlassCard">
                  <div className="submitGlassCard__head">
                    <span>Final Score</span>
                  </div>
                  <div className="submitGlassCard__body">
                    <div className="scoreEntryModule">
                      <div className="scoreEntryBox">
                        <div className="scoreEntryBox__title">{homeTeam.name} (Home)</div>
                        <div className="scoreEntryGrid">
                          <div className="scoreEntryField">
                            <label className="scoreEntryLabel">Goals</label>
                            <input
                              className="scoreEntryInput"
                              inputMode="numeric"
                              value={homeGoals}
                              onChange={(e) => setHomeGoals(e.target.value.replace(/[^\d]/g, ''))}
                            />
                          </div>
                          <div className="scoreEntryField">
                            <label className="scoreEntryLabel">Behinds</label>
                            <input
                              className="scoreEntryInput"
                              inputMode="numeric"
                              value={homeBehinds}
                              onChange={(e) => setHomeBehinds(e.target.value.replace(/[^\d]/g, ''))}
                            />
                          </div>
                        </div>
                        <div className="scoreEntryTotal">
                          <span className="scoreEntryTotal__label">Total Score</span>
                          <span className="scoreEntryTotal__value">{homeScore}</span>
                        </div>
                      </div>

                      <div className="scoreEntryBox">
                        <div className="scoreEntryBox__title">{awayTeam.name} (Away)</div>
                        <div className="scoreEntryGrid">
                          <div className="scoreEntryField">
                            <label className="scoreEntryLabel">Goals</label>
                            <input
                              className="scoreEntryInput"
                              inputMode="numeric"
                              value={awayGoals}
                              onChange={(e) => setAwayGoals(e.target.value.replace(/[^\d]/g, ''))}
                            />
                          </div>
                          <div className="scoreEntryField">
                            <label className="scoreEntryLabel">Behinds</label>
                            <input
                              className="scoreEntryInput"
                              inputMode="numeric"
                              value={awayBehinds}
                              onChange={(e) => setAwayBehinds(e.target.value.replace(/[^\d]/g, ''))}
                            />
                          </div>
                        </div>
                        <div className="scoreEntryTotal">
                          <span className="scoreEntryTotal__label">Total Score</span>
                          <span className="scoreEntryTotal__value">{awayScore}</span>
                        </div>
                      </div>
                    </div>

                    {homeGoals && homeBehinds && awayGoals && awayBehinds && (
                      <div className="scoreLivePreview">
                        <div className="scoreLivePreview__teamScore">
                          <div className="scoreLivePreview__score">{homeScore}</div>
                          <div className="scoreLivePreview__team">{TEAM_SHORT_NAMES[homeTeam.name]}</div>
                        </div>
                        <div className="scoreLivePreview__dash">—</div>
                        <div className="scoreLivePreview__teamScore">
                          <div className="scoreLivePreview__score">{awayScore}</div>
                          <div className="scoreLivePreview__team">{TEAM_SHORT_NAMES[awayTeam.name]}</div>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(1)}
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(3)}
                        disabled={!homeGoals || !homeBehinds || !awayGoals || !awayBehinds}
                      >
                        Continue →
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 3: Goal Kickers */}
          <AnimatePresence mode="wait">
            {currentStep === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="submitStepContent">
                <div className="submitGlassCard">
                  <div className="submitGlassCard__head">
                    <span>Goal Kickers</span>
                  </div>
                  <div className="submitGlassCard__body">
                    <div className="goalKickerModule">
                      <div className="goalKickerBlock">
                        <div className="goalKickerBlock__title">{homeTeam.name}</div>
                        <div className="goalKickerSearch">
                          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', opacity: 0.5 }} />
                          <input
                            className="goalKickerSearch__input"
                            value={homePlayerSearch}
                            onChange={(e) => setHomePlayerSearch(e.target.value)}
                            placeholder="Search players…"
                            style={{ paddingLeft: '36px' }}
                          />
                          <button
                            type="button"
                            className="goalKickerSearch__btn"
                            onClick={() => homePlayerSearch.trim() && ensureKicker('home', homePlayerSearch.trim())}
                          >
                            Add
                          </button>
                        </div>
                        {homeTeamPlayers.length > 0 && (
                          <div className="goalKickerList">
                            {homeTeamPlayers.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="goalKickerChip"
                                onClick={() => ensureKicker('home', p.name)}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="goalKickerSelected">
                          {homeGoalKickers.length > 0 ? (
                            [...homeGoalKickers]
                              .sort((a, b) => b.goals - a.goals)
                              .map((k) => <GoalKickerRow key={k.id} k={k} side="home" />)
                          ) : (
                            <div className="egSubmitMuted">No goal kickers added yet</div>
                          )}
                        </div>
                      </div>

                      <div className="goalKickerBlock">
                        <div className="goalKickerBlock__title">{awayTeam.name}</div>
                        <div className="goalKickerSearch">
                          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', opacity: 0.5 }} />
                          <input
                            className="goalKickerSearch__input"
                            value={awayPlayerSearch}
                            onChange={(e) => setAwayPlayerSearch(e.target.value)}
                            placeholder="Search players…"
                            style={{ paddingLeft: '36px' }}
                          />
                          <button
                            type="button"
                            className="goalKickerSearch__btn"
                            onClick={() => awayPlayerSearch.trim() && ensureKicker('away', awayPlayerSearch.trim())}
                          >
                            Add
                          </button>
                        </div>
                        {awayTeamPlayers.length > 0 && (
                          <div className="goalKickerList">
                            {awayTeamPlayers.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="goalKickerChip"
                                onClick={() => ensureKicker('away', p.name)}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="goalKickerSelected">
                          {awayGoalKickers.length > 0 ? (
                            [...awayGoalKickers]
                              .sort((a, b) => b.goals - a.goals)
                              .map((k) => <GoalKickerRow key={k.id} k={k} side="away" />)
                          ) : (
                            <div className="egSubmitMuted">No goal kickers added yet</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(2)}
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(4)}
                      >
                        Continue →
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 4: Upload Evidence / OCR */}
          <AnimatePresence mode="wait">
            {currentStep === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="submitStepContent">
                <div className="submitGlassCard">
                  <div className="submitGlassCard__head">
                    <span>Match Evidence</span>
                  </div>
                  <div className="submitGlassCard__body">
                    <div className="ocrUploadModule">
                      <div>
                        <div className="ocrUploadTitle">Upload Screenshots *</div>
                        <div className="ocrUploadSub">Final score, team stats, and player stats screens</div>
                        <label className="ocrUploadBtn" style={{ marginTop: '10px' }}>
                          <Upload size={16} className="ocrUploadBtn__icon" />
                          Add Files
                          <input
                            ref={fileInputRef}
                            className="ocrUploadBtn__input"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={onPickFiles}
                          />
                        </label>
                      </div>

                      {uploaded.length > 0 && (
                        <div className="ocrFileList">
                          {uploaded.map((f) => (
                            <div className="ocrFile" key={f.id}>
                              <div className="ocrFile__meta">
                                <div className="ocrFile__name">{f.name}</div>
                                <div className="ocrFile__size">{bytesToKb(f.size)} KB</div>
                              </div>
                              <button type="button" className="ocrFile__removeBtn" onClick={() => removeFile(f.id)}>
                                <X size={12} className="ocrFile__removeIcon" /> Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="ocrRunBar">
                        <button type="button" className="ocrRunBtn" onClick={runOcr} disabled={!canRunOcr}>
                          <Wand2 size={16} className="ocrRunBtn__icon" />
                          {ocr.status === 'ocr_running' ? 'Running…' : 'Run OCR'}
                        </button>
                        <div className="ocrStatusBar">
                          {ocr.status === 'ocr_running' && (
                            <>
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', maxWidth: '60vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {(ocr as any).step}
                              </span>
                              <div className="ocrProgress">
                                <div className="ocrProgress__bar" style={{ width: `${Math.round((ocr as any).progress01 * 100)}%` }} />
                              </div>
                            </>
                          )}
                          {ocr.status === 'done' && (
                            <span className="ocrStatus ocrStatus--done">
                              <Check size={14} /> OCR ready
                            </span>
                          )}
                          {ocr.status === 'timeout' && (
                            <span className="ocrStatus ocrStatus--error">
                              <AlertTriangle size={14} /> Timeout
                            </span>
                          )}
                          {ocr.status === 'error' && (
                            <span className="ocrStatus ocrStatus--error">
                              <AlertTriangle size={14} /> Error
                            </span>
                          )}
                          {ocr.status === 'idle' && uploaded.length > 0 && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Ready to run</span>
                          )}
                        </div>
                      </div>

                      {ocr.status === 'timeout' && (
                        <div className="ocrTimeoutBox">
                          <div className="ocrTimeoutBox__title">OCR Taking Too Long</div>
                          <div className="ocrTimeoutBox__msg">{(ocr as any).error}</div>
                          <div className="ocrTimeoutBox__actions">
                            <button type="button" className="ocrTimeoutBtn" onClick={runOcr}>
                              Retry OCR
                            </button>
                            <button type="button" className="ocrTimeoutBtn ocrTimeoutBtn--secondary" onClick={() => setOcr({ status: 'idle' })}>
                              Skip to Review
                            </button>
                          </div>
                        </div>
                      )}

                      {ocr.status === 'error' && (
                        <div className="ocrTimeoutBox">
                          <div className="ocrTimeoutBox__title">OCR Error</div>
                          <div className="ocrTimeoutBox__msg">{(ocr as any).message}</div>
                          <div className="ocrTimeoutBox__actions">
                            <button type="button" className="ocrTimeoutBtn" onClick={runOcr}>
                              Retry
                            </button>
                            <button type="button" className="ocrTimeoutBtn ocrTimeoutBtn--secondary" onClick={() => setOcr({ status: 'idle' })}>
                              Continue
                            </button>
                          </div>
                        </div>
                      )}

                      {ocr.status === 'done' && (
                        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '14px', border: '1px solid rgba(180,255,210,0.28)', background: 'rgba(180,255,210,0.08)' }}>
                          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                            <input
                              type="checkbox"
                              checked={ocrConfirm}
                              onChange={(e) => setOcrConfirm(e.target.checked)}
                              style={{ marginTop: '3px' }}
                            />
                            <span>I've reviewed the OCR results and confirmed the data is correct</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(3)}
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="reviewSubmitCTA"
                        style={{ flex: 1 }}
                        onClick={() => setCurrentStep(5)}
                        disabled={!uploaded.length}
                      >
                        Continue →
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 5: Review & Submit */}
          <AnimatePresence mode="wait">
            {currentStep === 5 && (
              <motion.div key="step5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="submitStepContent">
                <div className="submitGlassCard">
                  <div className="submitGlassCard__head">
                    <span>Review & Submit</span>
                  </div>
                  <div className="submitGlassCard__body">
                    <div className="reviewSubmitCard">
                      <div className="reviewSummaryBox">
                        <div className="reviewSummaryBox__title">Final Score</div>
                        <div className="reviewSummaryGrid">
                          <div className="reviewSummaryItem">
                            <div className="reviewSummaryItem__label">{homeTeam.name}</div>
                            <div className="reviewSummaryItem__value">
                              {homeGoalsN}G • {homeBehindsN}B = {homeScore}
                            </div>
                          </div>
                          <div className="reviewSummaryItem">
                            <div className="reviewSummaryItem__label">{awayTeam.name}</div>
                            <div className="reviewSummaryItem__value">
                              {awayGoalsN}G • {awayBehindsN}B = {awayScore}
                            </div>
                          </div>
                        </div>
                      </div>

                      {(homeGoalKickers.length > 0 || awayGoalKickers.length > 0) && (
                        <div className="reviewSummaryBox">
                          <div className="reviewSummaryBox__title">Goal Kickers</div>
                          {homeGoalKickers.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>{homeTeam.name}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {homeGoalKickers.map((k) => (
                                  <div
                                    key={k.id}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '8px',
                                      background: 'rgba(0,0,0,0.24)',
                                      border: '1px solid rgba(245,196,0,0.18)',
                                      fontSize: '11px',
                                      color: 'rgba(255,255,255,0.8)',
                                    }}
                                  >
                                    {k.name} ({k.goals})
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {awayGoalKickers.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>{awayTeam.name}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {awayGoalKickers.map((k) => (
                                  <div
                                    key={k.id}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '8px',
                                      background: 'rgba(0,0,0,0.24)',
                                      border: '1px solid rgba(245,196,0,0.18)',
                                      fontSize: '11px',
                                      color: 'rgba(255,255,255,0.8)',
                                    }}
                                  >
                                    {k.name} ({k.goals})
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="reviewNotesBox">
                        <div className="reviewNotesLabel">Notes (optional)</div>
                        <textarea
                          className="reviewNotesTextarea"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Any details for admins?"
                        />
                      </div>

                      <button type="button" className="reviewSubmitCTA" onClick={submit} disabled={!canSubmit || isSubmitting}>
                        {isSubmitting ? 'Submitting…' : 'Submit Match Results'}
                      </button>

                      <div style={{ marginTop: '8px', display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          className="reviewSubmitCTA"
                          style={{
                            flex: 1,
                            background: 'rgba(0,0,0,0.25)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.75)',
                          }}
                          onClick={() => setCurrentStep(4)}
                        >
                          ← Back
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Success Overlay */}
      <AnimatePresence>
        {submitSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="submitSuccessOverlay">
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} className="submitSuccessCard">
              <div className="submitSuccessIcon">
                <Check size={28} />
              </div>
              <div className="submitSuccessTitle">Submitted Successfully!</div>
              <div className="submitSuccessSub">
                Your match results have been recorded. If the away team's submission matches, the match will go live.
              </div>

              <div className="submitSuccessScore">
                <span className="submitSuccessScore__score">{homeScore}</span>
                <span className="submitSuccessScore__dash">—</span>
                <span className="submitSuccessScore__score">{awayScore}</span>
              </div>

              <div className="submitSuccessActions">
                <button
                  type="button"
                  className="submitSuccessAction isPrimary"
                  onClick={() => {
                    setSubmitSuccess(false);
                    window.location.href = '/';
                  }}
                >
                  Back to Home
                </button>
                <button
                  type="button"
                  className="submitSuccessAction"
                  onClick={() => {
                    setSubmitSuccess(false);
                    window.location.reload();
                  }}
                >
                  View Updated Fixtures
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
