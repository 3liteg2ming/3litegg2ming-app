// pages/HomePage.tsx — Home with Quick Preview using FixturePosterCard (new baseline)
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import FixturePosterCard, { type FixturePosterMatch } from '../components/FixturePosterCard';
import LadderPreviewCard, { type LadderPreviewRow } from '../components/LadderPreviewCard';
import GoalsPreviewCard from '../components/GoalsPreviewCard';
import SmartImg from '../components/SmartImg';

import { assetUrl } from '../lib/teamAssets';

import { getAfl26RoundsFromSupabase, type AflRound } from '../data/afl26Supabase';
import { afl26LocalRounds } from '../data/afl26LocalRounds';

import '../styles/home.css';

type Season = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  status: 'current' | 'upcoming';
  logoFile: string;
  accent: 'pro' | 'afl';
};

function pickTopFixture(rounds: AflRound[] | null | undefined) {
  const list = rounds && rounds.length ? rounds : null;
  if (!list) return null;

  // Match fixtures page default behaviour: Round 1 if it exists, otherwise first round in list
  const r1 = list.find((r) => r.round === 1);
  const chosenRound = r1 || list[0];
  const topMatch = chosenRound?.matches?.[0];

  if (!topMatch) return null;

  return { round: chosenRound.round, match: topMatch };
}

export default function HomePage() {
  const [view, setView] = useState<'upcoming' | 'current'>('upcoming');

  // ✅ Quick Preview fixture card (new FixturePosterCard)
  const [quickPreview, setQuickPreview] = useState<FixturePosterMatch | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const r = await getAfl26RoundsFromSupabase();
        if (!mounted) return;

        const rounds = r && r.length ? r : afl26LocalRounds;
        const picked = pickTopFixture(rounds);
        if (!picked) return;

        const { round, match } = picked;

        setQuickPreview({
          id: match.id,
          round,
          status: match.status, // 'SCHEDULED' | 'LIVE' | 'FINAL'
          venue: match.venue,

          home: match.home as any,
          away: match.away as any,

          homePsn: match.homePsn,
          awayPsn: match.awayPsn,

          homeScore: match.homeScore,
          awayScore: match.awayScore,

          // keep the same navigation you already had
          onMatchCentreClick: () => {
            window.location.href = `/match-centre/${match.id}`;
          },
        } as any);
      } catch {
        // fallback to local if anything fails
        const picked = pickTopFixture(afl26LocalRounds);
        if (!picked) return;

        const { round, match } = picked;

        setQuickPreview({
          id: match.id,
          round,
          status: match.status,
          venue: match.venue,

          home: match.home as any,
          away: match.away as any,

          homePsn: match.homePsn,
          awayPsn: match.awayPsn,

          homeScore: match.homeScore,
          awayScore: match.awayScore,

          onMatchCentreClick: () => {
            window.location.href = `/match-centre/${match.id}`;
          },
        } as any);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const seasons: Season[] = useMemo(
    () => [
      {
        id: 'proteam-s1',
        title: 'AFL Pro Team',
        subtitle: 'Season One • Coming Soon',
        tag: 'PRO TEAM',
        status: 'upcoming',
        logoFile: 'proteam-logo.png',
        accent: 'pro',
      },
      {
        id: 'afl26-s2',
        title: 'AFL 26',
        subtitle: 'Season Two • Coming Soon',
        tag: 'AFL 26',
        status: 'upcoming',
        logoFile: 'afl26-logo.png',
        accent: 'afl',
      },
    ],
    []
  );

  const filtered = seasons.filter((s) => s.status === view);

  const ladderRows: LadderPreviewRow[] = useMemo(
    () => [
      { pos: 1, team: 'adelaide', gp: 0, pts: 0, pct: 0.0 },
      { pos: 2, team: 'brisbane', gp: 0, pts: 0, pct: 0.0 },
      { pos: 3, team: 'carlton', gp: 0, pts: 0, pct: 0.0 },
      { pos: 4, team: 'collingwood', gp: 0, pts: 0, pct: 0.0 },
    ],
    []
  );

  return (
    <div className="app">
      {/* Seasons Section */}
      <section className="rowHead">
        <div className="rowTitle">Seasons</div>
        <div className="toggle">
          <button
            type="button"
            className={view === 'upcoming' ? 'toggleBtn active' : 'toggleBtn'}
            onClick={() => setView('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={view === 'current' ? 'toggleBtn active' : 'toggleBtn'}
            onClick={() => setView('current')}
          >
            Current
          </button>
        </div>
      </section>

      <section className="seasonRail" aria-label="Seasons carousel">
        {filtered.length === 0 ? (
          <div className="emptyState">No {view} seasons yet.</div>
        ) : (
          filtered.map((s) => (
            <button key={s.id} type="button" className={`seasonTile ${s.accent}`}>
              <div className="seasonTileContent">
                <div className="seasonTileTop">
                  <div className="seasonTileTag">{s.tag}</div>
                  <div className="seasonTileAction">Coming Soon</div>
                </div>

                <div className="seasonTileMid">
                  <div className="seasonTileLogoWrap">
                    <SmartImg
                      className="seasonTileLogo"
                      src={assetUrl(s.logoFile)}
                      alt={`${s.title} logo`}
                      fallbackText="EG"
                    />
                  </div>
                  <div className="seasonTileText">
                    <div className="seasonTileTitle">{s.title}</div>
                    <div className="seasonTileSub">{s.subtitle}</div>
                  </div>
                </div>

                <div className="seasonTileBottom">
                  <div className="seasonTileHint">Season hub coming soon</div>
                  <ChevronRight size={16} color="rgba(255,255,255,0.4)" />
                </div>
              </div>
            </button>
          ))
        )}
      </section>

      {/* Quick Previews */}
      <section className="rowHead">
        <div className="rowTitle">Quick Previews</div>
        <div className="rowHint">Preview only</div>
      </section>

      <section className="previewsSection">
        {/* ✅ New baseline fixture card preview */}
        {quickPreview ? (
          <FixturePosterCard m={quickPreview} />
        ) : (
          <div className="emptyState">Loading top fixture…</div>
        )}

        <LadderPreviewCard rows={ladderRows} seasonLabel="Season One" />

        <GoalsPreviewCard
          leader={{
            goals: 6,
            name: 'Jeremy Cameron',
            team: 'Cats',
            // Headshots are now served online (Supabase). This preview uses the default fallback.
            headshotUrl: undefined,
          }}
          rows={[
            { rank: 2, name: 'Toby Greene', team: 'Giants', goals: 5, avatarUrl: undefined },
            { rank: 3, name: 'Chayce Jones', team: 'Crows', goals: 0, avatarUrl: undefined },
            { rank: 4, name: 'Ben Keays', team: 'Crows', goals: 0, avatarUrl: undefined },
            { rank: 5, name: 'Sam Berry', team: 'Crows', goals: 0, avatarUrl: undefined },
          ]}
        />
      </section>

      <div style={{ height: 22 }} />
    </div>
  );
}
