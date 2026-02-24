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
  Shield,
  Trophy,
  Upload,
  User,
  X,
  Wand2,
  AlertTriangle,
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
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
  | { status: 'running'; step: string; progress01: number }
  | { status: 'ready'; rawText: string; teamStats: Record<string, number>; playerLines: string[] }
  | { status: 'error'; message: string };

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
  // Simple, AFL-style keywords (we can expand later).
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
    // looks for: KEY .... number
    // e.g. "TACKLES 65" or "INSIDE 50: 54"
    const re = new RegExp(`${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*[:\\-]?\\s*(\\d{1,3})`, 'i');
    const m = text.match(re);
    if (m?.[1]) out[k] = safeNum(m[1]);
  }

  return out;
}

function parsePlayerLinesFromText(raw: string) {
  // We don't try to fully map players yet (that’s later). For now:
  // return lines that look like: "NAME 23" or "NAME ... 31".
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];

  for (const l of lines) {
    const ll = normLine(l);
    // crude heuristic: contains letters and ends with a number.
    if (/^[A-Z][A-Z '\-\.]{2,}\s+\d{1,3}$/i.test(ll)) out.push(ll);
    else if (/^[A-Z][A-Z '\-\.]{2,}.*\s\d{1,3}$/i.test(ll) && /\d{1,3}$/.test(ll)) out.push(ll);
  }

  // keep it readable
  return out.slice(0, 50);
}

/**
 * ✅ Robust OCR runner for Vite + different tesseract.js versions.
 * - Forces worker/core/lang paths (prevents "hang forever")
 * - Shows progress for all stages
 * - Uses timeouts so it never stalls indefinitely
 * - Always terminates worker
 */
async function runTesseract(files: File[], onProgress: (step: string, progress01: number) => void) {
  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string) => {
    return await new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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

  // Dynamic import so the rest of the app loads fast.
  const mod: any = await import('tesseract.js');
  const createWorker = mod?.createWorker ?? mod?.default?.createWorker;

  if (!createWorker) {
    throw new Error('tesseract.js createWorker not found (install/version mismatch).');
  }

  // ✅ Known-good hosted assets (avoid Vite local worker resolution issues)
  const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
  const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
  const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

  const logger = (m: any) => {
    if (!m?.status) return;
    const status = String(m.status);
    const p = typeof m.progress === 'number' ? clamp(m.progress, 0, 1) : 0;

    // Surface more states so you can see where it is, not just "Starting…"
    if (status.includes('loading')) onProgress('Loading OCR…', Math.max(0.05, p));
    else if (status.includes('initializ')) onProgress('Initialising OCR…', Math.max(0.1, p));
    else if (status.includes('recogniz')) onProgress('Recognising text…', Math.max(0.2, p));
    else onProgress(status, p);
  };

  onProgress('Starting…', 0.01);

  // Support both common signatures:
  // - v4: createWorker(options)
  // - v5+: createWorker(lang, oem, options)
  let worker: any;
  try {
    worker = await createWorker({ logger, workerPath, corePath, langPath });
  } catch {
    worker = await createWorker('eng', 1, { logger, workerPath, corePath, langPath });
  }

  try {
    // Some versions require explicit language load/initialize. Some do it internally.
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
      const text = res?.data?.text ?? '';

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
}

export default function SubmitPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [payload, setPayload] = useState<NextFixturePayload>(null);

  const [expandedMatch, setExpandedMatch] = useState(true);
  const [expandedScore, setExpandedScore] = useState(true);
  const [expandedGoalKickers, setExpandedGoalKickers] = useState(true);
  const [expandedEvidence, setExpandedEvidence] = useState(true);
  const [expandedOcr, setExpandedOcr] = useState(true);

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

  // 1) Load session, profile, and next fixture.
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

        // Profile -> team
        const { data: profile, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, role, team_id')
          .eq('user_id', uid)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!profile?.team_id) throw new Error('This account is not linked to a team yet.');
        if (!alive) return;

        setMyTeamId(profile.team_id);
        setMyRole(profile.role || null);

        // Next fixture (RPC)
        const { data: fxJson, error: fxErr } = await supabase.rpc('eg_next_fixture_with_teams_for_user', {
          p_user_id: uid,
        });

        if (fxErr) throw fxErr;
        if (!alive) return;

        setPayload((fxJson as any) || null);
        setVenue((fxJson as any)?.fixture?.venue || '');
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

  // Reset per-fixture state.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture?.id]);

  const canRunOcr = useMemo(() => {
    if (!fixture) return false;
    if (ocr.status === 'running') return false;
    return uploaded.length > 0;
  }, [fixture, ocr.status, uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId) return false;
    if (isSubmitting) return false;
    if (!ocrConfirm) return false;
    if (!uploaded.length) return false;
    if (!homeGoals || !homeBehinds || !awayGoals || !awayBehinds) return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, ocrConfirm, uploaded.length, homeGoals, homeBehinds, awayGoals, awayBehinds]);

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

    setOcr({ status: 'running', step: 'Starting…', progress01: 0.02 });
    setConflict(null);

    try {
      const rawText = await runTesseract(
        uploaded.map((u) => u.file),
        (step, p) => setOcr({ status: 'running', step, progress01: p }),
      );

      const teamStats = parseTeamStatsFromText(rawText);
      const playerLines = parsePlayerLinesFromText(rawText);

      setOcr({ status: 'ready', rawText, teamStats, playerLines });
      setExpandedOcr(true);
    } catch (e: any) {
      console.error('[Submit] OCR failed:', e);
      setOcr({ status: 'error', message: e?.message || 'OCR failed.' });
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId) return;
    if (!canSubmit) return;
    setIsSubmitting(true);
    setConflict(null);

    try {
      // 1) Save submission
      const submissionId = uuid();
      const screenshotsMeta = uploaded.map((u) => ({ id: u.id, name: u.name, size: u.size }));
      const ocrTeamStats = ocr.status === 'ready' ? ocr.teamStats : {};
      const ocrPlayerStats = ocr.status === 'ready' ? { lines: ocr.playerLines } : {};

      const { error: insErr } = await supabase.from('submissions').insert({
        id: submissionId,
        fixture_id: fixture.id,
        team_id: myTeamId,
        home_goals: homeGoalsN,
        home_behinds: homeBehindsN,
        away_goals: awayGoalsN,
        away_behinds: awayBehindsN,
        screenshots: screenshotsMeta,
        ocr_team_stats: ocrTeamStats,
        ocr_player_stats: ocrPlayerStats,
        goal_kickers_home: homeGoalKickers,
        goal_kickers_away: awayGoalKickers,
      });
      if (insErr) throw insErr;

      // 2) Check if the other team has already submitted
      const { data: allSubs, error: sErr } = await supabase.from('submissions').select('*').eq('fixture_id', fixture.id);
      if (sErr) throw sErr;

      const homeSub = (allSubs || []).find((s: any) => s.team_id === homeTeam?.id) || null;
      const awaySub = (allSubs || []).find((s: any) => s.team_id === awayTeam?.id) || null;

      // 3) Update fixture status depending on what we have.
      if (homeSub && awaySub) {
        const match =
          safeNum(homeSub.home_goals) === safeNum(awaySub.home_goals) &&
          safeNum(homeSub.home_behinds) === safeNum(awaySub.home_behinds) &&
          safeNum(homeSub.away_goals) === safeNum(awaySub.away_goals) &&
          safeNum(homeSub.away_behinds) === safeNum(awaySub.away_behinds);

        if (match) {
          const hGoals = safeNum(homeSub.home_goals);
          const hBeh = safeNum(homeSub.home_behinds);
          const aGoals = safeNum(homeSub.away_goals);
          const aBeh = safeNum(homeSub.away_behinds);

          const { error: uErr } = await supabase
            .from('eg_fixtures')
            .update({
              home_goals: hGoals,
              home_behinds: hBeh,
              away_goals: aGoals,
              away_behinds: aBeh,
              home_total: hGoals * 6 + hBeh,
              away_total: aGoals * 6 + aBeh,
              status: 'FINAL',
            })
            .eq('id', fixture.id);
          if (uErr) throw uErr;
        } else {
          const { error: uErr } = await supabase.from('eg_fixtures').update({ status: 'CONFLICT' }).eq('id', fixture.id);
          if (uErr) throw uErr;
          setConflict({
            message: 'Conflict detected: home and away submissions do not match. Admin review needed.',
            other: youAreHome ? awaySub : homeSub,
          });
        }
      } else {
        const pending = youAreHome ? 'PENDING_AWAY' : 'PENDING_HOME';
        const { error: uErr } = await supabase.from('eg_fixtures').update({ status: pending }).eq('id', fixture.id);
        if (uErr) throw uErr;
      }

      // 4) Success UI
      setSubmitSuccess(true);
    } catch (e: any) {
      console.error('[Submit] submit failed:', e);
      setConflict({ message: e?.message || 'Submit failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const KickerRow = ({ k, side }: { k: GoalKicker; side: 'home' | 'away' }) => (
    <div className="egSubmitKicker">
      <div className="egSubmitKicker__left">
        <div className="egSubmitKicker__avatar">{k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User />}</div>
        <div className="egSubmitKicker__meta">
          <div className="egSubmitKicker__name" title={k.name}>
            {k.name}
          </div>
          <div className="egSubmitKicker__sub">Goals</div>
        </div>
      </div>
      <div className="egSubmitKicker__right">
        <button type="button" className="egSubmitKickerBtn" onClick={() => decGoal(side, k.id)}>
          <Minus />
        </button>
        <div className="egSubmitKicker__goals">{k.goals}</div>
        <button type="button" className="egSubmitKickerBtn" onClick={() => incGoal(side, k.id)}>
          <Plus />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="egSubmitHeader">
              <div>
                <h1 className="egSubmitHeader__title">Submit Match Results</h1>
                <p className="egSubmitHeader__sub">Loading…</p>
              </div>
              <div className="egSubmitHeader__pill">
                <Shield className="egSubmitHeader__pillIcon" />
                Coach Portal
              </div>
            </div>
            <div className="egSubmitStatus">Fetching your next fixture…</div>
          </div>
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="egSubmitHeader">
              <div>
                <h1 className="egSubmitHeader__title">Submit Match Results</h1>
                <p className="egSubmitHeader__sub">You must be signed in and linked to a team.</p>
                <div className="egSubmitHeader__meta">
                  <span className="egSubmitHeader__metaStrong">Error:</span> {loadError}
                </div>
              </div>
              <div className="egSubmitHeader__pill">
                <Shield className="egSubmitHeader__pillIcon" />
                Coach Portal
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!payload || !fixture || !homeTeam || !awayTeam) {
    return (
      <div className="egSubmitPage">
        <main className="egSubmitPage__main">
          <div className="egSubmitPage__wrap">
            <div className="egSubmitHeader">
              <div>
                <h1 className="egSubmitHeader__title">Submit Match Results</h1>
                <p className="egSubmitHeader__sub">No eligible fixture found.</p>
                <div className="egSubmitHeader__meta">
                  This page only shows your <span className="egSubmitHeader__metaStrong">next scheduled fixture</span> that you
                  haven’t submitted yet.
                </div>
              </div>
              <div className="egSubmitHeader__pill">
                <Shield className="egSubmitHeader__pillIcon" />
                Coach Portal
              </div>
            </div>
            <div className="egSubmitEmpty">
              <div className="egSubmitEmpty__title">Nothing to submit right now</div>
              <div className="egSubmitEmpty__sub">If you think this is wrong, check your team assignment in profiles.</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Small, local “player picker” until we wire real player lists.
  const homeKickerSuggestions = ['Player 1', 'Player 2', 'Player 3']
    .filter((n) => n.toLowerCase().includes(homePlayerSearch.toLowerCase()))
    .slice(0, 12);
  const awayKickerSuggestions = ['Player 1', 'Player 2', 'Player 3']
    .filter((n) => n.toLowerCase().includes(awayPlayerSearch.toLowerCase()))
    .slice(0, 12);

  return (
    <div className="egSubmitPage">
      <main className="egSubmitPage__main">
        <div className="egSubmitPage__wrap">
          <div className="egSubmitHeader">
            <div>
              <h1 className="egSubmitHeader__title">Submit Match Results</h1>
              <p className="egSubmitHeader__sub">Upload → OCR → confirm → submit.</p>
              <div className="egSubmitHeader__meta">
                Signed in as <span className="egSubmitHeader__metaStrong">{myRole || 'coach'}</span>
              </div>
            </div>
            <div className="egSubmitHeader__pill">
              <Shield className="egSubmitHeader__pillIcon" />
              Coach Portal
            </div>
          </div>

          {conflict?.message ? (
            <div className="egSubmitStatus egSubmitStatus--danger">
              <div className="egSubmitStatus__left">
                <AlertTriangle className="egSubmitStatus__warn" />
                {conflict.message}
              </div>
            </div>
          ) : (
            <div className="egSubmitStatus">
              <div>
                Next fixture auto-detected.{' '}
                <span style={{ color: 'rgba(245,196,0,0.95)', fontWeight: 800 }}>
                  {youAreHome ? 'You are HOME' : 'You are AWAY'}
                </span>
                .
              </div>
            </div>
          )}

          {/* Match */}
          <section className="egSubmitCard">
            <button type="button" className="egSubmitCard__head" onClick={() => setExpandedMatch((v) => !v)}>
              <div className="egSubmitCard__title">Match</div>
              <ChevronDown className={`egSubmitCard__chev ${expandedMatch ? 'isOpen' : ''}`} />
            </button>

            <AnimatePresence initial={false}>
              {expandedMatch ? (
                <motion.div
                  key="match"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="egSubmitCard__body"
                >
                  <div className="egSubmitFixtureSummary">
                    <div className="egSubmitFixtureSummary__row">
                      <div className="egSubmitFixtureSummary__k">Round</div>
                      <div className="egSubmitFixtureSummary__v">{fixture.round}</div>
                    </div>
                    <div className="egSubmitFixtureSummary__row">
                      <div className="egSubmitFixtureSummary__k">Status</div>
                      <div className="egSubmitFixtureSummary__v">{fixture.status}</div>
                    </div>
                  </div>

                  <div className="egSubmitTeams">
                    <div className="egSubmitTeam">
                      <div className="egSubmitTeam__logo">
                        {homeTeam.logo ? (
                          <img src={homeTeam.logo} alt={homeTeam.name} />
                        ) : (
                          <span className="egSubmitTeam__logoFallback">H</span>
                        )}
                      </div>
                      <div className="egSubmitTeam__info">
                        <div className="egSubmitTeam__name">{homeTeam.name}</div>
                        <div className="egSubmitTeam__tag">Home</div>
                      </div>
                    </div>

                    <div className="egSubmitVs">VS</div>

                    <div className="egSubmitTeam egSubmitTeam--right">
                      <div className="egSubmitTeam__info" style={{ textAlign: 'right' }}>
                        <div className="egSubmitTeam__name">{awayTeam.name}</div>
                        <div className="egSubmitTeam__tag">Away</div>
                      </div>
                      <div className="egSubmitTeam__logo">
                        {awayTeam.logo ? (
                          <img src={awayTeam.logo} alt={awayTeam.name} />
                        ) : (
                          <span className="egSubmitTeam__logoFallback">A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="egSubmitVenue">
                    <div className="egSubmitVenue__top">
                      <div className="egSubmitVenue__label">Venue</div>
                      <button
                        type="button"
                        className="egSubmitVenue__toggle"
                        onClick={() => setVenueEditable((v) => !v)}
                        aria-label={venueEditable ? 'Lock venue' : 'Edit venue'}
                      >
                        {venueEditable ? (
                          <>
                            <EyeOff className="egSubmitVenue__toggleIcon" /> Lock
                          </>
                        ) : (
                          <>
                            <Eye className="egSubmitVenue__toggleIcon" /> Edit
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      className={`egSubmitInput ${venueEditable ? '' : 'isLocked'}`}
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      disabled={!venueEditable}
                      placeholder="Venue"
                    />
                  </div>

                  <div className="egSubmitHint egSubmitHint--gold">
                    <Trophy className="egSubmitHint__icon" />
                    Auto-detect shows only your next fixture. You can’t submit old rounds or re-submit a match.
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Evidence + OCR */}
          <section className="egSubmitCard">
            <button type="button" className="egSubmitCard__head" onClick={() => setExpandedEvidence((v) => !v)}>
              <div className="egSubmitCard__title">Evidence</div>
              <ChevronDown className={`egSubmitCard__chev ${expandedEvidence ? 'isOpen' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expandedEvidence ? (
                <motion.div
                  key="evidence"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="egSubmitCard__body"
                >
                  <div className="egSubmitEvidenceTop">
                    <div>
                      <div className="egSubmitEvidenceTop__title">Upload screenshots *</div>
                      <div className="egSubmitEvidenceTop__sub">Final score + team stats + player stats pages.</div>
                    </div>
                    <label className="egSubmitUploadBtn">
                      <Upload className="egSubmitUploadBtn__icon" /> Add
                      <input
                        ref={fileInputRef}
                        className="egSubmitUploadBtn__input"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onPickFiles}
                      />
                    </label>
                  </div>

                  {uploaded.length ? (
                    <div className="egSubmitFiles">
                      {uploaded.map((f) => (
                        <div className="egSubmitFile" key={f.id}>
                          <div className="egSubmitFile__meta">
                            <div className="egSubmitFile__name">{f.name}</div>
                            <div className="egSubmitFile__size">{bytesToKb(f.size)} KB</div>
                          </div>
                          <button type="button" className="egSubmitFile__remove" onClick={() => removeFile(f.id)}>
                            <X className="egSubmitFile__removeIcon" /> Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="egSubmitMuted">No files yet. Upload your screenshots first.</div>
                  )}

                  <div className="egSubmitOcrBar">
                    <button type="button" className="egSubmitOcrBtn" onClick={runOcr} disabled={!canRunOcr}>
                      <Wand2 className="egSubmitOcrBtn__icon" />
                      {ocr.status === 'running' ? 'Running OCR…' : 'Run OCR'}
                    </button>
                    <div className="egSubmitOcrBar__right">
                      {ocr.status === 'running' ? (
                        <>
                          <div className="egSubmitOcrStep">{ocr.step}</div>
                          <div className="egSubmitOcrProg">
                            <div className="egSubmitOcrProg__bar" style={{ width: `${Math.round(ocr.progress01 * 100)}%` }} />
                          </div>
                        </>
                      ) : ocr.status === 'ready' ? (
                        <div className="egSubmitOcrOk">
                          <Check /> OCR ready
                        </div>
                      ) : ocr.status === 'error' ? (
                        <div className="egSubmitOcrErr">
                          <AlertTriangle /> {ocr.message}
                        </div>
                      ) : (
                        <div className="egSubmitOcrMuted">Run OCR to auto-fill stats preview.</div>
                      )}
                    </div>
                  </div>

                  {/* OCR results */}
                  <section className={`egSubmitOcrPanel ${ocr.status === 'ready' ? '' : 'isDisabled'}`}>
                    <button
                      type="button"
                      className="egSubmitOcrPanel__head"
                      onClick={() => setExpandedOcr((v) => !v)}
                      disabled={ocr.status !== 'ready'}
                    >
                      <div className="egSubmitCard__title">OCR Results</div>
                      <ChevronDown className={`egSubmitCard__chev ${expandedOcr ? 'isOpen' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {expandedOcr && ocr.status === 'ready' ? (
                        <motion.div
                          key="ocr"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="egSubmitOcrPanel__body"
                        >
                          <div className="egSubmitOcrGrid">
                            <div className="egSubmitOcrBox">
                              <div className="egSubmitOcrBox__title">Team stats (detected)</div>
                              {Object.keys(ocr.teamStats).length ? (
                                <div className="egSubmitOcrStats">
                                  {Object.entries(ocr.teamStats)
                                    .slice(0, 12)
                                    .map(([k, v]) => (
                                      <div key={k} className="egSubmitOcrStat">
                                        <div className="egSubmitOcrStat__k">{k}</div>
                                        <div className="egSubmitOcrStat__v">{v}</div>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <div className="egSubmitOcrMuted">No team stats detected yet (we’ll improve parsing next).</div>
                              )}
                            </div>

                            <div className="egSubmitOcrBox">
                              <div className="egSubmitOcrBox__title">Player lines (detected)</div>
                              {ocr.playerLines.length ? (
                                <div className="egSubmitOcrLines">
                                  {ocr.playerLines.slice(0, 14).map((l, i) => (
                                    <div key={`${l}-${i}`} className="egSubmitOcrLine">
                                      {l}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="egSubmitOcrMuted">No player lines detected yet.</div>
                              )}
                            </div>
                          </div>

                          <details className="egSubmitOcrRaw">
                            <summary>Show raw OCR text</summary>
                            <pre>{ocr.rawText}</pre>
                          </details>

                          <label className="egSubmitOcrConfirm">
                            <input type="checkbox" checked={ocrConfirm} onChange={(e) => setOcrConfirm(e.target.checked)} />
                            I’ve reviewed the OCR preview and my screenshots are correct.
                          </label>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </section>

                  <div className="egSubmitNotes">
                    <div className="egSubmitLabel">Notes (optional)</div>
                    <textarea
                      className="egSubmitTextarea"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything the admin should know?"
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Score */}
          <section className={`egSubmitCard ${!fixture ? 'isDisabled' : ''}`}>
            <button type="button" className="egSubmitCard__head" onClick={() => setExpandedScore((v) => !v)}>
              <div className="egSubmitCard__title">Score</div>
              <ChevronDown className={`egSubmitCard__chev ${expandedScore ? 'isOpen' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expandedScore ? (
                <motion.div
                  key="score"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="egSubmitCard__body"
                >
                  <div className="egSubmitGrid2">
                    <div className="egSubmitScoreBox">
                      <div className="egSubmitScoreBox__title">{homeTeam.name} (Home)</div>
                      <div className="egSubmitScoreBox__grid">
                        <div>
                          <div className="egSubmitLabel">Goals</div>
                          <input
                            className="egSubmitInput"
                            inputMode="numeric"
                            value={homeGoals}
                            onChange={(e) => setHomeGoals(e.target.value.replace(/[^\d]/g, ''))}
                          />
                        </div>
                        <div>
                          <div className="egSubmitLabel">Behinds</div>
                          <input
                            className="egSubmitInput"
                            inputMode="numeric"
                            value={homeBehinds}
                            onChange={(e) => setHomeBehinds(e.target.value.replace(/[^\d]/g, ''))}
                          />
                        </div>
                      </div>
                      <div className="egSubmitTotal">
                        <div className="egSubmitTotal__k">Total</div>
                        <div className="egSubmitTotal__v">{homeScore}</div>
                      </div>
                    </div>

                    <div className="egSubmitScoreBox">
                      <div className="egSubmitScoreBox__title">{awayTeam.name} (Away)</div>
                      <div className="egSubmitScoreBox__grid">
                        <div>
                          <div className="egSubmitLabel">Goals</div>
                          <input
                            className="egSubmitInput"
                            inputMode="numeric"
                            value={awayGoals}
                            onChange={(e) => setAwayGoals(e.target.value.replace(/[^\d]/g, ''))}
                          />
                        </div>
                        <div>
                          <div className="egSubmitLabel">Behinds</div>
                          <input
                            className="egSubmitInput"
                            inputMode="numeric"
                            value={awayBehinds}
                            onChange={(e) => setAwayBehinds(e.target.value.replace(/[^\d]/g, ''))}
                          />
                        </div>
                      </div>
                      <div className="egSubmitTotal">
                        <div className="egSubmitTotal__k">Total</div>
                        <div className="egSubmitTotal__v">{awayScore}</div>
                      </div>
                    </div>
                  </div>

                  <div className="egSubmitHint">
                    <Shield className="egSubmitHint__icon" />
                    Scores must match between home + away submissions before the match goes live.
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Goal kickers */}
          <section className="egSubmitCard">
            <button type="button" className="egSubmitCard__head" onClick={() => setExpandedGoalKickers((v) => !v)}>
              <div className="egSubmitCard__title">Goal Kickers</div>
              <ChevronDown className={`egSubmitCard__chev ${expandedGoalKickers ? 'isOpen' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expandedGoalKickers ? (
                <motion.div
                  key="kickers"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="egSubmitCard__body"
                >
                  <div className="egSubmitKickerBlock">
                    <div className="egSubmitKickerBlock__title">{homeTeam.name} (Home)</div>
                    <div className="egSubmitSearch">
                      <Search />
                      <input
                        value={homePlayerSearch}
                        onChange={(e) => setHomePlayerSearch(e.target.value)}
                        placeholder="Search / type name…"
                      />
                      <button type="button" onClick={() => homePlayerSearch.trim() && ensureKicker('home', homePlayerSearch.trim())}>
                        Add
                      </button>
                    </div>
                    <div className="egSubmitChips">
                      {homeKickerSuggestions.map((n) => (
                        <button type="button" key={n} onClick={() => ensureKicker('home', n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="egSubmitKickers">
                      {homeGoalKickers.length ? (
                        [...homeGoalKickers]
                          .sort((a, b) => b.goals - a.goals)
                          .map((k) => <KickerRow key={k.id} k={k} side="home" />)
                      ) : (
                        <div className="egSubmitMuted">No home goal kickers yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="egSubmitKickerBlock" style={{ marginTop: 12 }}>
                    <div className="egSubmitKickerBlock__title">{awayTeam.name} (Away)</div>
                    <div className="egSubmitSearch">
                      <Search />
                      <input
                        value={awayPlayerSearch}
                        onChange={(e) => setAwayPlayerSearch(e.target.value)}
                        placeholder="Search / type name…"
                      />
                      <button type="button" onClick={() => awayPlayerSearch.trim() && ensureKicker('away', awayPlayerSearch.trim())}>
                        Add
                      </button>
                    </div>
                    <div className="egSubmitChips">
                      {awayKickerSuggestions.map((n) => (
                        <button type="button" key={n} onClick={() => ensureKicker('away', n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="egSubmitKickers">
                      {awayGoalKickers.length ? (
                        [...awayGoalKickers]
                          .sort((a, b) => b.goals - a.goals)
                          .map((k) => <KickerRow key={k.id} k={k} side="away" />)
                      ) : (
                        <div className="egSubmitMuted">No away goal kickers yet.</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Submit */}
          <div className="egSubmitBottom" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
            <button className="egSubmitBtn" type="button" onClick={submit} disabled={!canSubmit}>
              {isSubmitting ? 'Submitting…' : 'Submit Result'}
            </button>
            <div className="egSubmitMuted" style={{ textAlign: 'center' }}>
              Tip: Upload screenshots → Run OCR → tick confirm → then submit.
            </div>
          </div>
        </div>
      </main>

      {/* Success overlay */}
      <AnimatePresence>
        {submitSuccess ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="egSubmitSuccess">
            <motion.div initial={{ scale: 0.98, y: 12 }} animate={{ scale: 1, y: 0 }} className="egSubmitSuccess__card">
              <div className="egSubmitSuccess__icon">
                <Check />
              </div>
              <div className="egSubmitSuccess__title">Submitted</div>
              <div className="egSubmitSuccess__sub">If the other team submits matching scores, the match will go live automatically.</div>

              <div className="egSubmitSuccess__box">
                <div className="egSubmitSuccess__k">Final score</div>
                <div className="egSubmitSuccess__v">
                  {homeScore} — {awayScore}
                </div>
              </div>

              <button
                type="button"
                className="egSubmitSuccess__btn"
                onClick={() => {
                  setSubmitSuccess(false);
                  window.location.reload();
                }}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
