import {
  CalendarClock,
  ChevronRight,
  Flag,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCircle2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getDataSeasonSlugForCompetition,
  getStoredCompetitionKey,
  setStoredCompetitionKey,
  type CompetitionKey,
} from '../lib/competitionRegistry';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useAuth } from '../state/auth/AuthProvider';
import '../styles/home.css';

type FixtureCardRow = {
  id: string;
  round?: number | null;
  status?: string | null;
  start_time?: string | null;
  venue?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
};

type LadderRow = {
  team_name?: string | null;
  points?: number | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
};

type CoachListItem = {
  user_id: string;
  display_name: string;
  psn: string | null;
  team_id: string | null;
  team_name: string | null;
  team_logo_url: string | null;
};

type FeaturedPlayerCard = {
  key: 'goals' | 'disposals';
  label: 'GOALS' | 'DISPOSALS';
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

type LoadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type SectionState<T> = {
  status: LoadStatus;
  data: T;
};

type RegistrationStatus = {
  isOpen: boolean;
  label: 'NOW OPEN' | 'REGISTRATIONS OPEN SOON';
  opensInText: string | null;
  ctaLabel: string;
};

const PRESEASON_START_AT = '2026-03-20T00:00:00+11:00';
const unlockAt = import.meta.env.VITE_REG_UNLOCK_AT ?? '2026-03-05T17:30:00+11:00';
const FIXTURES_DROP_TEXT = 'FRI 20 MAR • 10:00AM';
const CARD_BG = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/mcg.png';
const SECTION_TIMEOUT_MS = 2300;

const FEATURED_TARGETS: Array<{ key: 'goals' | 'disposals'; label: 'GOALS' | 'DISPOSALS'; name: string }> = [
  { key: 'goals', label: 'GOALS', name: 'Jeremy Cameron' },
  { key: 'disposals', label: 'DISPOSALS', name: 'Nick Daicos' },
];

const ANNOUNCEMENT_FALLBACK: AnnouncementRow[] = [
  {
    id: 'fallback-preseason',
    title: 'Preseason registrations open soon',
    body: 'Lock in your top 4 team preferences before fixtures drop.',
  },
  {
    id: 'fallback-season-two',
    title: 'Season Two coming soon',
    body: 'Full Season Two rollout after preseason.',
  },
];

function text(value: unknown): string {
  return String(value || '').trim();
}

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(status: unknown): string {
  return text(status).toUpperCase();
}

function isUpcomingFixture(status: unknown): boolean {
  const s = normalizeStatus(status);
  if (!s) return true;
  return !(s === 'FINAL' || s === 'FULL_TIME' || s === 'FULLTIME' || s === 'COMPLETE' || s === 'COMPLETED');
}

function fixtureSortAsc(a: FixtureCardRow, b: FixtureCardRow): number {
  const aTime = new Date(String(a.start_time || '')).getTime();
  const bTime = new Date(String(b.start_time || '')).getTime();
  const safeATime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
  const safeBTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
  if (safeATime !== safeBTime) return safeATime - safeBTime;
  return toFinite(a.round) - toFinite(b.round);
}

function formatCountdownCompact(ms: number): string {
  if (ms <= 0) return 'PRESEASON LIVE';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(days).padStart(2, '0')}D ${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;
}

function formatFixtureMeta(fixture: FixtureCardRow): string {
  const start = text(fixture.start_time);
  let when = 'Time TBA';
  if (start) {
    const d = new Date(start);
    if (Number.isFinite(d.getTime())) {
      when = new Intl.DateTimeFormat('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(d);
    }
  }

  const venue = text(fixture.venue);
  const round = toFinite(fixture.round);
  const roundText = round > 0 ? `R${round}` : 'Match';
  return `${roundText} • ${when}${venue ? ` • ${venue}` : ''}`;
}

function formatOpensIn(ms: number): string | null {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `Opens in ${minutes}m`;
  return `Opens in ${hours}h ${minutes}m`;
}

function getRegistrationStatus(nowMs: number): RegistrationStatus {
  const openAtMs = new Date(unlockAt).getTime();
  if (!Number.isFinite(openAtMs) || nowMs >= openAtMs) {
    return {
      isOpen: true,
      label: 'NOW OPEN',
      opensInText: null,
      ctaLabel: 'Register now',
    };
  }

  return {
    isOpen: false,
    label: 'REGISTRATIONS OPEN SOON',
    opensInText: formatOpensIn(openAtMs - nowMs),
    ctaLabel: 'Opens 5:30pm',
  };
}

function buildFeaturedFallback(): FeaturedPlayerCard[] {
  return [
    { key: 'goals', label: 'GOALS', name: 'Jeremy Cameron', headshotUrl: null, teamName: 'AFL26', teamLogoUrl: null },
    {
      key: 'disposals',
      label: 'DISPOSALS',
      name: 'Nick Daicos',
      headshotUrl: null,
      teamName: 'AFL26',
      teamLogoUrl: null,
    },
  ];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error('timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function resolveSeasonId(seasonSlug: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const slug = text(seasonSlug).toLowerCase();
  if (!slug) return null;

  const exact = await supabase.from('eg_seasons').select('id').eq('slug', slug).maybeSingle();
  if (!exact.error && exact.data?.id) return String(exact.data.id);

  const fuzzy = await supabase.from('eg_seasons').select('id,slug').ilike('slug', `%${slug}%`).limit(1);
  if (!fuzzy.error && Array.isArray(fuzzy.data) && fuzzy.data[0]?.id) {
    return String(fuzzy.data[0].id);
  }

  return null;
}

async function fetchLadderSnapshot(seasonId: string): Promise<LadderRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const attempts = [
    { table: 'eg_ladder_rows_v2', select: 'team_name,points,percentage' },
    { table: 'eg_ladder_rows', select: 'team_name,points,percentage' },
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(attempt.table)
      .select(attempt.select)
      .eq('season_id', seasonId)
      .order('points', { ascending: false })
      .order('percentage', { ascending: false })
      .limit(5);

    if (error) continue;
    return ((data || []) as LadderRow[]).filter((row) => text(row.team_name));
  }

  return [];
}

async function fetchAnnouncements(seasonSlug: string): Promise<AnnouncementRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const filtered = await supabase
    .from('eg_announcements')
    .select('id,title,body')
    .eq('is_active', true)
    .or(`season_slug.is.null,season_slug.eq.${seasonSlug}`)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!filtered.error && Array.isArray(filtered.data) && filtered.data.length > 0) {
    return (filtered.data as Array<{ id?: string; title?: string; body?: string }>)
      .map((row) => ({
        id: text(row.id),
        title: text(row.title),
        body: text(row.body),
      }))
      .filter((row) => row.id && row.title);
  }

  const fallback = await supabase
    .from('eg_announcements')
    .select('id,title,body')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0) {
    return (fallback.data as Array<{ id?: string; title?: string; body?: string }>)
      .map((row) => ({
        id: text(row.id),
        title: text(row.title),
        body: text(row.body),
      }))
      .filter((row) => row.id && row.title);
  }

  return [];
}

async function fetchMyTeamId(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const primary = await supabase.from('profiles').select('team_id').eq('user_id', userId).maybeSingle();
  if (import.meta.env.DEV) {
    console.log('[Home][MyTeam] profiles row', primary.data || null);
  }
  if (!primary.error && primary.data?.team_id) return text(primary.data.team_id);

  const fallback = await supabase.from('eg_profiles').select('team_id').eq('user_id', userId).maybeSingle();
  if (import.meta.env.DEV) {
    console.log('[Home][MyTeam] eg_profiles fallback row', fallback.data || null);
  }
  if (!fallback.error && fallback.data?.team_id) return text(fallback.data.team_id);

  return null;
}

async function fetchMyNextMatch(seasonId: string, teamId: string): Promise<FixtureCardRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !seasonId || !teamId) return null;

  const attempts: Array<{ table: string; select: string }> = [
    {
      table: 'eg_fixture_cards',
      select: 'id,round,status,start_time,venue,home_team_name,away_team_name,home_team_id,away_team_id',
    },
    {
      table: 'eg_fixtures',
      select: 'id,round,status,start_time,venue,home_team_id,away_team_id',
    },
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(attempt.table)
      .select(attempt.select)
      .eq('season_id', seasonId)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order('start_time', { ascending: true })
      .limit(8);

    if (error) continue;

    const rows = ((data || []) as unknown as FixtureCardRow[])
      .filter((row) => isUpcomingFixture(row.status))
      .sort(fixtureSortAsc)
      .filter((row) => text(row.home_team_name) && text(row.away_team_name));

    if (rows.length > 0) {
      return {
        ...rows[0],
        home_team_name: text(rows[0].home_team_name),
        away_team_name: text(rows[0].away_team_name),
      };
    }
  }

  return null;
}

async function fetchCurrentCoaches(): Promise<CoachListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const profilesRes = await supabase
    .from('profiles')
    .select('user_id,display_name,psn,email,team_id')
    .not('team_id', 'is', null)
    .limit(200);

  if (profilesRes.error || !Array.isArray(profilesRes.data)) {
    return [];
  }

  if (import.meta.env.DEV) {
    console.log('[Home][Coaches] profiles rows', profilesRes.data);
  }

  const profiles = (profilesRes.data as Array<{ user_id?: string; display_name?: string; psn?: string; email?: string; team_id?: string }>)
    .map((row) => {
      const email = text(row.email);
      const emailPrefix = email.includes('@') ? email.split('@')[0] : '';
      const displayName = text(row.display_name) || text(row.psn) || emailPrefix || 'Coach';
      return {
        user_id: text(row.user_id),
        display_name: displayName,
        psn: text(row.psn) || null,
        team_id: text(row.team_id) || null,
      };
    })
    .filter((row) => row.user_id && row.team_id);

  const teamIds = Array.from(new Set(profiles.map((p) => p.team_id).filter(Boolean))) as string[];
  const teamMap = new Map<string, { name: string; logo_url: string | null }>();

  if (teamIds.length) {
    const teamsRes = await supabase.from('eg_teams').select('id,name,logo_url').in('id', teamIds);
    if (!teamsRes.error && Array.isArray(teamsRes.data)) {
      if (import.meta.env.DEV) {
        console.log('[Home][Coaches] eg_teams rows', teamsRes.data);
      }
      for (const team of teamsRes.data as Array<{ id?: string; name?: string; logo_url?: string }>) {
        const id = text(team.id);
        if (!id) continue;
        teamMap.set(id, {
          name: text(team.name) || 'Team assigned',
          logo_url: text(team.logo_url) || null,
        });
      }
    }
  }

  const merged = profiles
    .map((profile) => {
      const team = profile.team_id ? teamMap.get(profile.team_id) : null;
      return {
        user_id: profile.user_id,
        display_name: profile.display_name,
        psn: profile.psn,
        team_id: profile.team_id,
        team_name: team?.name ?? 'Team assigned',
        team_logo_url: team?.logo_url ?? null,
      };
    })
    .sort((a, b) => {
      const teamCmp = text(a.team_name).localeCompare(text(b.team_name));
      if (teamCmp !== 0) return teamCmp;
      return text(a.display_name).localeCompare(text(b.display_name));
    });

  if (import.meta.env.DEV) {
    console.log('[Home][Coaches] merged rows', merged);
  }

  return merged;
}

async function fetchFeaturedPlayers(): Promise<FeaturedPlayerCard[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return buildFeaturedFallback();

  // IMPORTANT: Do NOT rely on a nested join that may not exist in schema cache.
  // Pull headshot_url directly from eg_players first, then fetch team logo separately if possible.
  const raw = await Promise.all(
    FEATURED_TARGETS.map(async (target) => {
      const pattern = `%${target.name.replace(/\s+/g, '%')}%`;
      const { data, error } = await supabase.from('eg_players').select('name,headshot_url,team_id').ilike('name', pattern).limit(1);

      if (error || !Array.isArray(data) || !data[0]) {
        return {
          key: target.key,
          label: target.label,
          name: target.name,
          headshotUrl: null,
          teamId: null as string | null,
        };
      }

      return {
        key: target.key,
        label: target.label,
        name: text((data[0] as any).name) || target.name,
        headshotUrl: text((data[0] as any).headshot_url) || null,
        teamId: text((data[0] as any).team_id) || null,
      };
    }),
  );

  const teamIds = Array.from(new Set(raw.map((r) => r.teamId).filter(Boolean))) as string[];
  const teamMap = new Map<string, { name: string; logo_url: string | null }>();

  if (teamIds.length) {
    const teamsRes = await supabase.from('eg_teams').select('id,name,logo_url').in('id', teamIds);
    if (!teamsRes.error && Array.isArray(teamsRes.data)) {
      for (const team of teamsRes.data as Array<{ id?: string; name?: string; logo_url?: string }>) {
        const id = text(team.id);
        if (!id) continue;
        teamMap.set(id, {
          name: text(team.name) || 'AFL26',
          logo_url: text(team.logo_url) || null,
        });
      }
    }
  }

  const cards: FeaturedPlayerCard[] = raw.map((r) => {
    const team = r.teamId ? teamMap.get(r.teamId) : null;
    return {
      key: r.key,
      label: r.label,
      name: r.name,
      headshotUrl: r.headshotUrl,
      teamName: team?.name ?? 'AFL26',
      teamLogoUrl: team?.logo_url ?? null,
    };
  });

  return cards.length ? cards : buildFeaturedFallback();
}

async function fetchHasCompletedFixture(seasonId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !seasonId) return false;

  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('id')
    .eq('season_id', seasonId)
    .in('status', ['FINAL', 'COMPLETED', 'FULL_TIME', 'FULLTIME', 'COMPLETE'])
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

function HomeSectionHeader({ icon, title, actionText }: { icon: ReactNode; title: string; actionText?: string }) {
  return (
    <header className="homeSectionHead">
      <div className="homeSectionHead__left">
        <span className="homeSectionHead__icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </div>
      {actionText ? (
        <button type="button" className="homeSectionHead__action" disabled>
          {actionText} <ChevronRight size={13} />
        </button>
      ) : null}
    </header>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [competitionKey, setCompetitionKey] = useState<CompetitionKey>(() => getStoredCompetitionKey());
  const [countdownCompact, setCountdownCompact] = useState(() => {
    const remaining = new Date(PRESEASON_START_AT).getTime() - Date.now();
    return formatCountdownCompact(remaining);
  });

  const [seasonState, setSeasonState] = useState<{ status: LoadStatus; seasonId: string | null; seasonSlug: string }>({
    status: 'idle',
    seasonId: null,
    seasonSlug: getDataSeasonSlugForCompetition(getStoredCompetitionKey()),
  });

  const [nextMatchState, setNextMatchState] = useState<SectionState<FixtureCardRow | null>>({
    status: 'idle',
    data: null,
  });
  const [ladderState, setLadderState] = useState<SectionState<LadderRow[]>>({
    status: 'idle',
    data: [],
  });
  const [featuredState, setFeaturedState] = useState<SectionState<FeaturedPlayerCard[]>>({
    status: 'loading',
    data: buildFeaturedFallback(),
  });
  const [announcementsState, setAnnouncementsState] = useState<SectionState<AnnouncementRow[]>>({
    status: 'idle',
    data: [],
  });

  const [coachesOpen, setCoachesOpen] = useState(false);
  const [coachesState, setCoachesState] = useState<SectionState<CoachListItem[]>>({ status: 'idle', data: [] });

  const [hasCompletedFixture, setHasCompletedFixture] = useState(false);

  const ctaTarget = user ? '/preseason-registration' : '/auth/sign-in';
  const signedAs = useMemo(
    () => text(user?.displayName) || text(user?.email).split('@')[0] || 'Coach',
    [user?.displayName, user?.email],
  );

  const regStatus = useMemo(() => getRegistrationStatus(Date.now()), [countdownCompact]);

  const preseasonByDateActive = Date.now() >= new Date(PRESEASON_START_AT).getTime();
  const showLadder = competitionKey !== 'preseason' || preseasonByDateActive || hasCompletedFixture;

  useEffect(() => {
    const syncCompetition = () => setCompetitionKey(getStoredCompetitionKey());
    syncCompetition();

    window.addEventListener('focus', syncCompetition);
    window.addEventListener('storage', syncCompetition);

    return () => {
      window.removeEventListener('focus', syncCompetition);
      window.removeEventListener('storage', syncCompetition);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(PRESEASON_START_AT).getTime() - Date.now();
      setCountdownCompact(formatCountdownCompact(remaining));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);

    setSeasonState({ status: 'loading', seasonId: null, seasonSlug });

    withTimeout(resolveSeasonId(seasonSlug), SECTION_TIMEOUT_MS)
      .then((seasonId) => {
        if (!alive) return;
        if (!seasonId) {
          setSeasonState({
            status: 'empty',
            seasonId: null,
            seasonSlug,
          });
          return;
        }
        setSeasonState({ status: 'ready', seasonId, seasonSlug });
      })
      .catch((error: unknown) => {
        console.log('[Home] season resolve error', {
          error,
          competitionKey,
          seasonSlug,
        });
        if (!alive) return;
        setSeasonState({
          status: 'error',
          seasonId: null,
          seasonSlug,
        });
      });

    return () => {
      alive = false;
    };
  }, [competitionKey]);

  useEffect(() => {
    let alive = true;

    withTimeout(fetchFeaturedPlayers(), SECTION_TIMEOUT_MS)
      .then((rows) => {
        if (!alive) return;
        setFeaturedState({ status: 'ready', data: rows.length ? rows : buildFeaturedFallback() });
      })
      .catch((error: unknown) => {
        console.log('[Home] featured players load error', { error });
        if (!alive) return;
        setFeaturedState({ status: 'empty', data: buildFeaturedFallback() });
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    if (seasonState.status !== 'ready' || !seasonState.seasonId) {
      setHasCompletedFixture(false);
      return () => {
        alive = false;
      };
    }

    withTimeout(fetchHasCompletedFixture(seasonState.seasonId), SECTION_TIMEOUT_MS)
      .then((exists) => {
        if (!alive) return;
        setHasCompletedFixture(Boolean(exists));
      })
      .catch((error: unknown) => {
        console.log('[Home] season activity check error', {
          error,
          competitionKey,
          seasonId: seasonState.seasonId,
        });
        if (!alive) return;
        setHasCompletedFixture(false);
      });

    return () => {
      alive = false;
    };
  }, [competitionKey, seasonState.status, seasonState.seasonId]);

  useEffect(() => {
    let alive = true;

    if (!user?.id) {
      setNextMatchState({ status: 'idle', data: null });
      return () => {
        alive = false;
      };
    }

    if (seasonState.status !== 'ready' || !seasonState.seasonId) {
      setNextMatchState({ status: 'empty', data: null });
      return () => {
        alive = false;
      };
    }

    setNextMatchState({ status: 'loading', data: null });

    (async () => {
      try {
        const teamId = await withTimeout(fetchMyTeamId(user.id), SECTION_TIMEOUT_MS);
        if (!alive) return;

        if (!teamId) {
          setNextMatchState({ status: 'empty', data: null });
          return;
        }

        const fixture = await withTimeout(fetchMyNextMatch(seasonState.seasonId || '', teamId), SECTION_TIMEOUT_MS);
        if (!alive) return;

        if (!fixture) {
          setNextMatchState({ status: 'empty', data: null });
          return;
        }

        setNextMatchState({ status: 'ready', data: fixture });
      } catch (error: unknown) {
        console.log('[Home] next match load error', {
          error,
          competitionKey,
          seasonId: seasonState.seasonId,
          userId: user.id,
        });
        if (!alive) return;
        setNextMatchState({ status: 'empty', data: null });
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, seasonState.status, seasonState.seasonId, competitionKey]);

  useEffect(() => {
    let alive = true;

    if (seasonState.status !== 'ready' || !seasonState.seasonId || !showLadder) {
      setLadderState({ status: 'idle', data: [] });
      return () => {
        alive = false;
      };
    }

    setLadderState({ status: 'loading', data: [] });

    withTimeout(fetchLadderSnapshot(seasonState.seasonId), SECTION_TIMEOUT_MS)
      .then((rows) => {
        if (!alive) return;
        if (!rows.length) {
          setLadderState({ status: 'empty', data: [] });
        } else {
          setLadderState({ status: 'ready', data: rows });
        }
      })
      .catch((error: unknown) => {
        console.log('[Home] ladder load error', {
          error,
          competitionKey,
          seasonId: seasonState.seasonId,
        });
        if (!alive) return;
        setLadderState({ status: 'empty', data: [] });
      });

    return () => {
      alive = false;
    };
  }, [seasonState.status, seasonState.seasonId, showLadder, competitionKey]);

  useEffect(() => {
    let alive = true;

    if (seasonState.status !== 'ready') {
      setAnnouncementsState({ status: 'loading', data: ANNOUNCEMENT_FALLBACK });
      return () => {
        alive = false;
      };
    }

    setAnnouncementsState({ status: 'loading', data: ANNOUNCEMENT_FALLBACK });

    withTimeout(fetchAnnouncements(seasonState.seasonSlug), SECTION_TIMEOUT_MS)
      .then((rows) => {
        if (!alive) return;
        if (!rows.length) {
          setAnnouncementsState({ status: 'empty', data: ANNOUNCEMENT_FALLBACK });
        } else {
          setAnnouncementsState({ status: 'ready', data: rows });
        }
      })
      .catch((error: unknown) => {
        console.log('[Home] announcements load error', {
          error,
          competitionKey,
          seasonSlug: seasonState.seasonSlug,
        });
        if (!alive) return;
        setAnnouncementsState({ status: 'empty', data: ANNOUNCEMENT_FALLBACK });
      });

    return () => {
      alive = false;
    };
  }, [seasonState.status, seasonState.seasonSlug, competitionKey]);

  useEffect(() => {
    let alive = true;

    if (!coachesOpen) {
      return () => {
        alive = false;
      };
    }

    setCoachesState({ status: 'loading', data: [] });

    withTimeout(fetchCurrentCoaches(), SECTION_TIMEOUT_MS)
      .then((rows) => {
        if (!alive) return;
        setCoachesState({ status: rows.length ? 'ready' : 'empty', data: rows });
      })
      .catch(() => {
        if (!alive) return;
        setCoachesState({ status: 'error', data: [] });
      });

    return () => {
      alive = false;
    };
  }, [coachesOpen]);

  useEffect(() => {
    if (!coachesOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCoachesOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [coachesOpen]);

  function selectCompetition(next: CompetitionKey) {
    const stored = setStoredCompetitionKey(next);
    setCompetitionKey(stored);
  }

  return (
    <div className="homePage">
      <div className="homeShell">
        <div className="homeDashLabel">LEAGUE DASHBOARD</div>
        <div className="homeSignedInTag" aria-live="polite">
          Signed in as {signedAs}
        </div>

        <section className="homeSeasonRow" aria-label="Season selection">
          <button
            type="button"
            className={`homeSeasonCard homeSeasonCard--tile homeSeasonCard--preseason ${competitionKey === 'preseason' ? 'is-active' : ''}`}
            style={{ backgroundImage: `url('${CARD_BG}')` }}
            onClick={() => selectCompetition('preseason')}
          >
            <span className={`homeSeasonCard__status ${regStatus.isOpen ? 'is-open' : 'is-soon'}`}>{regStatus.label}</span>
            <span className="homeSeasonCard__title">AFL26 Pre-Season Knockout</span>
            <span className="homeSeasonCard__endTag">
              <ChevronRight size={14} />
            </span>
          </button>

          <button
            type="button"
            className={`homeSeasonCard homeSeasonCard--tile homeSeasonCard--seasonTwo ${competitionKey === 'afl26' ? 'is-active' : ''}`}
            style={{ backgroundImage: `url('${CARD_BG}')` }}
            onClick={() => selectCompetition('afl26')}
          >
            <span className="homeSeasonCard__status is-soon">COMING SOON</span>
            <span className="homeSeasonCard__title">AFL26 Season Two</span>
            <span className="homeSeasonCard__endTag">
              <ChevronRight size={14} />
            </span>
          </button>
        </section>

        <section className="homeEventBar" aria-label="Season timing">
          <div className="homeEventBar__left">
            <span className="homeEventBar__label">
              <CalendarClock size={14} /> PRESEASON STARTS
            </span>
            <strong className="homeEventBar__value">{countdownCompact}</strong>
          </div>
          <div className="homeEventBar__right">
            <span className="homeEventBar__label">
              <Sparkles size={14} /> FIXTURES DROP
            </span>
            <strong className="homeEventBar__value">{FIXTURES_DROP_TEXT}</strong>
          </div>
        </section>

        <section className="homeRegAction" aria-label="Registration action">
          <div className="homeRegAction__head">
            <span className="homeRegAction__chip">
              <Zap size={14} /> PRE-SEASON REGISTRATIONS
            </span>
            <span className="homeRegAction__status">{regStatus.label}</span>
          </div>
          <p className="homeRegAction__subtitle">Lock in your top 4 team preferences.</p>
          {regStatus.opensInText ? <p className="homeRegAction__meta">{regStatus.opensInText}</p> : null}
          <div className="homeRegAction__ctaRow">
            <button type="button" className="homeRegAction__cta" onClick={() => navigate(ctaTarget)}>
              {regStatus.ctaLabel}
            </button>
            <button type="button" className="homeRegAction__ctaSecondary" onClick={() => setCoachesOpen(true)}>
              View current coaches
            </button>
          </div>
        </section>

        {user ? (
          <section className="homeCard" aria-label="My next match">
            <HomeSectionHeader icon={<Flag size={15} />} title="My Next Match" actionText="Schedule" />
            {nextMatchState.status === 'loading' ? (
              <div className="homeSkeleton homeSkeleton--line" />
            ) : nextMatchState.status === 'ready' && nextMatchState.data ? (
              <div className="homeMiniFixture">
                <div className="homeMiniFixture__teams">
                  <strong>{text(nextMatchState.data.home_team_name)}</strong>
                  <span>vs</span>
                  <strong>{text(nextMatchState.data.away_team_name)}</strong>
                </div>
                <div className="homeMiniFixture__meta">{formatFixtureMeta(nextMatchState.data)}</div>
              </div>
            ) : (
              <div className="homePendingState">
                <p className="homePendingState__title">Teams are being assigned</p>
                <p className="homePendingState__sub">Your match will appear once fixtures are released.</p>
              </div>
            )}
          </section>
        ) : null}

        <section className="homeCard" aria-label="Featured players">
          <HomeSectionHeader icon={<ShieldCheck size={15} />} title="Featured Players" actionText="View all" />

          {featuredState.status === 'loading' ? (
            <div className="homeLeadersCarousel" role="region" aria-label="Featured players loading">
              <article className="homeLeaderCard homeLeaderCard--skeleton" aria-hidden="true">
                <div className="homeSkeleton homeSkeleton--line" />
              </article>
              <article className="homeLeaderCard homeLeaderCard--skeleton" aria-hidden="true">
                <div className="homeSkeleton homeSkeleton--line" />
              </article>
            </div>
          ) : (
            <div className="homeLeadersCarousel" role="region" aria-label="Featured players carousel">
              {featuredState.data.map((card) => (
                <article key={card.key} className="homeLeaderCard">
                  <div className="homeLeaderCard__head">
                    <span className="homeLeaderCard__label">{card.label}</span>
                  </div>
                  <div className="homeLeaderCard__body">
                    {card.headshotUrl ? (
                      <img className="homeLeaderCard__photo" src={card.headshotUrl} alt={card.name} loading="lazy" />
                    ) : (
                      <div className="homeLeaderCard__placeholder" aria-hidden="true">
                        <UserCircle2 size={22} />
                      </div>
                    )}
                    <div className="homeLeaderCard__meta">
                      <div className="homeLeaderCard__name">{card.name}</div>
                      <div className="homeLeaderCard__footer">
                        <div className="homeLeaderCard__value">Featured</div>
                        {card.teamLogoUrl ? (
                          <img
                            className="homeLeaderCard__teamLogo"
                            src={card.teamLogoUrl}
                            alt={card.teamName || 'Team logo'}
                            loading="lazy"
                          />
                        ) : (
                          <span className="homeLeaderCard__teamPill">{card.teamName || 'AFL26'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {showLadder ? (
          <section className="homeCard" aria-label="Ladder snapshot">
            <HomeSectionHeader icon={<Trophy size={15} />} title="Ladder Snapshot" actionText="View table" />
            {ladderState.status === 'loading' ? (
              <div className="homeSkeleton homeSkeleton--table" />
            ) : ladderState.status === 'ready' ? (
              <div className="homeTable">
                {ladderState.data.slice(0, 5).map((row, index) => (
                  <div key={`${text(row.team_name)}-${index}`} className="homeTable__row">
                    <span className="homeTable__rank">#{index + 1}</span>
                    <span className="homeTable__team">{text(row.team_name) || 'Team'}</span>
                    <span className="homeTable__stat">Pts {toFinite(row.points)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="homeCard" aria-label="Announcements">
          <HomeSectionHeader icon={<Megaphone size={15} />} title="Announcements" />
          <div className="homeAnnouncements">
            {announcementsState.data.map((item) => (
              <article key={item.id} className="homeAnnouncementItem">
                <h3>{item.title}</h3>
                {item.body ? <p>{item.body}</p> : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      {coachesOpen ? (
        <div className="homeModal" role="dialog" aria-modal="true" aria-label="Current coaches">
          <button
            type="button"
            className="homeModal__backdrop"
            onClick={() => setCoachesOpen(false)}
            aria-label="Close"
          />
          <div className="homeModal__panel">
            <div className="homeModal__head">
              <div className="homeModal__title">Current Coaches</div>
              <button type="button" className="homeModal__close" onClick={() => setCoachesOpen(false)}>
                Close
              </button>
            </div>

            <div className="homeModal__body">
              {coachesState.status === 'loading' ? (
                <div className="homeModal__loading">Loading coaches…</div>
              ) : coachesState.data.length ? (
                <div className="homeModal__list">
                  {coachesState.data.map((row) => (
                    <div key={row.user_id} className="homeCoachRow">
                      <div className="homeCoachRow__team">
                        {row.team_logo_url ? (
                          <img
                            className="homeCoachRow__logo"
                            src={row.team_logo_url}
                            alt={row.team_name || 'Team assigned'}
                            loading="lazy"
                          />
                        ) : (
                          <div className="homeCoachRow__logoPlaceholder" aria-hidden="true" />
                        )}
                        <div className="homeCoachRow__teamName">{row.team_name || 'Team assigned'}</div>
                      </div>
                      <div className="homeCoachRow__coach">
                        <div className="homeCoachRow__coachName">{row.display_name}</div>
                        {row.psn ? <div className="homeCoachRow__coachMeta">PSN: {row.psn}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="homeModal__empty">No coaches assigned yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
