import React, { useEffect, useState } from 'react';
import { Search, Edit2, Save, X, Plus, RotateCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import '../../styles/adminPanel.css';

type Tab = 'coaches' | 'teams' | 'fixtures' | 'submissions' | 'tools';

type Coach = {
  user_id: string;
  email: string;
  display_name?: string;
  psn?: string;
  team_id?: string;
  is_admin?: boolean;
};

type Team = {
  id: string;
  name: string;
  short_name?: string;
  team_key?: string;
  logo_url?: string;
};

type Fixture = {
  id: string;
  round: number;
  status: string;
  venue?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_goals?: number;
  home_behinds?: number;
  away_goals?: number;
  away_behinds?: number;
};

type Submission = {
  id: string;
  fixture_id: string;
  team_id: string;
  submitted_by: string;
  home_goals: number;
  home_behinds: number;
  away_goals: number;
  away_behinds: number;
  submitted_at: string;
};

export default function AdminPanelPage() {
  const [activeTab, setActiveTab] = useState<Tab>('coaches');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Coaches state
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);
  const [coachSearch, setCoachSearch] = useState('');
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editCoachData, setEditCoachData] = useState<Partial<Coach>>({});

  // Teams state
  const [teamsList, setTeamsList] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamData, setEditTeamData] = useState<Partial<Team>>({});

  // Fixtures state
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [createFixtureOpen, setCreateFixtureOpen] = useState(false);
  const [newFixture, setNewFixture] = useState({ round: 1, homeTeamId: '', awayTeamId: '', venue: '', status: 'SCHEDULED' });

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Load coaches
  const loadCoaches = async () => {
    setCoachesLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .order('email');
      if (err) throw err;
      setCoaches((data || []) as Coach[]);

      // Also load teams for dropdown
      const { data: teamsData, error: teamsErr } = await supabase.from('teams').select('*').order('name');
      if (teamsErr) throw teamsErr;
      setTeams((teamsData || []) as Team[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load coaches');
    } finally {
      setCoachesLoading(false);
    }
  };

  // Load teams
  const loadTeams = async () => {
    setTeamsLoading(true);
    try {
      const { data, error: err } = await supabase.from('teams').select('*').order('name');
      if (err) throw err;
      setTeamsList((data || []) as Team[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  // Load fixtures
  const loadFixtures = async () => {
    setFixturesLoading(true);
    try {
      const { data, error: err } = await supabase.from('eg_fixtures').select('*').order('round');
      if (err) throw err;
      setFixtures((data || []) as Fixture[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load fixtures');
    } finally {
      setFixturesLoading(false);
    }
  };

  // Load submissions
  const loadSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const { data, error: err } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false }).limit(50);
      if (err) throw err;
      setSubmissions((data || []) as Submission[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  // Tab load effects
  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
    if (activeTab === 'coaches') loadCoaches();
    else if (activeTab === 'teams') loadTeams();
    else if (activeTab === 'fixtures') loadFixtures();
    else if (activeTab === 'submissions') loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filteredCoaches = coaches.filter(
    (c) =>
      c.email.toLowerCase().includes(coachSearch.toLowerCase()) ||
      c.display_name?.toLowerCase().includes(coachSearch.toLowerCase()) ||
      c.psn?.toLowerCase().includes(coachSearch.toLowerCase()),
  );

  // Coach update handler
  const updateCoach = async (coachId: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('profiles').update(editCoachData).eq('user_id', coachId);
      if (err) throw err;
      setSuccessMsg('Coach updated');
      setEditingCoachId(null);
      loadCoaches();
    } catch (e: any) {
      setError(e?.message || 'Failed to update coach');
    }
  };

  // Team update handler
  const updateTeam = async (teamId: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('teams').update(editTeamData).eq('id', teamId);
      if (err) throw err;
      setSuccessMsg('Team updated');
      setEditingTeamId(null);
      loadTeams();
    } catch (e: any) {
      setError(e?.message || 'Failed to update team');
    }
  };

  // Create fixture handler
  const createFixture = async () => {
    try {
      setError(null);
      if (!newFixture.homeTeamId || !newFixture.awayTeamId) {
        throw new Error('Select both home and away teams');
      }
      if (newFixture.homeTeamId === newFixture.awayTeamId) {
        throw new Error('Home and away teams must be different');
      }

      const { error: err } = await supabase.from('eg_fixtures').insert({
        round: newFixture.round,
        home_team_id: newFixture.homeTeamId,
        away_team_id: newFixture.awayTeamId,
        venue: newFixture.venue,
        status: newFixture.status,
      });

      if (err) throw err;
      setSuccessMsg('Fixture created');
      setCreateFixtureOpen(false);
      setNewFixture({ round: 1, homeTeamId: '', awayTeamId: '', venue: '', status: 'SCHEDULED' });
      loadFixtures();
    } catch (e: any) {
      setError(e?.message || 'Failed to create fixture');
    }
  };

  // Force finalise fixture
  const finaliseFixture = async (fixtureId: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('eg_fixtures').update({ status: 'FINAL' }).eq('id', fixtureId);
      if (err) throw err;
      setSuccessMsg('Fixture finalised');
      loadFixtures();
    } catch (e: any) {
      setError(e?.message || 'Failed to finalise fixture');
    }
  };

  // Recompute ladder
  const recomputeLadder = async () => {
    try {
      setError(null);
      setLoading(true);
      const { error: err } = await supabase.rpc('eg_recompute_ladder');
      if (err) throw err;
      setSuccessMsg('Ladder recomputed');
    } catch (e: any) {
      setError(e?.message || 'Failed to recompute ladder');
    } finally {
      setLoading(false);
    }
  };

  // Recompute stats
  const recomputeStats = async () => {
    try {
      setError(null);
      setLoading(true);
      const { error: err } = await supabase.rpc('eg_recompute_stats');
      if (err) throw err;
      setSuccessMsg('Stats recomputed');
    } catch (e: any) {
      setError(e?.message || 'Failed to recompute stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminPanel">
      <header className="adminPanel__header">
        <div>
          <h1 className="adminPanel__title">Admin Panel</h1>
          <p className="adminPanel__subtitle">Manage coaches, teams, fixtures, and submissions</p>
        </div>
      </header>

      {error && (
        <div className="adminPanel__alert adminPanel__alert--error">
          <AlertCircle size={20} />
          {error}
          <button onClick={() => setError(null)} className="adminPanel__alertClose">
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="adminPanel__alert adminPanel__alert--success">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="adminPanel__alertClose">
            <X size={16} />
          </button>
        </div>
      )}

      <nav className="adminPanel__tabs">
        {(['coaches', 'teams', 'fixtures', 'submissions', 'tools'] as const).map((tab) => (
          <button
            key={tab}
            className={`adminPanel__tabBtn ${activeTab === tab ? 'isActive' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div className="adminPanel__content">
        {/* COACHES TAB */}
        {activeTab === 'coaches' && (
          <div>
            <div className="adminPanel__searchBox">
              <Search size={20} />
              <input
                type="text"
                placeholder="Search by email, name, or PSN…"
                value={coachSearch}
                onChange={(e) => setCoachSearch(e.target.value)}
              />
            </div>

            {coachesLoading ? (
              <div className="adminPanel__loading">Loading coaches…</div>
            ) : (
              <div className="adminPanel__list">
                {filteredCoaches.length === 0 ? (
                  <div className="adminPanel__empty">No coaches found</div>
                ) : (
                  filteredCoaches.map((coach) => (
                    <div key={coach.user_id} className="adminPanel__card">
                      {editingCoachId === coach.user_id ? (
                        <div className="adminPanel__editForm">
                          <input
                            type="text"
                            placeholder="Display Name"
                            value={editCoachData.display_name || ''}
                            onChange={(e) => setEditCoachData({ ...editCoachData, display_name: e.target.value })}
                          />
                          <input
                            type="text"
                            placeholder="PSN"
                            value={editCoachData.psn || ''}
                            onChange={(e) => setEditCoachData({ ...editCoachData, psn: e.target.value })}
                          />
                          <select
                            value={editCoachData.team_id || ''}
                            onChange={(e) => setEditCoachData({ ...editCoachData, team_id: e.target.value || undefined })}
                          >
                            <option value="">Unassigned</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <label className="adminPanel__checkbox">
                            <input
                              type="checkbox"
                              checked={editCoachData.is_admin || false}
                              onChange={(e) => setEditCoachData({ ...editCoachData, is_admin: e.target.checked })}
                            />
                            Admin
                          </label>
                          <div className="adminPanel__editActions">
                            <button onClick={() => updateCoach(coach.user_id)} className="adminPanel__btn adminPanel__btn--primary">
                              <Save size={16} /> Save
                            </button>
                            <button onClick={() => setEditingCoachId(null)} className="adminPanel__btn adminPanel__btn--secondary">
                              <X size={16} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="adminPanel__cardMain">
                            <div className="adminPanel__cardTitle">{coach.display_name || coach.email}</div>
                            <div className="adminPanel__cardMeta">
                              <div>{coach.email}</div>
                              <div>PSN: {coach.psn || 'N/A'}</div>
                              {coach.team_id && <div>Team: {teams.find((t) => t.id === coach.team_id)?.name || coach.team_id}</div>}
                              {coach.is_admin && <div style={{ color: '#f5c400' }}>✓ Admin</div>}
                            </div>
                          </div>
                          <button onClick={() => {
                            setEditCoachData(coach);
                            setEditingCoachId(coach.user_id);
                          }} className="adminPanel__btn adminPanel__btn--icon">
                            <Edit2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* TEAMS TAB */}
        {activeTab === 'teams' && (
          <div>
            {teamsLoading ? (
              <div className="adminPanel__loading">Loading teams…</div>
            ) : (
              <div className="adminPanel__list">
                {teamsList.length === 0 ? (
                  <div className="adminPanel__empty">No teams found</div>
                ) : (
                  teamsList.map((team) => (
                    <div key={team.id} className="adminPanel__card">
                      {editingTeamId === team.id ? (
                        <div className="adminPanel__editForm">
                          <input
                            type="text"
                            placeholder="Team Name"
                            value={editTeamData.name || ''}
                            onChange={(e) => setEditTeamData({ ...editTeamData, name: e.target.value })}
                          />
                          <input
                            type="text"
                            placeholder="Short Name"
                            value={editTeamData.short_name || ''}
                            onChange={(e) => setEditTeamData({ ...editTeamData, short_name: e.target.value })}
                          />
                          <input
                            type="text"
                            placeholder="Logo URL (from Assets bucket)"
                            value={editTeamData.logo_url || ''}
                            onChange={(e) => setEditTeamData({ ...editTeamData, logo_url: e.target.value })}
                          />
                          <div className="adminPanel__editActions">
                            <button onClick={() => updateTeam(team.id)} className="adminPanel__btn adminPanel__btn--primary">
                              <Save size={16} /> Save
                            </button>
                            <button onClick={() => setEditingTeamId(null)} className="adminPanel__btn adminPanel__btn--secondary">
                              <X size={16} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="adminPanel__cardMain">
                            {team.logo_url && <img src={team.logo_url} alt={team.name} className="adminPanel__teamLogo" />}
                            <div>
                              <div className="adminPanel__cardTitle">{team.name}</div>
                              <div className="adminPanel__cardMeta">
                                <div>{team.short_name} • {team.team_key}</div>
                              </div>
                            </div>
                          </div>
                          <button onClick={() => {
                            setEditTeamData(team);
                            setEditingTeamId(team.id);
                          }} className="adminPanel__btn adminPanel__btn--icon">
                            <Edit2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* FIXTURES TAB */}
        {activeTab === 'fixtures' && (
          <div>
            <button onClick={() => setCreateFixtureOpen(!createFixtureOpen)} className="adminPanel__btn adminPanel__btn--primary" style={{ marginBottom: 16 }}>
              <Plus size={16} /> Create Fixture
            </button>

            {createFixtureOpen && (
              <div className="adminPanel__createForm">
                <input type="number" placeholder="Round" value={newFixture.round} onChange={(e) => setNewFixture({ ...newFixture, round: parseInt(e.target.value) })} />
                <select
                  value={newFixture.homeTeamId}
                  onChange={(e) => setNewFixture({ ...newFixture, homeTeamId: e.target.value })}
                >
                  <option value="">Select Home Team</option>
                  {teamsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newFixture.awayTeamId}
                  onChange={(e) => setNewFixture({ ...newFixture, awayTeamId: e.target.value })}
                >
                  <option value="">Select Away Team</option>
                  {teamsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Venue"
                  value={newFixture.venue}
                  onChange={(e) => setNewFixture({ ...newFixture, venue: e.target.value })}
                />
                <select value={newFixture.status} onChange={(e) => setNewFixture({ ...newFixture, status: e.target.value })}>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="LIVE">LIVE</option>
                  <option value="FINAL">FINAL</option>
                </select>
                <div className="adminPanel__editActions">
                  <button onClick={createFixture} className="adminPanel__btn adminPanel__btn--primary">
                    <Plus size={16} /> Create
                  </button>
                  <button onClick={() => setCreateFixtureOpen(false)} className="adminPanel__btn adminPanel__btn--secondary">
                    <X size={16} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {fixturesLoading ? (
              <div className="adminPanel__loading">Loading fixtures…</div>
            ) : (
              <div className="adminPanel__list">
                {fixtures.length === 0 ? (
                  <div className="adminPanel__empty">No fixtures found</div>
                ) : (
                  fixtures.map((fx) => (
                    <div key={fx.id} className="adminPanel__card">
                      <div className="adminPanel__cardMain">
                        <div className="adminPanel__cardTitle">Round {fx.round}</div>
                        <div className="adminPanel__cardMeta">
                          <div>Status: {fx.status}</div>
                          <div>Venue: {fx.venue || 'N/A'}</div>
                          {fx.home_goals !== null && <div>Score: {fx.home_goals}.{fx.home_behinds} - {fx.away_goals}.{fx.away_behinds}</div>}
                        </div>
                      </div>
                      {fx.status !== 'FINAL' && (
                        <button onClick={() => finaliseFixture(fx.id)} className="adminPanel__btn adminPanel__btn--icon">
                          <Edit2 size={18} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* SUBMISSIONS TAB */}
        {activeTab === 'submissions' && (
          <div>
            {submissionsLoading ? (
              <div className="adminPanel__loading">Loading submissions…</div>
            ) : (
              <div className="adminPanel__list">
                {submissions.length === 0 ? (
                  <div className="adminPanel__empty">No submissions found</div>
                ) : (
                  submissions.map((sub) => (
                    <div key={sub.id} className="adminPanel__card">
                      <div className="adminPanel__cardMain">
                        <div className="adminPanel__cardTitle">Fixture {sub.fixture_id.slice(0, 8)}</div>
                        <div className="adminPanel__cardMeta">
                          <div>Score: {sub.home_goals}.{sub.home_behinds} - {sub.away_goals}.{sub.away_behinds}</div>
                          <div>Submitted: {new Date(sub.submitted_at).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* TOOLS TAB */}
        {activeTab === 'tools' && (
          <div className="adminPanel__tools">
            <div className="adminPanel__toolCard">
              <h3>Recompute Ladder</h3>
              <p>Recalculates the standings based on all FINAL fixtures.</p>
              <button onClick={recomputeLadder} disabled={loading} className="adminPanel__btn adminPanel__btn--primary">
                <RotateCw size={16} /> Recompute
              </button>
            </div>

            <div className="adminPanel__toolCard">
              <h3>Recompute Stats</h3>
              <p>Recalculates player statistics from submissions.</p>
              <button onClick={recomputeStats} disabled={loading} className="adminPanel__btn adminPanel__btn--primary">
                <RotateCw size={16} /> Recompute
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
