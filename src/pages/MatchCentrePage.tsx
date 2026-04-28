import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';

import HeroHeader from '@/components/match-centre/broadcast/HeroHeader';
import MatchSummaryTab from '@/components/match-centre/broadcast/MatchSummaryTab';
import TeamStats from '@/components/match-centre/broadcast/TeamStats';
import PlayerStatsTable from '@/components/match-centre/broadcast/PlayerStatsTable';
import MatchCentreTabs, { type MatchCentreTabKey } from '@/components/match-centre/broadcast/MatchCentreTabs';
import { MelvinBetMatchOutlook } from '@/components/MelvinBet';
import { useFixture } from '@/hooks/useFixtures';
import { useMatchCentre } from '@/hooks/useMatchCentre';
import { useAuth } from '@/state/auth/AuthProvider';
import { FIXTURES_UNLOCK_LABEL, useFixtureVisibility } from '@/lib/fixtureVisibility';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';

import '@/styles/match-centre-page.css';

function buildPreviewModel(preview: Partial<MatchCentreModel>, fixtureId?: string): MatchCentreModel | null {
  if (!fixtureId || !preview.home || !preview.away) return null;

  return {
    fixtureId,
    round: Number(preview.round || 0),
    dateText: String(preview.dateText || ''),
    venue: String(preview.venue || 'TBA'),
    statusLabel: String(preview.statusLabel || 'UPCOMING'),
    dataConfidence: { tone: 'neutral', label: 'Loading' },
    trust: {
      state: 'Scheduled',
      label: 'Loading',
      summary: 'Loading match centre data.',
      submittedBy: '',
      evidenceCount: 0,
      lastUpdated: '',
      isSubmitted: false,
      isVerified: false,
      isDisputed: false,
      isCorrected: false,
      badgeLabel: 'Loading',
      badgeTone: 'neutral',
    },
    margin: Math.abs(Number(preview.home?.score || 0) - Number(preview.away?.score || 0)),
    home: preview.home as MatchCentreModel['home'],
    away: preview.away as MatchCentreModel['away'],
    leaders: [],
    teamStats: [],
    playerStats: [],
    moments: [],
    hasSubmissionData: false,
    quarterProgression: undefined,
  };
}

export default function MatchCentrePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { fixtureId } = useParams();
  const resolvedFixtureId = fixtureId;
  const { user } = useAuth();
  const fixturesVisible = useFixtureVisibility(user?.role);

  const [tab, setTab] = useState<MatchCentreTabKey>('summary');

  const topRef = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);
  const matchCentreQuery = useMatchCentre(fixturesVisible ? resolvedFixtureId : undefined);
  const previewState = (location.state as { matchCentrePreview?: Partial<MatchCentreModel> } | null)?.matchCentrePreview;
  const heroPreviewModel = previewState ? buildPreviewModel(previewState, resolvedFixtureId) : null;
  const model = matchCentreQuery.data ?? null;
  const fixtureMetaQuery = useFixture(fixturesVisible ? resolvedFixtureId : undefined);
  const fixtureMeta = fixtureMetaQuery.data ?? null;
  const heroModel = model ?? heroPreviewModel;
  const err = matchCentreQuery.error instanceof Error ? matchCentreQuery.error.message : null;
  const loading = matchCentreQuery.isLoading && !matchCentreQuery.data;

  const showSubmitButton = (() => {
    if (!fixturesVisible || !user || !model || !fixtureMeta) return false;
    const status = String(model.statusLabel || fixtureMeta.status || '').toUpperCase();
    if (status === 'FINAL' || status === 'COMPLETED' || status === 'COMPLETE') return false;
    const coachTeamId = user.teamId;
    if (!coachTeamId) return false;
    const homeId = String(fixtureMeta.home_team_id || model.home?.id || '');
    const awayId = String(fixtureMeta.away_team_id || model.away?.id || '');
    if (homeId === coachTeamId) return true;
    if (fixtureMeta.is_finals) return false;
    return awayId === coachTeamId;
  })();

  useEffect(() => {
    const scrollEl = document.querySelector('.eg-content-scroll') as HTMLElement | null;
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }
    window.scrollTo(0, 0);
  }, [resolvedFixtureId]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const scrollEl = document.querySelector('.eg-content-scroll') as HTMLElement | null;
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (scrollEl) {
      const nextTop = Math.max(0, scrollEl.scrollTop + top - 88);
      scrollEl.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
      return;
    }

    topRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [tab]);

  if (import.meta.env.DEV && tab === 'team') {
    console.log('[MatchCentrePage] rows passed into live Team Stats render', {
      fixtureId: model?.fixtureId || resolvedFixtureId || null,
      rowCount: model?.teamStats?.length || 0,
      rows: model?.teamStats || [],
    });
  }

  // Block access to match centre when fixtures are locked
  if (!fixturesVisible) {
    return (
      <div className="mcPage">
        <div className="mcPage__inner">
          <div className="mcPage__error">
            <div className="mcPage__errorBox">
              <div className="mcPage__errorTitle">{FIXTURES_UNLOCK_LABEL}</div>
              <div className="mcPage__errorMsg">
                Match centre will be available once the season reveal goes live.
              </div>
              <button type="button" onClick={() => navigate('/')} className="mcPage__errorBtn">
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mcPage">
      <div className="mcPage__inner">
        <HeroHeader key={heroModel?.fixtureId || resolvedFixtureId || 'latest'} onBack={() => navigate(-1)} model={heroModel} loading={loading} />
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

            {showSubmitButton && (
              <div className="mcPage__submitWrap">
                <button
                  type="button"
                  className="mcPage__submitBtn"
                  onClick={() => navigate('/submit')}
                >
                  <Upload size={15} />
                  <span>Submit Results</span>
                </button>
              </div>
            )}

            <div className="mcPage__footer" />
          </>
        )}
      </div>
    </div>
  );
}
