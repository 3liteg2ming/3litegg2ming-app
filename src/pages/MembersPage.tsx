import { ChevronLeft, Gamepad2, KeyRound, Mail, Shield, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import BadgeGrid from '../components/BadgeGrid';
import BadgeModal from '../components/BadgeModal';
import SmartImg from '../components/SmartImg';
import { afl26LocalRounds } from '../data/afl26LocalRounds';
import { getAfl26RoundsFromSupabase, type AflMatch, type AflRound } from '../data/afl26Supabase';
import { fetchCoachBadges, groupCoachBadgesByCategory, type CoachBadgeModel } from '../lib/badges';
import { getStoredCompetitionKey, getUiCompetition } from '../lib/competitionRegistry';
import { resolveGamerTag } from '../lib/gamerTag';
import { supabase } from '../lib/supabaseClient';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';

import '../styles/members-hub.css';

type TeamRecord = {
  rank: number | null;
  peakRank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  goals: number | null;
  pointsFor: number | null;
  winPct: number | null;
  streak: string | null;
  played: number | null;
};

type RegistrationState = {
  loading: boolean;
  registered: boolean;
  prefCount: number;
  coachPsn: string;
  prefTeamNames: string;
};

type ProfileRow = {
  display_name?: string | null;
  psn?: string | null;
  xbox_gamertag?: string | null;
  email?: string | null;
};

type AuthMetaUser = {
  psn?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null;

function normalize(v: string) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function teamKeyFromMatchSlug(slug: string): TeamKey {
  const compact = normalize(slug);
  const direct = slug?.toLowerCase() as TeamKey;
  if ((TEAM_ASSETS as Record<string, unknown>)[direct]) return direct;

  const aliases: Record<string, TeamKey> = {
    adelaidecrows: 'adelaide',
    brisbanelions: 'brisbane',
    carltonblues: 'carlton',
    collingwoodmagpies: 'collingwood',
    essendonbombers: 'essendon',
    fremantledockers: 'fremantle',
    geelongcats: 'geelong',
    goldcoastsuns: 'goldcoast',
    gwsgiants: 'gws',
    hawthornhawks: 'hawthorn',
    melbournedemons: 'melbourne',
    northmelbournekangaroos: 'northmelbourne',
    portadelaidepower: 'portadelaide',
    richmondtigers: 'richmond',
    stkildasaints: 'stkilda',
    sydneyswans: 'sydney',
    westcoasteagles: 'westcoast',
    westernbulldogs: 'westernbulldogs',
  };

  return aliases[compact] || ('unknown' as TeamKey);
}

function totalOf(score?: { total: number; goals: number; behinds: number }) {
  return Number.isFinite(score?.total as number) ? Number(score!.total) : 0;
}

function computeTeamRecord(rounds: AflRound[], teamKey: TeamKey): TeamRecord {
  const sortedRounds = [...rounds].sort((a, b) => a.round - b.round);
  const ladder = new Map<TeamKey, { played: number; points: number; pf: number; pa: number }>();
  (Object.keys(TEAM_ASSETS) as TeamKey[]).forEach((k) => {
    ladder.set(k, { played: 0, points: 0, pf: 0, pa: 0 });
  });

  const teamResults: Array<{ round: number; result: 'W' | 'L' | 'D'; goals: number; points: number }> = [];
  let peakRank = 18;
  let currentRank = 18;

  const applyFinal = (match: AflMatch) => {
    const homeKey = teamKeyFromMatchSlug(match.home);
    const awayKey = teamKeyFromMatchSlug(match.away);
    const homeRow = ladder.get(homeKey)!;
    const awayRow = ladder.get(awayKey)!;

    const hs = totalOf(match.homeScore);
    const as = totalOf(match.awayScore);
    const hg = Number(match.homeScore?.goals || 0);

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.pf += hs;
    homeRow.pa += as;
    awayRow.pf += as;
    awayRow.pa += hs;

    if (hs > as) homeRow.points += 4;
    else if (as > hs) awayRow.points += 4;
    else {
      homeRow.points += 2;
      awayRow.points += 2;
    }

    if (homeKey === teamKey || awayKey === teamKey) {
      const isHome = homeKey === teamKey;
      const teamPts = isHome ? hs : as;
      const oppPts = isHome ? as : hs;
      const teamGoals = isHome ? hg : Number(match.awayScore?.goals || 0);
      const result: 'W' | 'L' | 'D' = teamPts > oppPts ? 'W' : teamPts < oppPts ? 'L' : 'D';
      teamResults.push({ round: 0, result, goals: teamGoals, points: teamPts });
    }
  };

  for (const round of sortedRounds) {
    for (const match of round.matches || []) {
      if (String(match.status || '').toUpperCase() !== 'FINAL') continue;
      applyFinal(match);
      if (teamResults.length > 0) {
        teamResults[teamResults.length - 1].round = round.round;
      }
    }

    const table = (Object.keys(TEAM_ASSETS) as TeamKey[])
      .map((k) => {
        const row = ladder.get(k)!;
        const pct = row.pa > 0 ? (row.pf / row.pa) * 100 : 0;
        return { key: k, points: row.points, pct };
      })
      .sort((a, b) => (b.points - a.points) || (b.pct - a.pct) || a.key.localeCompare(b.key));

    const idx = table.findIndex((r) => r.key === teamKey);
    if (idx >= 0) {
      currentRank = idx + 1;
      peakRank = Math.min(peakRank, currentRank);
    }
  }

  const wins = teamResults.filter((r) => r.result === 'W').length;
  const losses = teamResults.filter((r) => r.result === 'L').length;
  const draws = teamResults.filter((r) => r.result === 'D').length;
  const played = teamResults.length;
  const goals = teamResults.reduce((sum, r) => sum + r.goals, 0);
  const pointsFor = teamResults.reduce((sum, r) => sum + r.points, 0);
  const winPct = played ? (wins / played) * 100 : 0;

  const streakFromLatest = [...teamResults]
    .sort((a, b) => b.round - a.round)
    .map((r) => r.result);

  let streak = '—';
  if (streakFromLatest.length > 0) {
    const first = streakFromLatest[0];
    let count = 1;
    for (let i = 1; i < streakFromLatest.length; i += 1) {
      if (streakFromLatest[i] !== first) break;
      count += 1;
    }
    streak = `${first}${count}`;
  }

  return {
    rank: Number.isFinite(currentRank) ? currentRank : null,
    peakRank: Number.isFinite(peakRank) ? peakRank : null,
    wins,
    losses,
    draws,
    goals,
    pointsFor,
    winPct,
    streak,
    played,
  };
}

function clampPct(v: number | null) {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
}

function readPrefCount(row: any): number {
  const ids = new Set<string>();

  if (Array.isArray(row?.pref_team_ids)) {
    for (const value of row.pref_team_ids) {
      const id = String(value || '').trim();
      if (id) ids.add(id);
    }
  }

  if (Array.isArray(row?.preferences)) {
    for (const value of row.preferences) {
      const id = String(value || '').trim();
      if (id) ids.add(id);
    }
  } else if (typeof row?.preferences === 'string') {
    try {
      const parsed = JSON.parse(row.preferences);
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          const id = String(value || '').trim();
          if (id) ids.add(id);
        }
      }
    } catch {
      // ignore
    }
  }

  for (const key of ['pref_team_1', 'pref_team_2', 'pref_team_3', 'pref_team_4']) {
    const id = String(row?.[key] || '').trim();
    if (id) ids.add(id);
  }

  return ids.size;
}

function statValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  return String(value);
}

function cleanProfileText(v: unknown): string {
  return String(v ?? '').trim();
}

async function loadProfileForUser(userId: string): Promise<ProfileRow | null> {
  const primaryWithXbox = await supabase
    .from('profiles')
    .select('display_name,psn,xbox_gamertag,email')
    .eq('user_id', userId)
    .maybeSingle();
  const primary =
    primaryWithXbox.error && String(primaryWithXbox.error.message || '').toLowerCase().includes('xbox_gamertag')
      ? await supabase.from('profiles').select('display_name,psn,email').eq('user_id', userId).maybeSingle()
      : primaryWithXbox;

  const fallbackWithXbox = await supabase
    .from('eg_profiles')
    .select('display_name,psn,xbox_gamertag,email')
    .eq('user_id', userId)
    .maybeSingle();
  const fallback =
    fallbackWithXbox.error && String(fallbackWithXbox.error.message || '').toLowerCase().includes('xbox_gamertag')
      ? await supabase.from('eg_profiles').select('display_name,psn,email').eq('user_id', userId).maybeSingle()
      : fallbackWithXbox;

  if (primary.error && fallback.error) {
    console.error('[Members] profile load failed', { profiles: primary.error, egProfiles: fallback.error });
    return null;
  }

  return {
    display_name: cleanProfileText(primary.data?.display_name) || cleanProfileText(fallback.data?.display_name) || null,
    psn: cleanProfileText(primary.data?.psn) || cleanProfileText(fallback.data?.psn) || null,
    xbox_gamertag: cleanProfileText((primary.data as any)?.xbox_gamertag) || cleanProfileText((fallback.data as any)?.xbox_gamertag) || null,
    email: cleanProfileText(primary.data?.email) || cleanProfileText(fallback.data?.email) || null,
  };
}

async function upsertProfileForUser(userId: string, payload: ProfileRow) {
  const writePayload = {
    user_id: userId,
    display_name: payload.display_name ?? null,
    psn: payload.psn ?? null,
    xbox_gamertag: payload.xbox_gamertag ?? null,
    email: payload.email ?? null,
  };

  const profilesRes = await supabase.from('profiles').upsert(writePayload, { onConflict: 'user_id' });
  if (profilesRes.error && String(profilesRes.error.message || '').toLowerCase().includes('xbox_gamertag')) {
    await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          display_name: payload.display_name ?? null,
          psn: payload.psn ?? null,
          email: payload.email ?? null,
        },
        { onConflict: 'user_id' },
      );
  }
  if (profilesRes.error) {
    console.error('[Members] profiles upsert failed', profilesRes.error);
  }

  const egProfilesRes = await supabase.from('eg_profiles').upsert(writePayload, { onConflict: 'user_id' });
  if (egProfilesRes.error && String(egProfilesRes.error.message || '').toLowerCase().includes('xbox_gamertag')) {
    await supabase
      .from('eg_profiles')
      .upsert(
        {
          user_id: userId,
          display_name: payload.display_name ?? null,
          psn: payload.psn ?? null,
          email: payload.email ?? null,
        },
        { onConflict: 'user_id' },
      );
  }
  if (egProfilesRes.error) {
    console.error('[Members] eg_profiles upsert failed', egProfilesRes.error);
  }
}

export default function MembersPage() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();

  const [rounds, setRounds] = useState<AflRound[]>(afl26LocalRounds);
  const [loadingStats, setLoadingStats] = useState(true);
  const [badges, setBadges] = useState<CoachBadgeModel[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<CoachBadgeModel | null>(null);
  const [registration, setRegistration] = useState<RegistrationState>({
    loading: true,
    registered: false,
    prefCount: 0,
    coachPsn: '',
    prefTeamNames: '',
  });
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [authMetaUser, setAuthMetaUser] = useState<AuthMetaUser>(null);
  const [psnDraft, setPsnDraft] = useState('');
  const [savingPsn, setSavingPsn] = useState(false);
  const [psnStatus, setPsnStatus] = useState<string | null>(null);

  const team = useMemo(() => {
    const k = user?.teamKey as TeamKey | undefined;
    return k ? TEAM_ASSETS[k] : null;
  }, [user?.teamKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStats(true);
      try {
        const liveRounds = await getAfl26RoundsFromSupabase();
        if (!cancelled && liveRounds?.length) setRounds(liveRounds);
      } catch {
        if (!cancelled) setRounds(afl26LocalRounds);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setBadges([]);
        setLoadingBadges(false);
        return;
      }
      setLoadingBadges(true);
      try {
        const rows = await fetchCoachBadges(user.id);
        if (!cancelled) setBadges(rows);
      } catch {
        if (!cancelled) setBadges([]);
      } finally {
        if (!cancelled) setLoadingBadges(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!user?.id) {
        if (alive) setRegistration({ loading: false, registered: false, prefCount: 0, coachPsn: '', prefTeamNames: '' });
        return;
      }

      setRegistration((prev) => ({ ...prev, loading: true }));

      const scoped = await supabase
        .from('eg_preseason_registrations_pretty')
        .select('*')
        .eq('user_id', user.id)
        .eq('season_slug', 'preseason')
        .maybeSingle();

      let prettyData: any = scoped.data || null;

      if (scoped.error || !prettyData) {
        const altScoped = await supabase
          .from('eg_preseason_registrations_pretty')
          .select('*')
          .eq('user_id', user.id)
          .eq('season_slug', 'preseason-2026')
          .maybeSingle();
        if (!altScoped.error && altScoped.data) {
          prettyData = altScoped.data;
        }
      }

      if ((scoped.error && String(scoped.error.message || '').toLowerCase().includes('does not exist')) || !prettyData) {
        const userScoped = await supabase
          .from('eg_preseason_registrations_pretty')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!userScoped.error && userScoped.data) {
          prettyData = userScoped.data;
        }
      }

      if (prettyData) {
        if (!alive) return;
        setRegistration({
          loading: false,
          registered: true,
          prefCount: readPrefCount(prettyData),
          coachPsn: text(prettyData?.coach_psn || ''),
          prefTeamNames: text(prettyData?.pref_team_names || ''),
        });
        return;
      }

      const missingPrettyView = String(scoped.error?.message || '').toLowerCase().includes('does not exist');
      if (!missingPrettyView) {
        const missingSeasonSlug = String(scoped.error?.message || '').toLowerCase().includes('season_slug');
        if (!missingSeasonSlug) {
          if (!alive) return;
          setRegistration({ loading: false, registered: false, prefCount: 0, coachPsn: '', prefTeamNames: '' });
          return;
        }

        const scopedBase = await supabase
          .from('eg_preseason_registrations')
          .select('*')
          .eq('user_id', user.id)
          .eq('season_slug', 'preseason')
          .maybeSingle();

        if (!scopedBase.error) {
          if (!alive) return;
          setRegistration({
            loading: false,
            registered: Boolean(scopedBase.data),
            prefCount: scopedBase.data ? readPrefCount(scopedBase.data) : 0,
            coachPsn: text((scopedBase.data as any)?.coach_psn || (scopedBase.data as any)?.psn_name || (scopedBase.data as any)?.psn || ''),
            prefTeamNames: text((scopedBase.data as any)?.pref_team_names || ''),
          });
          return;
        }

        if (!alive) return;
        setRegistration({ loading: false, registered: false, prefCount: 0, coachPsn: '', prefTeamNames: '' });
        return;
      }

      const fallback = await supabase
        .from('eg_preseason_registrations')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!alive) return;
      setRegistration({
        loading: false,
        registered: Boolean(fallback.data),
        prefCount: fallback.data ? readPrefCount(fallback.data) : 0,
        coachPsn: text((fallback.data as any)?.coach_psn || (fallback.data as any)?.psn_name || (fallback.data as any)?.psn || ''),
        prefTeamNames: text((fallback.data as any)?.pref_team_names || ''),
      });
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) {
        if (alive) {
          setProfileRow(null);
          setAuthMetaUser(null);
          setPsnDraft('');
        }
        return;
      }
      const [row, authUserRes] = await Promise.all([loadProfileForUser(user.id), supabase.auth.getUser()]);
      if (!alive) return;
      setProfileRow(row);
      setAuthMetaUser((authUserRes.data?.user as unknown as AuthMetaUser) || null);
      const resolved = resolveGamerTag({
        profile: row,
        user: ((authUserRes.data?.user as unknown as AuthMetaUser) || {
          psn: user.psn,
          user_metadata: { psn: user.psn },
        }) as AuthMetaUser,
      });
      setPsnDraft(resolved.value || '');
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, user?.psn]);

  const displayName =
    cleanProfileText(profileRow?.display_name) || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Coach');
  const resolvedPsn = resolveGamerTag({
    profile: profileRow,
    user: (authMetaUser || { psn: user?.psn, user_metadata: { psn: user?.psn } }) as AuthMetaUser,
  }).value;
  const profilePsn = cleanProfileText(profileRow?.psn);
  const profileXboxTag = cleanProfileText(profileRow?.xbox_gamertag);
  const showMissingTagBanner = Boolean(user?.id) && !profilePsn && !profileXboxTag;
  const resolvedEmail = cleanProfileText(profileRow?.email) || cleanProfileText(user?.email);
  const record = useMemo<TeamRecord>(() => {
    const teamKey = user?.teamKey as TeamKey | undefined;
    if (!teamKey) {
      return {
        rank: null,
        peakRank: null,
        wins: null,
        losses: null,
        draws: null,
        goals: null,
        pointsFor: null,
        winPct: null,
        streak: null,
        played: null,
      };
    }
    return computeTeamRecord(rounds, teamKey);
  }, [rounds, user?.teamKey]);

  const badgeGroups = useMemo(() => groupCoachBadgesByCategory(badges), [badges]);
  const unlockedCount = useMemo(() => badges.filter((b) => b.earned).length, [badges]);

  const teamLogo = team ? assetUrl(team.logoFile ?? '') : assetUrl('elite-gaming-logo.png');
  const heroGradient = team
    ? `linear-gradient(135deg, ${team.colour}5a 0%, rgba(9,11,16,0.9) 56%, rgba(14,26,48,0.94) 100%)`
    : 'linear-gradient(135deg, rgba(245,196,0,0.16) 0%, rgba(9,11,16,0.9) 50%, rgba(14,26,48,0.94) 100%)';

  const currentCompetition = getUiCompetition(getStoredCompetitionKey());
  const seasonChip = currentCompetition.key === 'preseason' ? 'Preseason 2026' : currentCompetition.label;

  const quickStats = [
    { label: 'Current Rank', value: record.rank ? `#${record.rank}` : '—' },
    {
      label: 'W-L',
      value: record.wins === null || record.losses === null ? '—' : `${record.wins}-${record.losses}${record.draws ? `-${record.draws}` : ''}`,
    },
    { label: 'Win %', value: clampPct(record.winPct) === null ? '—' : `${clampPct(record.winPct)!.toFixed(1)}%` },
    { label: 'Streak', value: statValue(record.streak) },
  ];

  async function handleSavePsn() {
    if (!user?.id) return;
    const nextPsn = cleanProfileText(psnDraft);
    if (!nextPsn) {
      setPsnStatus('PSN or Xbox gamertag cannot be empty.');
      return;
    }

    setSavingPsn(true);
    setPsnStatus(null);

    try {
      await upsertProfileForUser(user.id, {
        display_name: cleanProfileText(profileRow?.display_name) || cleanProfileText(user?.displayName) || null,
        email: resolvedEmail || null,
        psn: nextPsn,
        xbox_gamertag: null,
      });

      const authUpdate = await supabase.auth.updateUser({
        data: {
          psn: nextPsn,
          display_name: cleanProfileText(profileRow?.display_name) || cleanProfileText(user?.displayName) || undefined,
        },
      });
      if (authUpdate.error) {
        console.error('[Members] auth user metadata update failed', authUpdate.error);
      }

      const [freshProfile, authUserRes] = await Promise.all([loadProfileForUser(user.id), supabase.auth.getUser()]);
      setProfileRow(freshProfile);
      setAuthMetaUser((authUserRes.data?.user as unknown as AuthMetaUser) || null);
      setPsnDraft(
        resolveGamerTag({
          profile: freshProfile,
          user: ((authUserRes.data?.user as unknown as AuthMetaUser) || {
            psn: user?.psn,
            user_metadata: { psn: user?.psn },
          }) as AuthMetaUser,
        }).value || '',
      );
      setPsnStatus('PSN or Xbox gamertag saved.');
    } catch (err: any) {
      console.error('[Members] PSN save failed', err);
      setPsnStatus('Could not save PSN or Xbox gamertag right now.');
    } finally {
      setSavingPsn(false);
    }
  }

  return (
    <div className="auth-screen auth-screen--premium member-screen">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/')} aria-label="Back to home">
          <ChevronLeft size={18} />
          <span>Home</span>
        </button>
      </div>

      <div className="auth-card auth-card--wide member-card">
        <section className="coachHubHero" style={{ background: heroGradient }}>
          <div className="coachHubHero__left">
            <div className="coachHubHero__logoWrap">
              <SmartImg className="coachHubHero__logo" src={teamLogo} alt={team?.name || 'Team'} fallbackText={team?.shortName || 'EG'} />
            </div>
            <div className="coachHubHero__meta">
              <div className="coachHubHero__kicker">Coach Hub</div>
              <h1 className="coachHubHero__name">{displayName}</h1>
              <p className="coachHubHero__team">{team?.name || 'Unassigned Team'}</p>
              <div className="coachHubHero__sub">
                <span>{resolvedPsn || 'PSN or Xbox gamertag not set'}</span>
                <span>•</span>
                <span>{resolvedEmail || '—'}</span>
              </div>
            </div>
          </div>

          <div className="coachHubHero__chips">
            <span className="coachHubChip">{seasonChip}</span>
            <span className="coachHubChip coachHubChip--muted">{currentCompetition.label}</span>
          </div>
        </section>

        <section className="coachQuickStats" aria-label="Quick stats">
          {quickStats.map((item) => (
            <article className="coachQuickStats__item" key={item.label}>
              <span className="coachQuickStats__label">{item.label}</span>
              <strong className="coachQuickStats__value">{item.value}</strong>
            </article>
          ))}
        </section>

        {showMissingTagBanner ? (
          <section className="memberTagBanner" role="status" aria-live="polite">
            Add PSN or Xbox gamertag to complete your profile.
          </section>
        ) : null}

        <section className="member-panel member-panel--tight">
          <div className="member-panelTitle">
            <Trophy size={16} style={{ opacity: 0.75 }} /> Performance Dashboard
          </div>
          <div className="profileMiniGrid">
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Matches</div>
              <div className="profileMiniCard__value">{statValue(record.played)}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Goals</div>
              <div className="profileMiniCard__value">{statValue(record.goals)}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Points For</div>
              <div className="profileMiniCard__value">{statValue(record.pointsFor)}</div>
            </article>
            <article className="profileMiniCard">
              <div className="profileMiniCard__label">Peak Rank</div>
              <div className="profileMiniCard__value">{record.peakRank ? `#${record.peakRank}` : '—'}</div>
            </article>
          </div>
          {loadingStats ? <div className="profileDashHint">Refreshing latest stats…</div> : null}
        </section>

        <section className="member-panel member-panel--tight">
          <div className="member-panelTitle">
            <Shield size={16} style={{ opacity: 0.75 }} /> Badges
          </div>
          <div className="profileBadgeSummary">
            <span>{unlockedCount}/{badges.length || 0} unlocked</span>
            <span>Tap a badge for details</span>
          </div>
          {loadingBadges ? (
            <div className="badgeGrid__loading">Loading badges…</div>
          ) : badges.length === 0 ? (
            <div className="badgeGrid__empty coachEmptyBadges">
              <div className="coachEmptyBadges__icon">🏅</div>
              <div className="coachEmptyBadges__text">Badges unlock as the season progresses.</div>
            </div>
          ) : (
            <BadgeGrid groups={badgeGroups} onSelect={setSelectedBadge} />
          )}
        </section>

        <section className="member-panel member-panel--tight">
          <div className="member-panelTitle">
            <Mail size={16} style={{ opacity: 0.75 }} /> Account
          </div>

          <div className="member-mini">
            <div className="member-miniRow">
              <Mail size={16} className="member-ico" />
              <div>
                <div className="member-miniLabel">Email</div>
                <div className="member-miniValue">{resolvedEmail || '—'}</div>
              </div>
            </div>

            <div className="member-miniRow">
              <Gamepad2 size={16} className="member-ico" />
              <div>
                <div className="member-miniLabel">PSN or Xbox gamertag</div>
                <div className="member-miniValue">{resolvedPsn || 'Not set'}</div>
              </div>
            </div>

            <div className="member-miniRow member-miniRow--manage" style={{ alignItems: 'flex-start' }}>
              <KeyRound size={16} className="member-ico" style={{ marginTop: 8 }} />
              <div className="member-miniRow__grow" style={{ width: '100%' }}>
                <div className="member-miniLabel">Manage account</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    value={psnDraft}
                    onChange={(e) => setPsnDraft(e.target.value)}
                    placeholder="PSN ID or gamertag"
                    autoCapitalize="none"
                    disabled={savingPsn}
                    style={{
                      width: '100%',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: 'rgba(4, 9, 22, 0.72)',
                      color: '#e8ecf8',
                      padding: '10px 12px',
                      fontSize: 16,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSavePsn}
                    disabled={savingPsn || !cleanProfileText(psnDraft)}
                    className="coachSoonChip"
                    style={{
                      justifySelf: 'start',
                      border: '1px solid rgba(245, 196, 0, 0.38)',
                      background: 'rgba(245, 196, 0, 0.14)',
                      color: '#f5c400',
                      cursor: savingPsn ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingPsn ? 'Saving…' : 'Save Tag'}
                  </button>
                  {psnStatus ? (
                    <div className="member-miniValue" style={{ fontSize: 12, opacity: 0.85 }}>
                      {psnStatus}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="coachActions">
          {!registration.loading && !registration.registered ? (
            <button type="button" className="auth-primary coachActions__primary" onClick={() => nav('/preseason-registration')}>
              Go to Registration
            </button>
          ) : null}

          <button type="button" className="member-signout coachActions__secondary" onClick={() => signOut()} aria-label="Sign out">
            Sign out
          </button>

          {registration.loading ? (
            <div className="coachActions__hint">Checking preseason registration…</div>
          ) : registration.registered ? (
            <div className="coachActions__hint">
              Registered for preseason • {registration.coachPsn || 'PSN or gamertag TBC'} • {registration.prefTeamNames || `${registration.prefCount}/4 preferences set`}
            </div>
          ) : (
            <div className="coachActions__hint">Not registered yet</div>
          )}
        </section>
      </div>

      <BadgeModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </div>
  );
}
