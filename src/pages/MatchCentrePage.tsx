import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchTimeline from '@/components/match-centre/broadcast/MatchTimeline';
import MatchLeaders from '@/components/match-centre/broadcast/MatchLeaders';
import KeyMatchStats from '@/components/match-centre/broadcast/KeyMatchStats';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';

import { fetchLatestMatchCentre, fetchMatchCentre, type MatchCentreModel } from '@/lib/matchCentreRepo';

import '@/styles/match-centre-page.css';

export default function MatchCentrePage() {
  const navigate = useNavigate();
  const { fixtureId } = useParams();
  const resolvedFixtureId = fixtureId;

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
        const data = resolvedFixtureId
          ? await fetchMatchCentre(resolvedFixtureId)
          : await fetchLatestMatchCentre();
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
  }, [resolvedFixtureId]);

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

  const formatMetaTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderTrustStrip = () => {
    const trust = model?.trust;
    if (!trust) return null;
    return (
      <section className={`mcTrust mcTrust--${trust.state.toLowerCase()}`}>
        <div className="mcTrust__head">
          <div className="mcTrust__title">Match Status</div>
          <div className="mcTrust__state">{trust.label}</div>
        </div>
        <div className="mcTrust__summary">{trust.summary}</div>
        <div className="mcTrust__meta">
          {trust.state === 'Submitted' || trust.state === 'Verified' || trust.state === 'Disputed' || trust.state === 'Corrected' ? (
            <span>Submitted by: {trust.submittedBy || 'Coach'}</span>
          ) : (
            <span>Submitted by: —</span>
          )}
          <span>Evidence: {trust.evidenceCount}</span>
          <span>Last updated: {formatMetaTime(trust.lastUpdated)}</span>
        </div>
        {(trust.state === 'Disputed' || trust.state === 'Corrected') && (
          <div className="mcTrust__links">
            {trust.state === 'Disputed' ? <span>Details link coming soon</span> : null}
            {trust.state === 'Corrected' ? <span>View changelog coming soon</span> : null}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader
          key={model?.fixtureId || resolvedFixtureId || 'latest'}
          onBack={() => navigate(-1)}
          model={model}
          loading={loading}
        />

        <div ref={topRef} />

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
                {renderTrustStrip()}
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
                <PlayerStatsTable model={model} />
              </div>
            )}

            <div className="mcPage__footer" />
          </>
        )}
      </div>
    </div>
  );
}
