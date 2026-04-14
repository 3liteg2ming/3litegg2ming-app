import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, Users, BarChart3 } from 'lucide-react';

import SmartImg from '@/components/SmartImg';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { resolvePlayerDisplayName, resolvePlayerPhotoUrl, resolveTeamLogoUrl, resolveTeamName } from '@/lib/entityResolvers';

import '@/styles/team-profile.css';

const supabase = requireSupabaseClient();

/* ── Types ── */

type TeamRow = {
  id: string;
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  coach_name?: string | null;
  coach_psn?: string | null;
};

type PlayerRow = {
  id: string;
  number?: number | null;
  position?: string | null;
  headshot_url?: string | null;
  photo_url?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
};

type CoachRow = {
  user_id: string;
  display_name: string | null;
  psn: string | null;
  team_id: string;
};

type ProfileTab = 'squad' | 'stats';

/* ── Helpers ── */

function safeNum(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function avg(total: number, games: number): string {
  if (!games) return '0.0';
  return (total / games).toFixed(1);
}

function posAbbrev(pos: string | null | undefined): string {
  const p = String(pos || '').trim();
  if (!p) return '';
  const MAP: Record<string, string> = {
    midfielder: 'MID', forward: 'FWD', defender: 'DEF', ruck: 'RUC',
    'key forward': 'KF', 'key defender': 'KD', mid: 'MID', fwd: 'FWD',
    def: 'DEF', ruc: 'RUC',
  };
  return MAP[p.toLowerCase()] || p.toUpperCase().slice(0, 3);
}

const STAT_BARS: { key: string; label: string }[] = [
  { key: 'disposals', label: 'Disposals' },
  { key: 'kicks', label: 'Kicks' },
  { key: 'handballs', label: 'Handballs' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'fantasy_points', label: 'Fantasy Pts' },
];

/* ── Component ── */

export default function TeamProfilePage() {
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();

  const [tab, setTab] = useState<ProfileTab>('squad');
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [teamStats, setTeamStats] = useState<Record<string, number> | null>(null);
  const [topPlayers, setTopPlayers] = useState<any[]>([]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const [teamRes, playersRes, coachesRes, statsRes] = await Promise.all([
        supabase
          .from('eg_teams')
          .select('id,name,short_name,logo_url,primary_color,coach_name,coach_psn')
          .eq('id', teamId)
          .maybeSingle(),
        Promise.resolve(
          supabase
            .from('eg_players')
            .select('id,number,position,headshot_url,photo_url,full_name,display_name,name')
            .eq('team_id', teamId)
            .order('number', { ascending: true, nullsFirst: false }),
        ).catch(() => ({ data: null, error: null })),
        Promise.resolve(
          supabase.rpc('eg_list_current_coaches'),
        ).catch(() => ({ data: null, error: null })),
        Promise.resolve(
          supabase
            .from('eg_player_season_totals_ext')
            .select('player_id,player_name,matches,disposals,kicks,handballs,marks,tackles,clearances,fantasy_points')
            .eq('team_id', teamId),
        ).catch(() => ({ data: null, error: null })),
      ]);

      if (cancelled) return;

      setTeam(teamRes.data as TeamRow | null);
      setPlayers(((playersRes as any)?.data ?? []) as PlayerRow[]);

      const allCoaches = ((coachesRes as any)?.data ?? []) as CoachRow[];
      setCoaches(allCoaches.filter((c) => c.team_id === teamId));

      // Aggregate stats
      const statRows = ((statsRes as any)?.data ?? []) as any[];
      if (statRows.length > 0) {
        const totals: Record<string, number> = {
          matches: 0, disposals: 0, kicks: 0, handballs: 0,
          marks: 0, tackles: 0, clearances: 0, fantasy_points: 0,
        };
        let maxMatches = 0;
        for (const r of statRows) {
          const m = safeNum(r.matches);
          if (m > maxMatches) maxMatches = m;
          totals.disposals += safeNum(r.disposals);
          totals.kicks += safeNum(r.kicks);
          totals.handballs += safeNum(r.handballs);
          totals.marks += safeNum(r.marks);
          totals.tackles += safeNum(r.tackles);
          totals.clearances += safeNum(r.clearances);
          totals.fantasy_points += safeNum(r.fantasy_points);
        }
        totals.matches = maxMatches;
        setTeamStats(totals);

        // Top 5 by fantasy points
        const sorted = [...statRows].sort((a, b) => safeNum(b.fantasy_points) - safeNum(a.fantasy_points));
        setTopPlayers(sorted.slice(0, 5));
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [teamId]);

  const color = String(team?.primary_color || '#f5c400');
  const name = resolveTeamName({ name: team?.name, shortName: team?.short_name });
  const logo = resolveTeamLogoUrl({ logoUrl: team?.logo_url, name: team?.name, fallbackPath: 'elite-gaming-logo.png' });

  const coachLabel = useMemo(() => {
    const fromTeam = String(team?.coach_name || '').trim();
    if (fromTeam) return fromTeam;
    if (coaches.length === 0) return null;
    return coaches.map((c) => c.display_name || c.psn || 'Coach').join(', ');
  }, [team, coaches]);

  if (loading) {
    return (
      <div className="tpDetailPage">
        <div className="tpDetailPage__header">
          <button type="button" className="tpDetailPage__back" onClick={() => navigate('/teams')}><ArrowLeft size={20} /></button>
          <div className="tpDetailPage__skeleton">Loading...</div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="tpDetailPage">
        <div className="tpDetailPage__header">
          <button type="button" className="tpDetailPage__back" onClick={() => navigate('/teams')}><ArrowLeft size={20} /></button>
          <div className="tpDetailPage__title">Team not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tpDetailPage">
      {/* ── Hero ── */}
      <section className="tpDetailHero" style={{ ['--tp-color' as string]: color }}>
        <button type="button" className="tpDetailPage__back" onClick={() => navigate('/teams')}>
          <ArrowLeft size={20} />
        </button>

        <div className="tpDetailHero__logoWrap">
          <SmartImg src={logo} alt={name} className="tpDetailHero__logo" loading="eager" />
        </div>
        <h1 className="tpDetailHero__name">{name}</h1>

        {coachLabel && (
          <div className="tpDetailHero__coach">
            <Shield size={13} />
            <span>Coach: <strong>{coachLabel}</strong></span>
          </div>
        )}

        <div className="tpDetailHero__statRow">
          <div className="tpDetailHero__stat">
            <span className="tpDetailHero__statVal">{players.length}</span>
            <span className="tpDetailHero__statLabel">Players</span>
          </div>
          {teamStats && teamStats.matches > 0 && (
            <div className="tpDetailHero__stat">
              <span className="tpDetailHero__statVal">{teamStats.matches}</span>
              <span className="tpDetailHero__statLabel">Games</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div className="tpDetailTabs">
        <button type="button" className={`tpDetailTabs__btn ${tab === 'squad' ? 'isActive' : ''}`} onClick={() => setTab('squad')}>
          <Users size={14} /> Squad
        </button>
        <button type="button" className={`tpDetailTabs__btn ${tab === 'stats' ? 'isActive' : ''}`} onClick={() => setTab('stats')}>
          <BarChart3 size={14} /> Stats
        </button>
      </div>

      {/* ── Squad ── */}
      {tab === 'squad' && (
        <div className="tpDetailPage__content">
          {players.length === 0 ? (
            <div className="tpDetailPage__empty">No players found for this team.</div>
          ) : (
            <div className="tpDetailPage__playerGrid">
              {players.map((p) => {
                const pName = resolvePlayerDisplayName({ displayName: p.display_name, fullName: p.full_name, name: p.name });
                const pPhoto = resolvePlayerPhotoUrl({ photoUrl: p.photo_url, headshotUrl: p.headshot_url, fallbackPath: 'elite-gaming-logo.png' });
                const pos = posAbbrev(p.position);
                return (
                  <button key={p.id} type="button" className="tpPlayerCard" style={{ ['--tp-color' as string]: color }} onClick={() => navigate(`/player/${p.id}`)}>
                    <div className="tpPlayerCard__imgWrap">
                      <SmartImg src={pPhoto} alt={pName} className="tpPlayerCard__photo" loading="lazy" />
                      <SmartImg src={logo} alt={name} className="tpPlayerCard__badge" loading="lazy" />
                    </div>
                    <div className="tpPlayerCard__info">
                      <span className="tpPlayerCard__name">{pName}</span>
                      <div className="tpPlayerCard__meta">
                        {p.number && <span className="tpPlayerCard__number">{p.number}</span>}
                        {pos && <span className="tpPlayerCard__position">{pos}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      {tab === 'stats' && (
        <div className="tpDetailPage__content">
          {!teamStats || teamStats.matches === 0 ? (
            <div className="tpDetailPage__empty">No team stats recorded yet.</div>
          ) : (
            <>
              <div className="tpStatsSection">
                <div className="tpStatsSection__head">
                  <h2>Season Stats</h2>
                  <span className="tpStatsSection__badge">{teamStats.matches} Game{teamStats.matches === 1 ? '' : 's'}</span>
                </div>
                <div className="tpStatsSection__bars">
                  {STAT_BARS.map(({ key, label }) => {
                    const total = teamStats[key] || 0;
                    const perGame = avg(total, teamStats.matches);
                    const maxTotal = Math.max(1, ...STAT_BARS.map((s) => teamStats[s.key] || 0));
                    const pct = Math.min(100, (total / maxTotal) * 100);
                    return (
                      <div key={key} className="tpStatBar">
                        <div className="tpStatBar__head">
                          <span className="tpStatBar__label">{label}</span>
                          <span className="tpStatBar__values"><strong>{total}</strong> <span>{perGame} avg</span></span>
                        </div>
                        <div className="tpStatBar__track">
                          <div className="tpStatBar__fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {topPlayers.length > 0 && (
                <div className="tpStatsSection" style={{ marginTop: 12 }}>
                  <div className="tpStatsSection__head">
                    <h2>Top Players</h2>
                    <span className="tpStatsSection__badge">By Fantasy Pts</span>
                  </div>
                  <div className="tpTopPlayers">
                    {topPlayers.map((p: any, i: number) => (
                      <button key={p.player_id} type="button" className="tpTopPlayer" onClick={() => navigate(`/player/${p.player_id}`)}>
                        <span className="tpTopPlayer__rank" style={{ background: `${color}22`, color }}>{i + 1}</span>
                        <span className="tpTopPlayer__name">{p.player_name}</span>
                        <span className="tpTopPlayer__stat">{safeNum(p.fantasy_points)} FP</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
