import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  listContentBlocks,
  upsertContentBlock,
} from '@/lib/adminApi';
import { fetchSeasonFixturesBySeasonId } from '@/lib/fixturesRepo';
import { resolveSeasonId } from '@/lib/seasonResolver';
import { resolveTeamKey } from '@/lib/entityResolvers';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import { invalidateMelvinOddsCache } from '@/lib/melvinOddsRepo';
import { invalidatePremOddsCache } from '@/lib/premOddsRepo';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { useAdminLayoutContext } from '../AdminLayout';
import { AdminCard, EmptyState } from './AdminUi';

/* ── Fixture Odds ─────────────────────────────────────── */
const FIXTURE_ODDS_KEY = 'melvin_bet_odds';

type OddsEntry = { home: number; away: number };
type OddsMap = Record<string, OddsEntry>;

type FixtureInfo = {
  id: string;
  round: number;
  homeName: string;
  awayName: string;
  homeOdds: number;
  awayOdds: number;
};

/* ── Premiership Odds ─────────────────────────────────── */
const PREM_ODDS_KEY = 'melvin_prem_odds';

type PremTeamRow = {
  key: TeamKey;
  name: string;
  odds: number;
};

const ALL_TEAMS: { key: TeamKey; name: string }[] = (
  Object.entries(TEAM_ASSETS) as Array<[TeamKey, { name: string }]>
).map(([key, val]) => ({ key, name: val.name })).sort((a, b) => a.name.localeCompare(b.name));

const supabase = requireSupabaseClient();

export default function AdminOdds() {
  const queryClient = useQueryClient();
  const { pushToast } = useAdminLayoutContext();

  /* ════════ FIXTURE ODDS STATE ════════ */
  const [fixtures, setFixtures] = useState<FixtureInfo[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);

  const contentQuery = useQuery({
    queryKey: ['admin', 'content', FIXTURE_ODDS_KEY],
    queryFn: async () => {
      const blocks = await listContentBlocks(FIXTURE_ODDS_KEY);
      return blocks.find((b) => b.key === FIXTURE_ODDS_KEY) || null;
    },
    refetchInterval: 30_000,
  });

  const savedOdds = useMemo<OddsMap>(() => {
    const raw = contentQuery.data?.payload?.odds;
    if (!raw || typeof raw !== 'object') return {};
    const map: OddsMap = {};
    for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
      const v = val as Record<string, unknown>;
      if (v && typeof v.home === 'number' && typeof v.away === 'number') {
        map[id] = { home: v.home, away: v.away };
      }
    }
    return map;
  }, [contentQuery.data]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const slug = 'afl26';
        const seasonId = await resolveSeasonId(supabase, slug);
        if (!seasonId || !alive) return;
        const { fixtures: rows } = await fetchSeasonFixturesBySeasonId(seasonId, { limit: 200, offset: 0 });
        if (!alive) return;

        const mapped = rows
          .filter((f) => f.home_team_id && f.away_team_id && f.status === 'SCHEDULED')
          .sort((a, b) => (a.round || 0) - (b.round || 0))
          .map((f) => {
            const hk = resolveTeamKey({ slug: f.home_team_slug, name: f.home_team_name });
            const ak = resolveTeamKey({ slug: f.away_team_slug, name: f.away_team_name });
            return {
              id: f.id,
              round: f.round || 0,
              homeName: TEAM_ASSETS[hk as keyof typeof TEAM_ASSETS]?.name || f.home_team_name || hk,
              awayName: TEAM_ASSETS[ak as keyof typeof TEAM_ASSETS]?.name || f.away_team_name || ak,
              homeOdds: 1.85,
              awayOdds: 1.95,
            };
          });
        setFixtures(mapped);
      } catch (err) {
        console.error('Failed to load fixtures for odds', err);
      } finally {
        if (alive) setLoadingFixtures(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!Object.keys(savedOdds).length) return;
    setFixtures((prev) =>
      prev.map((f) => ({
        ...f,
        homeOdds: savedOdds[f.id]?.home ?? f.homeOdds,
        awayOdds: savedOdds[f.id]?.away ?? f.awayOdds,
      })),
    );
  }, [savedOdds]);

  const updateOdds = (id: string, side: 'home' | 'away', value: string) => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 1) return;
    setFixtures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [side === 'home' ? 'homeOdds' : 'awayOdds']: Math.round(num * 100) / 100 } : f)),
    );
  };

  const saveFixtureOdds = useMutation({
    mutationFn: async () => {
      const oddsPayload: OddsMap = {};
      for (const f of fixtures) {
        oddsPayload[f.id] = { home: f.homeOdds, away: f.awayOdds };
      }
      return upsertContentBlock({
        key: FIXTURE_ODDS_KEY,
        published: true,
        title: 'Melvin Bet Odds',
        body: 'Admin-managed fixture odds for Melvin Bet entertainment display.',
        payload: { odds: oddsPayload },
      });
    },
    onSuccess: () => {
      pushToast('Fixture odds saved.', 'success');
      invalidateMelvinOddsCache();
      queryClient.invalidateQueries({ queryKey: ['admin', 'content', FIXTURE_ODDS_KEY] });
      queryClient.invalidateQueries({ queryKey: ['melvin-odds'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save odds', 'error');
      }
    },
  });

  const groupedByRound = useMemo(() => {
    const map = new Map<number, FixtureInfo[]>();
    for (const f of fixtures) {
      const list = map.get(f.round) || [];
      list.push(f);
      map.set(f.round, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [fixtures]);

  /* ════════ PREMIERSHIP ODDS STATE ════════ */
  const premQuery = useQuery({
    queryKey: ['admin', 'content', PREM_ODDS_KEY],
    queryFn: async () => {
      const blocks = await listContentBlocks(PREM_ODDS_KEY);
      return blocks.find((b) => b.key === PREM_ODDS_KEY) || null;
    },
    refetchInterval: 30_000,
  });

  const savedPremOdds = useMemo<Record<string, number>>(() => {
    const raw = premQuery.data?.payload?.odds;
    if (!raw || typeof raw !== 'object') return {};
    const map: Record<string, number> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === 'number' && val > 0) map[key] = val;
    }
    return map;
  }, [premQuery.data]);

  const [premTeams, setPremTeams] = useState<PremTeamRow[]>([]);

  // Initialise prem teams from ALL_TEAMS with default odds
  useEffect(() => {
    setPremTeams(
      ALL_TEAMS.map((t) => ({
        key: t.key,
        name: t.name,
        odds: savedPremOdds[t.key] || 10.0,
      })),
    );
  }, [savedPremOdds]);

  const updatePremOdds = (key: TeamKey, value: string) => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 1) return;
    setPremTeams((prev) =>
      prev.map((t) => (t.key === key ? { ...t, odds: Math.round(num * 100) / 100 } : t)),
    );
  };

  const savePremOdds = useMutation({
    mutationFn: async () => {
      const oddsPayload: Record<string, number> = {};
      for (const t of premTeams) {
        oddsPayload[t.key] = t.odds;
      }
      return upsertContentBlock({
        key: PREM_ODDS_KEY,
        published: true,
        title: 'Melvin Premiership Odds',
        body: 'Admin-managed premiership odds for ladder display.',
        payload: { odds: oddsPayload },
      });
    },
    onSuccess: () => {
      pushToast('Premiership odds saved.', 'success');
      invalidatePremOddsCache();
      queryClient.invalidateQueries({ queryKey: ['admin', 'content', PREM_ODDS_KEY] });
      queryClient.invalidateQueries({ queryKey: ['prem-odds'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save prem odds', 'error');
      }
    },
  });

  /* ════════ RENDER ════════ */
  return (
    <div className="eg-admin-grid one" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Fixture Odds */}
      <AdminCard
        title="Fixture Odds"
        subtitle="Set decimal odds for each fixture. Changes appear on fixture cards immediately after saving."
        actions={
          <button type="button" onClick={() => saveFixtureOdds.mutate()} disabled={saveFixtureOdds.isPending}>
            {saveFixtureOdds.isPending ? 'Saving…' : 'Save Fixture Odds'}
          </button>
        }
      >
        {loadingFixtures ? (
          <EmptyState title="Loading fixtures…" description="Fetching season fixtures" />
        ) : fixtures.length === 0 ? (
          <EmptyState title="No fixtures found" description="No fixtures available for this season." />
        ) : (
          <div className="eg-admin-odds-wrap">
            {groupedByRound.map(([round, matches]) => (
              <div key={round} className="eg-admin-odds-round">
                <div className="eg-admin-odds-round-label">Round {round}</div>
                {matches.map((f) => (
                  <div key={f.id} className="eg-admin-odds-row">
                    <div className="eg-admin-odds-teams">
                      <span className="eg-admin-odds-team">{f.homeName}</span>
                      <span className="eg-admin-odds-vs">v</span>
                      <span className="eg-admin-odds-team">{f.awayName}</span>
                    </div>
                    <div className="eg-admin-odds-inputs">
                      <label>
                        <span>Home</span>
                        <input
                          type="number"
                          step="0.05"
                          min="1.01"
                          max="99"
                          value={f.homeOdds}
                          onChange={(e) => updateOdds(f.id, 'home', e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Away</span>
                        <input
                          type="number"
                          step="0.05"
                          min="1.01"
                          max="99"
                          value={f.awayOdds}
                          onChange={(e) => updateOdds(f.id, 'away', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {/* Premiership Odds */}
      <AdminCard
        title="Premiership Odds"
        subtitle="Set premiership odds per team. Shown on the ladder next to each team."
        actions={
          <button type="button" onClick={() => savePremOdds.mutate()} disabled={savePremOdds.isPending}>
            {savePremOdds.isPending ? 'Saving…' : 'Save Prem Odds'}
          </button>
        }
      >
        <div className="eg-admin-odds-wrap">
          {premTeams.map((t) => (
            <div key={t.key} className="eg-admin-odds-row">
              <div className="eg-admin-odds-teams">
                <span className="eg-admin-odds-team" style={{ maxWidth: 'none' }}>{t.name}</span>
              </div>
              <div className="eg-admin-odds-inputs">
                <label>
                  <span>Prem</span>
                  <input
                    type="number"
                    step="0.5"
                    min="1.01"
                    max="501"
                    value={t.odds}
                    onChange={(e) => updatePremOdds(t.key, e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
