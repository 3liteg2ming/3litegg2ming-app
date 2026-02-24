import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchTimeline from '@/components/match-centre/broadcast/MatchTimeline';
import MatchLeaders from '@/components/match-centre/broadcast/MatchLeaders';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';

import { fetchMatchCentre, type MatchCentreModel } from '@/lib/matchCentreRepo';

import '@/styles/mc-tailwind.css';
import '@/styles/mc-broadcast-theme.css';

export default function MatchCentrePage() {
  const navigate = useNavigate();
  const { matchId } = useParams();

  const [tab, setTab] = useState<MatchCentreTabKey>('summary');
  const [model, setModel] = useState<MatchCentreModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const topRef = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setModel(null);

      try {
        if (!matchId) throw new Error('Missing match id.');
        const data = await fetchMatchCentre(matchId);
        if (!alive) return;
        setModel(data);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'Failed to load match centre.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [matchId]);

  return (
    <div className="mc-broadcast-root">
      <div className="min-h-screen bg-background text-foreground">
        <HeroHeader onBack={() => navigate(-1)} model={model} loading={loading} />

        <div ref={topRef} />
        <MatchCentreTabs active={tab} onChange={setTab} />

        {err ? (
          <div className="w-full max-w-3xl mx-auto px-4 py-10">
            <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-6 text-center">
              <div className="text-xl font-black text-foreground">Match Centre Unavailable</div>
              <div className="mt-2 text-sm text-muted-foreground">{err}</div>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mt-5 inline-flex items-center justify-center px-5 py-2 rounded-full bg-primary text-primary-foreground font-bold"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <>
            {tab === 'summary' && (
              <>
                <MatchTimeline model={model} loading={loading} />
                <MatchLeaders model={model} loading={loading} />
              </>
            )}

            {tab === 'team' && <TeamStats model={model} loading={loading} />}
            {tab === 'players' && <PlayerStatsTable model={model} loading={loading} />}

            <div className="h-20" />
          </>
        )}
      </div>
    </div>
  );
}