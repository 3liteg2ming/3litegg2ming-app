import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';

import SmartImg from '@/components/SmartImg';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { resolveTeamLogoUrl, resolveTeamName } from '@/lib/entityResolvers';
import { fetchActiveCompetitionBaseline } from '@/lib/seasonParticipantsRepo';

import '@/styles/teams.css';

const supabase = requireSupabaseClient();

type TeamRow = {
  id: string;
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
};

export default function TeamsPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Only show teams that are in the current active season
        const baseline = await fetchActiveCompetitionBaseline();
        const seasonTeamIds = baseline.teams.map((t) => t.id).filter(Boolean);

        if (seasonTeamIds.length === 0) {
          setTeams([]);
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('eg_teams')
          .select('id,name,short_name,logo_url,primary_color')
          .in('id', seasonTeamIds)
          .order('name');

        setTeams((data as TeamRow[]) || []);
      } catch (e) {
        console.error('[TeamsPage] load error:', e);
        setTeams([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="tpListPage">
      <div className="tpListPage__inner">
        <header className="tpListPage__header">
          <Users size={20} className="tpListPage__icon" />
          <h1>Teams</h1>
        </header>

        {loading ? (
          <div className="tpListPage__grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="tpTeamCard tpTeamCard--skeleton" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="tpListPage__empty">No teams found.</div>
        ) : (
          <div className="tpListPage__grid">
            {teams.map((t) => {
              const color = String(t.primary_color || '#f5c400');
              const name = resolveTeamName({ name: t.name, shortName: t.short_name });
              const logo = resolveTeamLogoUrl({ logoUrl: t.logo_url, name: t.name, fallbackPath: 'elite-gaming-logo.png' });
              return (
                <button
                  key={t.id}
                  type="button"
                  className="tpTeamCard"
                  style={{ ['--tp-color' as string]: color }}
                  onClick={() => navigate(`/teams/${t.id}`)}
                >
                  <div className="tpTeamCard__logoWrap">
                    <SmartImg src={logo} alt={name} className="tpTeamCard__logo" loading="lazy" />
                  </div>
                  <span className="tpTeamCard__name">{name}</span>
                  <span className="tpTeamCard__accent" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
