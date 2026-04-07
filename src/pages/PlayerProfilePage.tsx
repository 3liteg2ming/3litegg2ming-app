import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trophy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const supabase = requireSupabaseClient();

import SmartImg from '@/components/SmartImg';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { resolvePlayerDisplayName, resolvePlayerPhotoUrl, resolveTeamLogoUrl, resolveTeamName } from '@/lib/entityResolvers';

import '@/styles/player-profile.css';

type ProfileTab = 'latest' | 'season' | 'career';

type PlayerRow = {
  id: string;
  team_id?: string | null;
  number?: number | null;
  position?: string | null;
  headshot_url?: string | null;
  photo_url?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
};

type TeamRow = {
  id: string;
  name?: string | null;
  short_name?: string | null;
  abbreviation?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  colour?: string | null;
};

type StatRow = {
  disposals?: number | null;
  kicks?: number | null;
  handballs?: number | null;
  marks?: number | null;
  tackles?: number | null;
  clearances?: number | null;
  goals?: number | null;
  behinds?: number | null;
  hit_outs?: number | null;
  fantasy_points?: number | null;
  matches?: number | null;
};

type StatConfig = { key: keyof StatRow; label: string; short: string };

const ALL_STATS: StatConfig[] = [
  { key: 'disposals', label: 'Disposals', short: 'DISP' },
  { key: 'kicks', label: 'Kicks', short: 'K' },
  { key: 'handballs', label: 'Handballs', short: 'HB' },
  { key: 'marks', label: 'Marks', short: 'MRK' },
  { key: 'goals', label: 'Goals', short: 'GLS' },
  { key: 'behinds', label: 'Behinds', short: 'BHD' },
  { key: 'tackles', label: 'Tackles', short: 'TKL' },
  { key: 'clearances', label: 'Clearances', short: 'CLR' },
  { key: 'hit_outs', label: 'Hit Outs', short: 'HO' },
  { key: 'fantasy_points', label: 'Fantasy Pts', short: 'FPTS' },
];

const HERO_TILES: StatConfig[] = [
  { key: 'disposals', label: 'Disposals', short: 'DISP' },
  { key: 'goals', label: 'Goals', short: 'GLS' },
  { key: 'marks', label: 'Marks', short: 'MRK' },
  { key: 'tackles', label: 'Tackles', short: 'TKL' },
];

const STAT_SELECT = 'disposals,kicks,handballs,marks,tackles,clearances,goals,behinds,hit_outs,fantasy_points';

function mergeName(player: PlayerRow | null): string {
  if (!player) return 'Player not linked';
  return resolvePlayerDisplayName({
    displayName: player.display_name,
    fullName: player.full_name,
    name: player.name,
  });
}

function safeNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  if (decimals === 0) return String(Math.round(Number(value)));
  return Number(value).toFixed(decimals);
}

function teamColor(team: TeamRow | null): string {
  return String(team?.primary_color || team?.colour || '#1f2937');
}

function tName(team: TeamRow | null): string {
  return resolveTeamName({
    name: team?.name,
    shortName: team?.short_name || team?.abbreviation,
  });
}

function tLogo(team: TeamRow | null): string {
  return resolveTeamLogoUrl({
    logoUrl: team?.logo_url,
    name: team?.name,
    fallbackPath: 'elite-gaming-logo.png',
  });
}

function statVal(row: StatRow | null, key: keyof StatRow): number | null {
  if (!row) return null;
  const v = row[key];
  return v === undefined || v === null ? null : Number(v);
}

/* ── Full stats sheet (modal) ── */
function StatsSheet({
  stats,
  tab,
  matchCount,
  playerName,
  onClose,
}: {
  stats: StatRow | null;
  tab: ProfileTab;
  matchCount: number;
  playerName: string;
  onClose: () => void;
}) {
  const decimals = tab === 'latest' ? 0 : 1;
  const visibleStats = ALL_STATS.filter((s) => {
    const v = statVal(stats, s.key);
    return v !== null && v > 0;
  });
  const maxVal = Math.max(1, ...visibleStats.map((s) => statVal(stats, s.key) || 0));

  return (
    <motion.div
      className="ppSheet__backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className="ppSheet"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ppSheet__close" onClick={onClose}><X size={18} /></button>

        <div className="ppSheet__head">
          <Trophy size={14} className="ppSheet__icon" />
          <div>
            <strong>{playerName}</strong>
            <span className="ppSheet__tabLabel">
              {tab === 'latest' ? 'Last match' : tab === 'season' ? 'Season averages' : 'Career averages'}
              {matchCount > 0 ? ` · ${matchCount} game${matchCount === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        </div>

        <div className="ppSheet__grid">
          {visibleStats.length > 0 ? visibleStats.map((s) => {
            const v = statVal(stats, s.key) || 0;
            const pct = Math.min(100, (v / maxVal) * 100);
            return (
              <div key={s.key} className="ppSheet__row">
                <span className="ppSheet__label">{s.label}</span>
                <div className="ppSheet__barTrack">
                  <motion.div
                    className="ppSheet__barFill"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.35, delay: 0.08 }}
                  />
                </div>
                <strong className="ppSheet__value">{safeNumber(v, decimals)}</strong>
              </div>
            );
          }) : (
            <div className="ppSheet__empty">No stats recorded yet.</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PlayerProfilePage() {
  const navigate = useNavigate();
  const { playerId } = useParams<{ playerId: string }>();

  const [tab, setTab] = useState<ProfileTab>('latest');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [latestStats, setLatestStats] = useState<StatRow | null>(null);
  const [seasonStats, setSeasonStats] = useState<StatRow | null>(null);
  const [careerStats, setCareerStats] = useState<StatRow | null>(null);
  const [matchCount, setMatchCount] = useState<number>(0);

  useEffect(() => {
    if (!playerId) {
      setError('Player not found.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const playerSelects = [
          'id,team_id,number,position,headshot_url,photo_url,display_name,full_name,name',
          'id,team_id,number,position,headshot_url,photo_url,name',
          'id,team_id,number,position,headshot_url,display_name,photo_url',
          'id,team_id,number,position,headshot_url,name',
        ] as const;

        let playerData: any = null;
        let playerErr: any = null;

        for (const selectCols of playerSelects) {
          const res = await supabase.from('eg_players').select(selectCols).eq('id', playerId).maybeSingle();
          if (!res.error) {
            playerData = res.data;
            playerErr = null;
            break;
          }
          playerErr = res.error;
        }

        if (playerErr) throw new Error(playerErr.message || 'Unable to load player.');
        if (!playerData) throw new Error('Player not found.');

        const playerRow = playerData as PlayerRow;

        // Fetch team, stats, and totals in parallel.
        // Use .catch for stat views — columns may differ between environments.
        const [teamRes, latestRes, seasonRes, careerRes, totalsRes] = await Promise.all([
          playerRow.team_id
            ? supabase
                .from('eg_teams')
                .select('id,name,short_name,abbreviation,logo_url,primary_color,colour')
                .eq('id', playerRow.team_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('eg_player_latest_fixture_statline')
            .select(STAT_SELECT)
            .eq('player_id', playerId)
            .maybeSingle()
            .catch(() => ({ data: null, error: null })),
          supabase
            .from('eg_player_season_averages')
            .select(STAT_SELECT)
            .eq('player_id', playerId)
            .maybeSingle()
            .catch(() => ({ data: null, error: null })),
          supabase
            .from('eg_player_career_averages')
            .select(STAT_SELECT)
            .eq('player_id', playerId)
            .maybeSingle()
            .catch(() => ({ data: null, error: null })),
          supabase
            .from('eg_player_season_totals_ext')
            .select('matches,' + STAT_SELECT)
            .eq('player_id', playerId)
            .maybeSingle()
            .catch(() => ({ data: null, error: null })),
        ]);

        if (cancelled) return;

        setPlayer(playerRow);
        if (!teamRes.error) setTeam((teamRes.data as TeamRow | null) || null);
        if (latestRes && !latestRes.error && latestRes.data) setLatestStats(latestRes.data as StatRow);
        if (seasonRes && !seasonRes.error && seasonRes.data) setSeasonStats(seasonRes.data as StatRow);
        if (careerRes && !careerRes.error && careerRes.data) setCareerStats(careerRes.data as StatRow);
        if (totalsRes && !totalsRes.error && totalsRes.data) {
          setMatchCount(Number((totalsRes.data as any).matches) || 0);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unable to load player profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [playerId]);

  const profileName = useMemo(() => mergeName(player), [player]);
  const position = String(player?.position || '').trim() || 'Player';
  const numberText = player?.number ? `#${player.number}` : '#—';

  const activeStats = useMemo<StatRow | null>(() => {
    if (tab === 'latest') return latestStats;
    if (tab === 'season') return seasonStats;
    return careerStats;
  }, [tab, latestStats, seasonStats, careerStats]);

  const decimals = tab === 'latest' ? 0 : 1;

  const hasAnyStats = useMemo(() => {
    return HERO_TILES.some(({ key }) => statVal(activeStats, key) !== null);
  }, [activeStats]);

  const headshotSrc = resolvePlayerPhotoUrl({
    photoUrl: player?.photo_url,
    headshotUrl: player?.headshot_url,
    fallbackPath: 'elite-gaming-logo.png',
  });

  if (loading) {
    return (
      <div className="ppPage">
        <div className="ppPage__inner">
          <div className="ppSkeleton ppSkeleton--hero" />
          <div className="ppSkeleton ppSkeleton--tabs" />
          <div className="ppSkeleton ppSkeleton--tiles" />
        </div>
      </div>
    );
  }

  if (error || !playerId) {
    return (
      <div className="ppPage">
        <div className="ppPage__inner">
          <section className="ppErrorCard">
            <h2>Player Profile Unavailable</h2>
            <p>{error || 'Player not found.'}</p>
            <button type="button" onClick={() => navigate(-1)} className="ppBackBtn">Go Back</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="ppPage">
      <div className="ppPage__inner">
        {/* ── Hero ── */}
        <section className="ppHero" style={{ ['--pp-team' as string]: teamColor(team) }}>
          <button type="button" className="ppHero__back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>

          <div className="ppHero__watermark" aria-hidden="true">
            <SmartImg src={tLogo(team)} alt={tName(team)} loading="lazy" />
          </div>

          <div className="ppHero__content">
            <div className="ppHero__meta">
              <span className="ppHero__number">{numberText}</span>
              <span className="ppHero__position">{position}</span>
            </div>

            <h1 className="ppHero__name">{profileName}</h1>
            <p className="ppHero__team">{tName(team)}</p>

            {matchCount > 0 && (
              <div className="ppHero__games">
                <span className="ppHero__gamesVal">{matchCount}</span>
                <span className="ppHero__gamesLabel">Game{matchCount === 1 ? '' : 's'} Played</span>
              </div>
            )}
          </div>

          <div className="ppHero__headshot">
            <SmartImg src={headshotSrc} alt={profileName} loading="eager" />
          </div>
        </section>

        {/* ── Tabs ── */}
        <section className="ppTabs" role="tablist" aria-label="Player profile tabs">
          {(['latest', 'season', 'career'] as ProfileTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`ppTabs__btn ${tab === t ? 'isActive' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'latest' ? 'Latest' : t === 'season' ? 'Season' : 'Career'}
            </button>
          ))}
        </section>

        {/* ── Key stats tiles ── */}
        <section className="ppSection">
          <header className="ppSection__header">
            <h2>At a Glance</h2>
            <span>{tab === 'latest' ? 'Last match' : tab === 'season' ? 'Season avg' : 'Career avg'}</span>
          </header>

          {hasAnyStats ? (
            <div className="ppTiles">
              {HERO_TILES.map(({ key, label }) => (
                <article key={key} className="ppTile">
                  <span className="ppTile__label">{label}</span>
                  <span className="ppTile__value">{safeNumber(statVal(activeStats, key), decimals)}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="ppEmptyState">No stats yet for this player.</div>
          )}
        </section>

        {/* ── More stats rows ── */}
        <section className="ppSection ppSection--more">
          <header className="ppSection__header">
            <h2>Full Stats</h2>
            <button type="button" className="ppViewAllBtn" onClick={() => setShowSheet(true)}>
              View all
            </button>
          </header>

          <div className="ppMoreGrid">
            {ALL_STATS.slice(0, 6).map(({ key, label }) => {
              const v = statVal(activeStats, key);
              if (v === null) return null;
              return (
                <div key={key} className="ppMoreRow">
                  <span>{label}</span>
                  <strong>{safeNumber(v, decimals)}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <div className="ppPage__footerGap" />
      </div>

      {/* ── Stats sheet modal ── */}
      <AnimatePresence>
        {showSheet && (
          <StatsSheet
            stats={activeStats}
            tab={tab}
            matchCount={matchCount}
            playerName={profileName}
            onClose={() => setShowSheet(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
