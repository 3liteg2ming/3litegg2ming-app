import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchTimeline from '@/components/match-centre/broadcast/MatchTimeline';
import MatchLeaders from '@/components/match-centre/broadcast/MatchLeaders';
import KeyMatchStats from '@/components/match-centre/broadcast/KeyMatchStats';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';

import { fetchMatchCentre, type MatchCentreModel } from '@/lib/matchCentreRepo';

import '@/styles/match-centre-page.css';

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
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader onBack={() => navigate(-1)} model={model} loading={loading} />

        <div ref={topRef} />
        <MatchCentreTabs active={tab} onChange={setTab} />

        {err ? (
          <div className="mcPage__error">
            <div className="mcPage__errorBox">
              <div className="mcPage__errorTitle">Match Centre Unavailable</div>
              <div className="mcPage__errorMsg">{err}</div>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mcPage__errorBtn"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <>
            {tab === 'summary' && (
              <div className="mcPage__content">
                <MatchLeaders model={model} loading={loading} />
                <MatchTimeline model={model} loading={loading} />
                <KeyMatchStats model={model} loading={loading} />
              </div>
            )}

            {tab === 'team' && (
              <div className="mcPage__content">
                <TeamStats model={model} loading={loading} />
              </div>
            )}

            {tab === 'players' && (
              <div className="mcPage__content">
                <PlayerStatsTable model={model} loading={loading} />
              </div>
            )}

            <div className="mcPage__footer" />
          </>
        )}
      </div>
    </div>
  );
}
