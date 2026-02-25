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
import { motion } from 'framer-motion';
import { Share2, Home } from 'lucide-react';

export default function MatchCentrePage() {
  const navigate = useNavigate();
  const { matchId } = useParams();

  const [tab, setTab] = useState<MatchCentreTabKey>('summary');
  const [model, setModel] = useState<MatchCentreModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabDataLoaded, setTabDataLoaded] = useState<Set<MatchCentreTabKey>>(new Set(['summary']));
  const [tabLoading, setTabLoading] = useState<Set<MatchCentreTabKey>>(new Set());

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

  // Initial load (summary data only, but keep the same model for all tabs)
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
        setTabDataLoaded(new Set(['summary']));
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

  // Lazy-load tab data when switching tabs
  const handleTabChange = (newTab: MatchCentreTabKey) => {
    setTab(newTab);

    // If data already loaded, don't reload
    if (tabDataLoaded.has(newTab)) {
      return;
    }

    // Mark as needing to load (optional: add loading state per tab)
    setTabLoading((prev) => new Set(prev).add(newTab));
    setTabDataLoaded((prev) => new Set(prev).add(newTab));
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `Match Centre - ${model?.home?.fullName} vs ${model?.away?.fullName}`,
        url,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(url);
      alert('Match Centre link copied to clipboard!');
    }
  };

  return (
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader onBack={() => navigate(-1)} model={model} loading={loading} />

        <div ref={topRef} />

        {/* Action Bar */}
        <motion.div
          className="mcPage__actions"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            type="button"
            className="mcPage__actionBtn mcPage__actionBtn--secondary"
            onClick={() => navigate('/fixtures')}
            title="Back to Fixtures"
          >
            <Home className="w-4 h-4" />
            <span>Fixtures</span>
          </button>
          <button
            type="button"
            className="mcPage__actionBtn mcPage__actionBtn--primary"
            onClick={handleShare}
            title="Share this match"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
        </motion.div>

        <MatchCentreTabs active={tab} onChange={handleTabChange} />

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
