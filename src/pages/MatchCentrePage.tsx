import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchTimeline from '@/components/match-centre/broadcast/MatchTimeline';
import MatchLeaders from '@/components/match-centre/broadcast/MatchLeaders';
import KeyMatchStats from '@/components/match-centre/broadcast/KeyMatchStats';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';
import { useMatchCentre } from '@/hooks/useMatchCentre';

import '@/styles/match-centre-page.css';

function normalizeTrustState(input?: string | null): string {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'scheduled';
  return raw.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function formatMetaTime(iso?: string) {
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
}

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

  const trustMeta = (() => {
    const trust = model?.trust;
    if (!trust) return null;

    const stateClass = normalizeTrustState(trust.state);
    const bits = [
      trust.label || model?.statusLabel || null,
      trust.state !== 'Scheduled' ? `${trust.submittedBy || 'Coach'} published` : 'Awaiting home coach result',
      trust.evidenceCount > 0 ? `${trust.evidenceCount} evidence file${trust.evidenceCount === 1 ? '' : 's'}` : null,
      trust.lastUpdated ? `Updated ${formatMetaTime(trust.lastUpdated)}` : null,
    ].filter(Boolean) as string[];

    return {
      stateClass,
      bits,
    };
  })();

  return (
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader key={model?.fixtureId || resolvedFixtureId || 'latest'} onBack={() => navigate(-1)} model={model} loading={loading} />
        {trustMeta ? (
          <div className={`mcPage__submeta mcPage__submeta--${trustMeta.stateClass}`}>
            {trustMeta.bits.map((bit) => (
              <span key={bit}>{bit}</span>
            ))}
          </div>
        ) : null}

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
              <section id="mc-panel-summary" role="tabpanel" aria-labelledby="mc-tab-summary" className="mcPage__content">
                <MatchLeaders model={model} loading={loading} />
                <MatchTimeline model={model} loading={loading} />
                <KeyMatchStats model={model} loading={loading} />
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
