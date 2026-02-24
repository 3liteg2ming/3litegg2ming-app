import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import { getAfl26RoundsFromSupabase, type AflRound } from '../data/afl26Supabase';
import { afl26LocalRounds } from '../data/afl26LocalRounds';

import '../styles/Fixtures.css';

type StatusFilter = 'ALL' | 'SCHEDULED' | 'LIVE' | 'FINAL';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SCHEDULED', label: 'Upcoming' },
  { key: 'LIVE', label: 'Live' },
  { key: 'FINAL', label: 'Full Time' },
];

export default function AFL26FixturesPage() {
  const navigate = useNavigate();

  const [rounds, setRounds] = useState<AflRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeRound, setActiveRound] = useState(1);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const r = await getAfl26RoundsFromSupabase();
        if (!mounted) return;

        const nextRounds = r && r.length ? r : afl26LocalRounds;

        setRounds(nextRounds);

        if (nextRounds.length && !nextRounds.find((x) => x.round === activeRound)) {
          setActiveRound(nextRounds[0].round);
        }
      } catch (e: any) {
        if (!mounted) return;

        setRounds(afl26LocalRounds);
        setLoadError(e?.message || 'Using local fixtures (Supabase unavailable).');

        if (afl26LocalRounds.length && !afl26LocalRounds.find((x) => x.round === activeRound)) {
          setActiveRound(afl26LocalRounds[0].round);
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRound = rounds.find((r) => r.round === activeRound) || rounds[0];
  const totalMatches = currentRound?.matches?.length || 0;

  const filteredMatches = useMemo(() => {
    const list = currentRound?.matches || [];
    if (activeFilter === 'ALL') return list;

    return list.filter((m) => {
      if (activeFilter === 'SCHEDULED') return m.status === 'SCHEDULED';
      if (activeFilter === 'LIVE') return m.status === 'LIVE';
      if (activeFilter === 'FINAL') return m.status === 'FINAL';
      return true;
    });
  }, [currentRound, activeFilter]);

  const uiMatches: FixturePosterMatch[] = useMemo(
    () =>
      (filteredMatches || []).map((m) => ({
        id: m.id,
        round: activeRound,
        venue: m.venue,
        status: m.status,
        home: m.home as any,
        away: m.away as any,

        // ✅ pass coach names + psn to the card
        homeCoachName: (m as any).homeCoachName,
        awayCoachName: (m as any).awayCoachName,
        homePsn: m.homePsn,
        awayPsn: m.awayPsn,

        homeScore: m.homeScore,
        awayScore: m.awayScore,

        onMatchCentreClick: () => navigate(`/match-centre/${m.id}`),
      })),
    [filteredMatches, navigate, activeRound]
  );

  return (
    <div className="fxAflPage">
      <div className="fxAflInner">
        <div className="fxAflStickyNav">
          <div className="fxAflRounds" aria-label="Rounds">
            {(rounds || []).map((r) => (
              <button
                key={r.round}
                type="button"
                className={`fxAflRound ${r.round === activeRound ? 'fxAflRound--active' : ''}`}
                onClick={() => setActiveRound(r.round)}
              >
                {r.round}
              </button>
            ))}
          </div>
        </div>

        <div className="fxAflPanel">
          <div className="fxAflPanel__top">
            <div className="fxAflRoundTitle">Round {activeRound}</div>
            <div className="fxAflRoundMeta">{totalMatches} Matches</div>
          </div>

          <div className="fxAflFilters" aria-label="Filter matches">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`fxAflFilter ${activeFilter === f.key ? 'fxAflFilter--active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loadError ? <div className="fxAflNotice">{loadError}</div> : null}
          {loading ? <div className="fxAflLoading">Loading fixtures…</div> : null}

          {!loading && uiMatches.length === 0 ? (
            <div className="fxAflEmpty">No matches found for this filter.</div>
          ) : null}

          <div className="fxAflList">
            {uiMatches.map((m) => (
              <FixturePosterCard key={m.id} m={m} />
            ))}
          </div>
        </div>

        <div style={{ height: 18 }} />
      </div>
    </div>
  );
}
