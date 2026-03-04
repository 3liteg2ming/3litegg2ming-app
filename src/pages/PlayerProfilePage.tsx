import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays } from 'lucide-react';

const supabase = requireSupabaseClient();

import SmartImg from '@/components/SmartImg';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '@/lib/competitionRegistry';
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

type LatestRow = {
  player_id: string;
  fixture_id: string;
  season_id: string;
  start_time: string | null;
  team_id: string | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
};

type SeasonAvgRow = {
  player_id: string;
  season_id: string;
  team_id: string | null;
  matches: number;
  avg_disposals: number | null;
  avg_kicks: number | null;
  avg_handballs: number | null;
  avg_marks: number | null;
  avg_tackles: number | null;
  avg_clearances: number | null;
};

type CareerAvgRow = {
  player_id: string;
  team_id: string | null;
  matches: number;
  avg_disposals: number | null;
  avg_kicks: number | null;
  avg_handballs: number | null;
  avg_marks: number | null;
  avg_tackles: number | null;
  avg_clearances: number | null;
};

type StatTiles = {
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
};

const TILE_CONFIG: Array<{ key: keyof StatTiles; label: string }> = [
  { key: 'disposals', label: 'Disposals' },
  { key: 'kicks', label: 'Kicks' },
  { key: 'handballs', label: 'Handballs' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'clearances', label: 'Clearances' },
];

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

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function teamColor(team: TeamRow | null): string {
  return String(team?.primary_color || team?.colour || '#1f2937');
}

function teamName(team: TeamRow | null): string {
  return resolveTeamName({
    name: team?.name,
    shortName: team?.short_name || team?.abbreviation,
  });
}

function teamLogo(team: TeamRow | null): string {
  return resolveTeamLogoUrl({
    logoUrl: team?.logo_url,
    name: team?.name,
    fallbackPath: 'elite-gaming-logo.png',
  });
}

async function resolveCurrentSeasonIdByCompetition(): Promise<string | null> {
  const seasonSlug = getDataSeasonSlugForCompetition(getStoredCompetitionKey());
  const { data, error } = await supabase.from('eg_seasons').select('id').eq('slug', seasonSlug).maybeSingle();
  if (error) return null;
  return data?.id ? String(data.id) : null;
}

function latestToTiles(row: LatestRow | null): StatTiles {
  return {
    disposals: row?.disposals ?? null,
    kicks: row?.kicks ?? null,
    handballs: row?.handballs ?? null,
    marks: row?.marks ?? null,
    tackles: row?.tackles ?? null,
    clearances: row?.clearances ?? null,
  };
}

function seasonToTiles(row: SeasonAvgRow | null): StatTiles {
  return {
    disposals: row?.avg_disposals ?? null,
    kicks: row?.avg_kicks ?? null,
    handballs: row?.avg_handballs ?? null,
    marks: row?.avg_marks ?? null,
    tackles: row?.avg_tackles ?? null,
    clearances: row?.avg_clearances ?? null,
  };
}

function careerToTiles(row: CareerAvgRow | null): StatTiles {
  return {
    disposals: row?.avg_disposals ?? null,
    kicks: row?.avg_kicks ?? null,
    handballs: row?.avg_handballs ?? null,
    marks: row?.avg_marks ?? null,
    tackles: row?.avg_tackles ?? null,
    clearances: row?.avg_clearances ?? null,
  };
}

export default function PlayerProfilePage() {
  const navigate = useNavigate();
  const { playerId } = useParams<{ playerId: string }>();

  const [tab, setTab] = useState<ProfileTab>('latest');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [latest, setLatest] = useState<LatestRow | null>(null);
  const [seasonRows, setSeasonRows] = useState<SeasonAvgRow[]>([]);
  const [career, setCareer] = useState<CareerAvgRow | null>(null);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');

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

        const [teamRes, latestRes, seasonRes, careerRes, currentSeasonId] = await Promise.all([
          playerRow.team_id
            ? supabase
                .from('eg_teams')
                .select('id,name,short_name,abbreviation,logo_url,primary_color,colour')
                .eq('id', playerRow.team_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('eg_player_latest_fixture_statline')
            .select('player_id,fixture_id,season_id,start_time,team_id,disposals,kicks,handballs,marks,tackles,clearances')
            .eq('player_id', playerId)
            .maybeSingle(),
          supabase
            .from('eg_player_season_averages')
            .select(
              'player_id,season_id,team_id,matches,avg_disposals,avg_kicks,avg_handballs,avg_marks,avg_tackles,avg_clearances',
            )
            .eq('player_id', playerId),
          supabase
            .from('eg_player_career_averages')
            .select('player_id,team_id,matches,avg_disposals,avg_kicks,avg_handballs,avg_marks,avg_tackles,avg_clearances')
            .eq('player_id', playerId)
            .maybeSingle(),
          resolveCurrentSeasonIdByCompetition(),
        ]);

        if (cancelled) return;

        setPlayer(playerRow);

        if (!teamRes.error) {
          setTeam((teamRes.data as TeamRow | null) || null);
        }

        if (!latestRes.error) {
          setLatest((latestRes.data as LatestRow | null) || null);
        }

        const seasons = (!seasonRes.error ? ((seasonRes.data || []) as SeasonAvgRow[]) : [])
          .filter((r) => String(r.season_id || '').trim().length > 0)
          .sort((a, b) => String(b.season_id).localeCompare(String(a.season_id)));

        setSeasonRows(seasons);

        if (!careerRes.error) {
          setCareer((careerRes.data as CareerAvgRow | null) || null);
        }

        const fromCurrentContext = currentSeasonId && seasons.some((s) => s.season_id === currentSeasonId) ? currentSeasonId : '';
        const latestSeasonId = latestRes.data?.season_id ? String(latestRes.data.season_id) : '';
        const fromLatest = latestSeasonId && seasons.some((s) => s.season_id === latestSeasonId) ? latestSeasonId : '';

        setSelectedSeasonId(fromCurrentContext || fromLatest || seasons[0]?.season_id || '');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Unable to load player profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const profileName = useMemo(() => mergeName(player), [player]);
  const position = String(player?.position || '').trim() || 'Player';
  const numberText = player?.number ? `#${player.number}` : '#—';

  const selectedSeasonRow = useMemo(
    () => seasonRows.find((r) => r.season_id === selectedSeasonId) || null,
    [seasonRows, selectedSeasonId],
  );

  const tabTiles = useMemo<StatTiles>(() => {
    if (tab === 'latest') return latestToTiles(latest);
    if (tab === 'season') return seasonToTiles(selectedSeasonRow);
    return careerToTiles(career);
  }, [tab, latest, selectedSeasonRow, career]);

  const tabMatches = useMemo(() => {
    if (tab === 'season') return selectedSeasonRow?.matches ?? 0;
    if (tab === 'career') return career?.matches ?? 0;
    return latest ? 1 : 0;
  }, [tab, latest, selectedSeasonRow, career]);

  const hasAnyStats = useMemo(() => {
    return TILE_CONFIG.some(({ key }) => tabTiles[key] !== null && tabTiles[key] !== undefined);
  }, [tabTiles]);

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
            <button type="button" onClick={() => navigate(-1)} className="ppBackBtn">
              Go Back
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="ppPage">
      <div className="ppPage__inner">
        <section className="ppHero" style={{ ['--pp-team' as string]: teamColor(team) }}>
          <button type="button" className="ppHero__back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>

          <div className="ppHero__watermark" aria-hidden="true">
            <SmartImg src={teamLogo(team)} alt={teamName(team)} loading="lazy" />
          </div>

          <div className="ppHero__content">
            <div className="ppHero__meta">
              <span className="ppHero__number">{numberText}</span>
              <span className="ppHero__position">{position}</span>
            </div>

            <h1 className="ppHero__name">{profileName}</h1>
            <p className="ppHero__team">{teamName(team)}</p>
          </div>

          <div className="ppHero__headshot">
            <SmartImg src={headshotSrc} alt={profileName} loading="eager" />
          </div>
        </section>

        <section className="ppTabs" role="tablist" aria-label="Player profile tabs">
          <button
            type="button"
            className={`ppTabs__btn ${tab === 'latest' ? 'isActive' : ''}`}
            onClick={() => setTab('latest')}
          >
            Latest
          </button>
          <button
            type="button"
            className={`ppTabs__btn ${tab === 'season' ? 'isActive' : ''}`}
            onClick={() => setTab('season')}
          >
            Season
          </button>
          <button
            type="button"
            className={`ppTabs__btn ${tab === 'career' ? 'isActive' : ''}`}
            onClick={() => setTab('career')}
          >
            Career
          </button>
        </section>

        {tab === 'season' && seasonRows.length > 0 ? (
          <section className="ppSeasonSelectWrap">
            <label className="ppSeasonLabel" htmlFor="pp-season-select">
              <CalendarDays size={14} /> Season
            </label>
            <select
              id="pp-season-select"
              className="ppSeasonSelect"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              {seasonRows.map((row) => (
                <option key={row.season_id} value={row.season_id}>
                  {row.season_id}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        <section className="ppSection">
          <header className="ppSection__header">
            <h2>At a Glance</h2>
            <span>{tabMatches > 0 ? `${tabMatches} match${tabMatches === 1 ? '' : 'es'}` : 'No matches'}</span>
          </header>

          {hasAnyStats ? (
            <div className="ppTiles">
              {TILE_CONFIG.map(({ key, label }) => (
                <article key={key} className="ppTile">
                  <span className="ppTile__label">{label}</span>
                  <span className="ppTile__value">{safeNumber(tabTiles[key], tab === 'latest' ? 0 : 1)}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="ppEmptyState">No stats yet for this player.</div>
          )}
        </section>

        <section className="ppSection ppSection--more">
          <header className="ppSection__header">
            <h2>More Stats</h2>
            <span>{tab === 'latest' ? formatDateTime(latest?.start_time) : tab === 'season' ? 'Season average' : 'Career average'}</span>
          </header>

          <div className="ppMoreGrid">
            <div className="ppMoreRow">
              <span>Disposals</span>
              <strong>{safeNumber(tabTiles.disposals, tab === 'latest' ? 0 : 1)}</strong>
            </div>
            <div className="ppMoreRow">
              <span>Kicks</span>
              <strong>{safeNumber(tabTiles.kicks, tab === 'latest' ? 0 : 1)}</strong>
            </div>
            <div className="ppMoreRow">
              <span>Handballs</span>
              <strong>{safeNumber(tabTiles.handballs, tab === 'latest' ? 0 : 1)}</strong>
            </div>
            <div className="ppMoreRow">
              <span>Marks</span>
              <strong>{safeNumber(tabTiles.marks, tab === 'latest' ? 0 : 1)}</strong>
            </div>
            <div className="ppMoreRow">
              <span>Tackles</span>
              <strong>{safeNumber(tabTiles.tackles, tab === 'latest' ? 0 : 1)}</strong>
            </div>
            <div className="ppMoreRow">
              <span>Clearances</span>
              <strong>{safeNumber(tabTiles.clearances, tab === 'latest' ? 0 : 1)}</strong>
            </div>
          </div>
        </section>

        <div className="ppPage__footerGap" />
      </div>
    </div>
  );
}
