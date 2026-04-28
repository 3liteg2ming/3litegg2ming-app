import type { QueryClient, QueryKey } from '@tanstack/react-query';

// Persist a whitelist of public-page queries to localStorage so the app can
// render the previous response instantly on the next visit, while the live
// network request runs in the background and updates the UI when ready.

const STORAGE_KEY = 'eg-rq-cache-v2';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SAVE_DEBOUNCE_MS = 750;

const PERSIST_KEY_PREFIXES = new Set([
  'fixtures',
  'fixture',
  'eg_ladder',
  'home',
  'teams',
  'coaches',
  'melvin-odds',
  'prem-odds',
  'match-centre',
]);

type PersistedQuery = {
  queryKey: QueryKey;
  state: {
    data: unknown;
    dataUpdatedAt: number;
  };
};

type PersistedPayload = {
  v: number;
  at: number;
  queries: PersistedQuery[];
};

function shouldPersist(queryKey: QueryKey): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const head = queryKey[0];
  if (typeof head !== 'string') return false;
  return PERSIST_KEY_PREFIXES.has(head);
}

function safeGetStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hydrateQueryClient(client: QueryClient): void {
  const storage = safeGetStorage();
  if (!storage) return;

  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: PersistedPayload | null = null;
  try {
    parsed = JSON.parse(raw) as PersistedPayload;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.queries)) return;
  if (Date.now() - Number(parsed.at || 0) > MAX_AGE_MS) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  for (const entry of parsed.queries) {
    if (!entry || !shouldPersist(entry.queryKey)) continue;
    if (entry.state?.data === undefined) continue;
    try {
      client.setQueryData(entry.queryKey, entry.state.data, {
        updatedAt: Number(entry.state.dataUpdatedAt || Date.now()),
      });
    } catch {
      /* ignore individual restore errors */
    }
  }
}

export function attachQueryPersister(client: QueryClient): () => void {
  const storage = safeGetStorage();
  if (!storage) return () => {};

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timeoutId = null;
    try {
      const queries: PersistedQuery[] = [];
      for (const query of client.getQueryCache().getAll()) {
        if (!shouldPersist(query.queryKey)) continue;
        if (query.state.status !== 'success') continue;
        if (query.state.data === undefined) continue;
        queries.push({
          queryKey: query.queryKey,
          state: {
            data: query.state.data,
            dataUpdatedAt: query.state.dataUpdatedAt,
          },
        });
      }

      const payload: PersistedPayload = { v: 2, at: Date.now(), queries };
      storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota exceeded or serialisation failure — clear the slot so we don't
      // keep retrying with the same payload.
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  const schedule = () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  const unsubscribe = client.getQueryCache().subscribe(() => {
    schedule();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  return () => {
    unsubscribe();
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    }
  };
}

export function prefetchPublicPageData(client: QueryClient): void {
  const seasonSlug = 'afl26-season-two';

  const safePrefetch = async (
    queryKey: QueryKey,
    queryFn: () => Promise<unknown>,
    staleTime = 5 * 60_000,
  ) => {
    try {
      await client.prefetchQuery({ queryKey, queryFn, staleTime });
    } catch {
      // Prefetch failures must never crash the app; the actual page query
      // will surface the error normally if it persists.
    }
  };

  // Fire all of these in parallel so the homepage / fixtures / ladder / teams
  // pages have their data warm before the user navigates to them.
  void (async () => {
    const [{ fetchSeasonFixtures }, { fetchLadderRows }, { fetchTeamOptions }, homeRepo, { fetchMelvinOdds }, { fetchPremOdds }] = await Promise.all([
      import('./fixturesRepo'),
      import('./ladderRepo'),
      import('./teamsRepo'),
      import('./homeRepo'),
      import('./melvinOddsRepo'),
      import('./premOddsRepo'),
    ]);

    await Promise.all([
      safePrefetch(
        ['fixtures', 'season', seasonSlug, 1000, 0],
        async () => {
          const result = await fetchSeasonFixtures(seasonSlug, { limit: 1000, offset: 0 });
          return {
            requestedSeasonSlug: seasonSlug,
            canonicalSeasonSlug: seasonSlug,
            resolvedSeasonId: result.season.id,
            resolvedSeasonSlug: result.season.slug,
            fixtures: result.fixtures,
          };
        },
      ),
      safePrefetch(['eg_ladder', seasonSlug], () => fetchLadderRows(seasonSlug)),
      safePrefetch(['teams', 'options'], () => fetchTeamOptions()),
      safePrefetch(['home', 'current-coaches'], () => homeRepo.fetchCurrentCoaches()),
      safePrefetch(['home', 'news', 2], () => homeRepo.fetchHomepageNews(2)),
      safePrefetch(['melvin-odds'], () => fetchMelvinOdds()),
      safePrefetch(['prem-odds'], () => fetchPremOdds()),
    ]);
  })();
}
