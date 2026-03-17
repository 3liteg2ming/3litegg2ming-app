import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchSummaryTab from '@/components/match-centre/broadcast/MatchSummaryTab';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';
import { useMatchCentre } from '@/hooks/useMatchCentre';

import '@/styles/match-centre-page.css';

export default function MatchCentrePage() {
  const navigate = useNavigate();
  const { fixtureId } = useParams();
  const resolvedFixtureId = fixtureId;

  const [tab, setTab] = useState<MatchCentreTabKey>('summary');

  const topRef = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);
  const matchCentreQuery = useMatchCentre(resolvedFixtureId);
  const model = matchCentreQuery.data ?? null;
  const err = matchCentreQuery.error instanceof Error ? matchCentreQuery.error.message : null;
  const loading = matchCentreQuery.isLoading && !matchCentreQuery.data;

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

  if (import.meta.env.DEV && tab === 'team') {
    console.log('[MatchCentrePage] rows passed into live Team Stats render', {
      fixtureId: model?.fixtureId || resolvedFixtureId || null,
      rowCount: model?.teamStats?.length || 0,
      rows: model?.teamStats || [],
    });
  }

  return (
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader key={model?.fixtureId || resolvedFixtureId || 'latest'} onBack={() => navigate(-1)} model={model} loading={loading} />
        <div ref={topRef} />

        <MatchCentreTabs active={tab} onChange={setTab} />

        {err ? (
          <div className="mcPage__error">
            <div className="mcPage__errorBox">
              <div className="mcPage__errorTitle">Match Centre Unavailable</div>
              <div className="mcPage__errorMsg">{err}</div>

              <button type="button" onClick={() => navigate(-1)} className="mcPage__errorBtn">
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <>
            {tab === 'summary' && (
              <section id="mc-panel-summary" role="tabpanel" aria-labelledby="mc-tab-summary" className="mcPage__content mcPage__content--summary">
                <MatchSummaryTab model={model} loading={loading} />
              </section>
            )}

            {tab === 'team' && (
              <section id="mc-panel-team" role="tabpanel" aria-labelledby="mc-tab-team" className="mcPage__content">
                <TeamStats model={model} loading={loading} />
              </section>
            )}

            {tab === 'players' && (
              <section id="mc-panel-players" role="tabpanel" aria-labelledby="mc-tab-players" className="mcPage__content">
                <PlayerStatsTable model={model} />
              </section>
            )}

            <div className="mcPage__footer" />
          </>
        )}
      </div>
    </div>
  );
}
