import { supabase } from './supabaseClient';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type CoachBadgeModel = {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  tier: BadgeTier;
  icon?: string;
  earned: boolean;
  earnedAt?: string;
  progress?: string;
};

type BadgeRow = {
  id: string;
  code?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tier?: string | null;
  icon?: string | null;
  is_active?: boolean | null;
};

type UserBadgeRow = {
  badge_id?: string | null;
  earned_at?: string | null;
  progress?: string | null;
};

const CACHE_VERSION = 'coach-badges-v1';
const CACHE_TTL_MS = 3 * 60 * 1000;
const inMemory = new Map<string, { at: number; data: CoachBadgeModel[] }>();

function normalizeTier(v: string | null | undefined): BadgeTier {
  const s = String(v || '').toLowerCase();
  if (s === 'silver') return 'silver';
  if (s === 'gold') return 'gold';
  if (s === 'platinum') return 'platinum';
  return 'bronze';
}

function cacheKey(userId: string) {
  return `eg:${CACHE_VERSION}:badges:${userId}`;
}

function readLs(userId: string): CoachBadgeModel[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: CoachBadgeModel[] };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeLs(userId: string, data: CoachBadgeModel[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore storage failures
  }
}

export function invalidateCoachBadgeCache(userId?: string) {
  if (userId) {
    inMemory.delete(userId);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(cacheKey(userId));
      } catch {
        // ignore
      }
    }
    return;
  }

  inMemory.clear();
  if (typeof window !== 'undefined') {
    try {
      const prefix = `eg:${CACHE_VERSION}:badges:`;
      Object.keys(window.localStorage).forEach((k) => {
        if (k.startsWith(prefix)) window.localStorage.removeItem(k);
      });
    } catch {
      // ignore
    }
  }
}

export function groupCoachBadgesByCategory(badges: CoachBadgeModel[]) {
  const sorted = [...badges].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const tierOrder: Record<BadgeTier, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    return a.title.localeCompare(b.title);
  });

  const groups = new Map<string, CoachBadgeModel[]>();
  for (const badge of sorted) {
    if (!groups.has(badge.category)) groups.set(badge.category, []);
    groups.get(badge.category)!.push(badge);
  }
  return Array.from(groups.entries()).map(([category, rows]) => ({ category, badges: rows }));
}

export async function fetchCoachBadges(userId: string): Promise<CoachBadgeModel[]> {
  const cachedMem = inMemory.get(userId);
  if (cachedMem && Date.now() - cachedMem.at < CACHE_TTL_MS) return cachedMem.data;

  const cachedLs = readLs(userId);
  if (cachedLs) {
    inMemory.set(userId, { at: Date.now(), data: cachedLs });
    return cachedLs;
  }

  const [badgesRes, userRes] = await Promise.all([
    supabase
      .from('eg_badges')
      .select('id,code,title,description,category,tier,icon,is_active')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('eg_user_badges')
      .select('badge_id,earned_at,progress')
      .eq('user_id', userId),
  ]);

  if (badgesRes.error) {
    console.error('[badges] Failed to fetch eg_badges:', badgesRes.error);
    return [];
  }

  if (userRes.error) {
    console.error('[badges] Failed to fetch eg_user_badges:', userRes.error);
  }

  const allBadges = (badgesRes.data || []) as BadgeRow[];
  const earned = new Map<string, UserBadgeRow>();
  for (const row of (userRes.data || []) as UserBadgeRow[]) {
    const id = String(row.badge_id || '');
    if (id) earned.set(id, row);
  }

  const out: CoachBadgeModel[] = allBadges.map((row) => {
    const id = String(row.id || '');
    const userBadge = earned.get(id);
    const hasEarned = Boolean(userBadge);
    return {
      id,
      code: String(row.code || id),
      title: String(row.title || 'Badge'),
      description: String(row.description || 'Badge unlocked through competition progress.'),
      category: String(row.category || 'General'),
      tier: normalizeTier(row.tier),
      icon: row.icon ? String(row.icon) : undefined,
      earned: hasEarned,
      earnedAt: userBadge?.earned_at ? String(userBadge.earned_at) : undefined,
      progress: userBadge?.progress ? String(userBadge.progress) : undefined,
    };
  });

  inMemory.set(userId, { at: Date.now(), data: out });
  writeLs(userId, out);
  return out;
}
