import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  User,
  Users,
} from 'lucide-react';

import {
  applyBest23Override,
  BEST23_CONTENT_KEY,
  buildBest23OverridePayload,
  fetchBest23Override,
  saveBest23Override,
} from '../../../lib/best23Repo';
import {
  fetchTeamOfTournament,
  type TeamOfTournament,
  type TeamOfTournamentFieldRow,
  type TeamOfTournamentFieldRowKey,
  type TotPlayer,
} from '../../../lib/teamOfTournament';
import SmartImg from '../../../components/SmartImg';
import { TEAM_ASSETS, assetUrl, type TeamKey } from '../../../lib/teamAssets';
import { useAdminLayoutContext } from '../AdminLayout';
import { AdminCard } from './AdminUi';
import '../../../styles/admin-best-team.css';

type RoleFilter = 'all' | 'defenders' | 'midfielders' | 'rucks' | 'forwards';
type SortMode = 'fit' | 'stat' | 'alpha';

type SelectedSlot =
  | { section: 'field'; rowKey: TeamOfTournamentFieldRowKey; rowIndex: number; slotIndex: number }
  | { section: 'interchange'; index: number };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function roleColor(group?: string) {
  switch (group) {
    case 'defenders': return '#63a9ff';
    case 'midfielders': return '#f2c450';
    case 'rucks': return '#c58cff';
    case 'forwards': return '#ff9d59';
    default: return '#90a5c8';
  }
}

function roleLabel(group?: string) {
  switch (group) {
    case 'defenders': return 'DEF';
    case 'midfielders': return 'MID';
    case 'rucks': return 'RUC';
    case 'forwards': return 'FWD';
    default: return '';
  }
}

function total(player: TotPlayer | null | undefined, key: keyof TotPlayer['totals']) {
  return Number(player?.totals?.[key] || 0);
}

function compactStatLabel(label: string) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('fantasy')) return 'FPTS';
  if (normalized.includes('disposal')) return 'DISP';
  if (normalized.includes('mark')) return 'MRK';
  if (normalized.includes('goal')) return 'GLS';
  if (normalized.includes('hit out')) return 'HO';
  if (normalized.includes('tackle')) return 'TKL';
  return String(label || '').toUpperCase();
}

function teamLogo(teamKey: string) {
  const t = TEAM_ASSETS[teamKey as TeamKey];
  return t ? assetUrl(t.logoFile ?? '') : '';
}

function cloneTeam(team: TeamOfTournament): TeamOfTournament {
  return {
    ...team,
    fieldLayout: team.fieldLayout.map((row) => ({ ...row, players: [...row.players] })),
    interchange: [...team.interchange],
  };
}

function flattenFieldPlayers(fieldLayout: TeamOfTournamentFieldRow[]): TotPlayer[] {
  return fieldLayout.flatMap((row) => row.players).filter((player): player is TotPlayer => Boolean(player));
}

function getSelectedPlayers(team: TeamOfTournament): TotPlayer[] {
  return [...flattenFieldPlayers(team.fieldLayout), ...team.interchange].filter(Boolean);
}

function syncDerivedGroups(team: TeamOfTournament): TeamOfTournament {
  const fieldPlayers = flattenFieldPlayers(team.fieldLayout);
  return {
    ...team,
    defenders: fieldPlayers.filter((player) => player.group === 'defenders'),
    midfielders: fieldPlayers.filter((player) => player.group === 'midfielders'),
    rucks: fieldPlayers.filter((player) => player.group === 'rucks'),
    forwards: fieldPlayers.filter((player) => player.group === 'forwards'),
  };
}

function readSlotPlayer(team: TeamOfTournament, slot: SelectedSlot | null): TotPlayer | null {
  if (!slot) return null;
  if (slot.section === 'interchange') return team.interchange[slot.index] || null;
  return team.fieldLayout[slot.rowIndex]?.players?.[slot.slotIndex] || null;
}

function slotPreferredRole(slot: SelectedSlot | null): RoleFilter {
  if (!slot) return 'all';
  if (slot.section === 'interchange') return 'all';
  if (slot.rowKey === 'backLine' || slot.rowKey === 'halfBack') return 'defenders';
  if (slot.rowKey === 'halfForward' || slot.rowKey === 'forwardLine') return 'forwards';
  if (slot.rowKey === 'centre') return 'midfielders';
  if (slot.rowKey === 'followers') return slot.slotIndex === 1 ? 'rucks' : 'midfielders';
  return 'all';
}

function getTeamFingerprint(team: TeamOfTournament | null) {
  if (!team) return '';
  return JSON.stringify(buildBest23OverridePayload(team));
}

function MiniStatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="abt-miniStat">
      <span className="abt-miniStat__label">{label}</span>
      <div className="abt-miniStat__bar">
        <div className="abt-miniStat__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="abt-miniStat__value">{value}</span>
    </div>
  );
}

export default function AdminBestTeam() {
  const { pushToast } = useAdminLayoutContext();
  const [autoTeam, setAutoTeam] = useState<TeamOfTournament | null>(null);
  const [team, setTeam] = useState<TeamOfTournament | null>(null);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('fit');

  const load = useCallback(async (force = true) => {
    setIsLoading(true);
    setSaveState('idle');
    try {
      const [baseTeam, override] = await Promise.all([
        fetchTeamOfTournament({ force }),
        fetchBest23Override().catch(() => null),
      ]);
      const resolved = applyBest23Override(baseTeam, override);
      const nextTeam = cloneTeam(resolved);
      setAutoTeam(baseTeam);
      setTeam(nextTeam);
      setLastSavedFingerprint(getTeamFingerprint(nextTeam));
    } catch (error) {
      console.error(error);
      pushToast('Failed to load Best 23 data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRoleFilter(slotPreferredRole(selectedSlot));
  }, [selectedSlot]);

  const usedIds = useMemo(() => {
    if (!team) return new Set<string>();
    const currentSelectedId = readSlotPlayer(team, selectedSlot)?.id;
    const ids = new Set<string>();
    for (const player of getSelectedPlayers(team)) {
      if (!player?.id || player.id === currentSelectedId) continue;
      ids.add(player.id);
    }
    return ids;
  }, [team, selectedSlot]);

  const maxStats = useMemo(() => {
    if (!team) return { goals: 1, disposals: 1, marks: 1, tackles: 1, hitOuts: 1, fantasyPoints: 1 };
    const all = team.availablePlayers;
    return {
      goals: Math.max(1, ...all.map((player) => total(player, 'goals'))),
      disposals: Math.max(1, ...all.map((player) => total(player, 'disposals'))),
      marks: Math.max(1, ...all.map((player) => total(player, 'marks'))),
      tackles: Math.max(1, ...all.map((player) => total(player, 'tackles'))),
      hitOuts: Math.max(1, ...all.map((player) => total(player, 'hitOuts'))),
      fantasyPoints: Math.max(1, ...all.map((player) => total(player, 'fantasyPoints'))),
    };
  }, [team]);

  const selectedPlayer = team ? readSlotPlayer(team, selectedSlot) : null;
  const hasUnsavedChanges = useMemo(() => getTeamFingerprint(team) !== lastSavedFingerprint, [team, lastSavedFingerprint]);

  const squadCounts = useMemo(() => {
    if (!team) return [] as Array<{ key: string; label: string; count: number; color: string }>;
    const selected = getSelectedPlayers(team);
    const counts: Record<string, number> = { defenders: 0, midfielders: 0, rucks: 0, forwards: 0 };
    for (const player of selected) counts[player.group] = (counts[player.group] || 0) + 1;
    return [
      { key: 'defenders', label: 'Defenders', count: counts.defenders, color: roleColor('defenders') },
      { key: 'midfielders', label: 'Midfielders', count: counts.midfielders, color: roleColor('midfielders') },
      { key: 'rucks', label: 'Rucks', count: counts.rucks, color: roleColor('rucks') },
      { key: 'forwards', label: 'Forwards', count: counts.forwards, color: roleColor('forwards') },
    ];
  }, [team]);

  const clubSummary = useMemo(() => {
    if (!team) return [] as Array<{ label: string; count: number; logo: string }>;
    const counts = new Map<string, { label: string; count: number; logo: string }>();
    for (const player of getSelectedPlayers(team)) {
      const key = player.teamKey || player.teamName;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          label: TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName,
          count: 1,
          logo: teamLogo(player.teamKey),
        });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);
  }, [team]);

  const candidatePool = useMemo(() => {
    if (!team) return [] as TotPlayer[];
    const preferred = slotPreferredRole(selectedSlot);
    const term = searchTerm.trim().toLowerCase();

    const pool = team.availablePlayers.filter((player) => !usedIds.has(player.id));
    const filtered = pool.filter((player) => {
      const matchesRole = roleFilter === 'all' ? true : player.group === roleFilter;
      const matchesSearch = !term
        ? true
        : [player.name, player.teamName, player.position, player.group, player.statLabel]
            .join(' ')
            .toLowerCase()
            .includes(term);
      return matchesRole && matchesSearch;
    });

    const score = (player: TotPlayer) => {
      const fitBonus = preferred !== 'all' && player.group === preferred ? 100000 : 0;
      const hybridBonus = preferred !== 'all' && player.position.includes('/') ? 2500 : 0;
      let statScore: number;
      switch (preferred) {
        case 'forwards':
          statScore = total(player, 'goals') * 50 + total(player, 'fantasyPoints') * 0.5 + total(player, 'marks') * 2;
          break;
        case 'defenders':
          statScore = total(player, 'fantasyPoints') * 1.5 + total(player, 'marks') * 20 + total(player, 'disposals') * 2;
          break;
        case 'midfielders':
          statScore = total(player, 'disposals') * 10 + total(player, 'fantasyPoints') * 1.2 + total(player, 'tackles') * 3;
          break;
        case 'rucks':
          statScore = total(player, 'hitOuts') * 15 + total(player, 'fantasyPoints') * 0.8;
          break;
        default:
          statScore = player.statValue * 10 + total(player, 'fantasyPoints');
      }
      return fitBonus + hybridBonus + statScore;
    };

    return [...filtered].sort((a, b) => {
      if (sortMode === 'alpha') return a.name.localeCompare(b.name);
      if (sortMode === 'stat') {
        const statDiff = b.statValue - a.statValue;
        if (statDiff !== 0) return statDiff;
      }
      const scoreDiff = score(b) - score(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name);
    });
  }, [roleFilter, searchTerm, selectedSlot, sortMode, team, usedIds]);

  const replaceSelected = (player: TotPlayer) => {
    if (!team || !selectedSlot) return;
    const next = cloneTeam(team);
    if (selectedSlot.section === 'interchange') {
      next.interchange[selectedSlot.index] = player;
    } else {
      next.fieldLayout[selectedSlot.rowIndex].players[selectedSlot.slotIndex] = player;
    }
    setTeam(syncDerivedGroups(next));
    setSelectedSlot(null);
    setSearchTerm('');
    setSaveState('idle');
  };

  const resetToAuto = () => {
    if (!autoTeam) return;
    const resetTeam = cloneTeam(autoTeam);
    setTeam(resetTeam);
    setSelectedSlot(null);
    setSearchTerm('');
    setSaveState('idle');
    pushToast('Reset back to the auto Best 23', 'success');
  };

  const refreshFromStats = async () => {
    setSelectedSlot(null);
    setSearchTerm('');
    await load(true);
  };

  const saveCurrentTeam = async () => {
    if (!team) return;
    setSaveState('saving');
    try {
      await saveBest23Override(buildBest23OverridePayload(team));
      const nextFingerprint = getTeamFingerprint(team);
      setLastSavedFingerprint(nextFingerprint);
      setSaveState('saved');
      pushToast(`Saved ${BEST23_CONTENT_KEY}`, 'success');
    } catch (error) {
      console.error(error);
      setSaveState('error');
      pushToast('Failed to save Best 23', 'error');
    }
  };

  if (isLoading && !team) {
    return (
      <AdminCard title="Best 23 Team Manager" subtitle="Secure, premium honour side editor">
        <div className="abt-shell abt-shell--loading">Loading Best 23 data…</div>
      </AdminCard>
    );
  }

  if (!team) {
    return (
      <AdminCard title="Best 23 Team Manager" subtitle="Secure, premium honour side editor">
        <div className="abt-shell abt-shell--loading">Unable to load Best 23 data.</div>
      </AdminCard>
    );
  }

  return (
    <AdminCard title="Best 23 Team Manager" subtitle="Round-driven honour side editor with full player pool access">
      <div className="abt-shell">
        <section className="abt-hero">
          <div>
            <span className="abt-kicker">SuperCoach-style builder</span>
            <h2>Best 23 Manager</h2>
            <p>Round {team.selectionRound} selection. The builder now uses position-aware eligibility and exposes the full player pool for manual swaps.</p>
          </div>
          <div className="abt-hero__actions">
            <button type="button" className="abt-btn abt-btn--ghost" onClick={refreshFromStats} disabled={isLoading}>
              <Sparkles size={15} /> Refresh
            </button>
            <button type="button" className="abt-btn abt-btn--ghost" onClick={resetToAuto}>
              <RefreshCcw size={15} /> Reset
            </button>
            <button type="button" className="abt-btn abt-btn--primary" onClick={saveCurrentTeam} disabled={saveState === 'saving'}>
              <Save size={15} /> {saveState === 'saving' ? 'Saving…' : 'Publish'}
            </button>
          </div>
        </section>

        <section className="abt-statusBar">
          <div className="abt-pill">Round {team.selectionRound}</div>
          <div className="abt-pill">23 selected</div>
          <div className="abt-pill">{team.availablePlayers.length} players in pool</div>
          <div className={`abt-pill abt-pill--status abt-pill--${saveState}`}>
            {saveState === 'saved' ? <Check size={14} /> : saveState === 'error' ? <AlertCircle size={14} /> : <Users size={14} />}
            {saveState === 'saved' ? 'Published' : saveState === 'error' ? 'Save failed' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved draft'}
          </div>
        </section>

        <section className="abt-summaryStrip">
          <div className="abt-spreadRow">
            {squadCounts.map((item) => (
              <span key={item.key} className="abt-rolePill" style={{ borderColor: `${item.color}55`, color: item.color, background: `${item.color}18` }}>
                {roleLabel(item.key)} {item.count}
              </span>
            ))}
            <span className="abt-spreadDivider" />
            {clubSummary.map((club) => (
              <span key={club.label} className="abt-clubChip">
                {club.logo ? <SmartImg src={club.logo} alt="" className="abt-clubChip__logo" /> : null}
                {club.label} <b>{club.count}</b>
              </span>
            ))}
          </div>
        </section>

        <div className="abt-grid">
          <aside className="abt-panel abt-panel--picker">
            <div className="abt-panel__header">
              <div>
                <span className="abt-panel__eyebrow">Player pool</span>
                <h3>{selectedPlayer ? selectedPlayer.name : 'Choose a slot'}</h3>
              </div>
              {selectedPlayer ? (
                <span className="abt-roleTag" style={{ background: `${roleColor(selectedPlayer.group)}22`, color: roleColor(selectedPlayer.group), borderColor: `${roleColor(selectedPlayer.group)}44` }}>
                  {roleLabel(selectedPlayer.group)}
                </span>
              ) : null}
            </div>

            <div className="abt-slotSummary">
              <div>
                <span className="abt-slotSummary__label">Active slot</span>
                <strong>
                  {selectedSlot?.section === 'field'
                    ? `${team.fieldLayout[selectedSlot.rowIndex]?.label || 'Field'} · ${team.fieldLayout[selectedSlot.rowIndex]?.slots[selectedSlot.slotIndex] || ''}`
                    : selectedSlot?.section === 'interchange'
                      ? `Interchange ${Number(selectedSlot.index) + 1}`
                      : 'Tap any card on the board'}
                </strong>
                {selectedPlayer ? <span className="abt-slotSummary__sub">Current: {selectedPlayer.name} · {selectedPlayer.position || roleLabel(selectedPlayer.group)}</span> : null}
              </div>
              <span className="abt-slotSummary__role">{slotPreferredRole(selectedSlot) === 'all' ? 'Any' : roleLabel(slotPreferredRole(selectedSlot))}</span>
            </div>

            <label className="abt-searchWrap">
              <Search size={15} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, club, role…" />
            </label>

            <div className="abt-filterRow">
              {(['all', 'defenders', 'midfielders', 'rucks', 'forwards'] as RoleFilter[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`abt-chipBtn ${roleFilter === role ? 'is-active' : ''}`}
                  style={roleFilter === role && role !== 'all' ? { borderColor: `${roleColor(role)}55`, color: roleColor(role) } : undefined}
                  onClick={() => setRoleFilter(role)}
                >
                  {role === 'all' ? 'All' : roleLabel(role)}
                </button>
              ))}
            </div>

            <div className="abt-sortRow">
              <button type="button" className={`abt-sortBtn ${sortMode === 'fit' ? 'is-active' : ''}`} onClick={() => setSortMode('fit')}>Best fit</button>
              <button type="button" className={`abt-sortBtn ${sortMode === 'stat' ? 'is-active' : ''}`} onClick={() => setSortMode('stat')}>Stat</button>
              <button type="button" className={`abt-sortBtn ${sortMode === 'alpha' ? 'is-active' : ''}`} onClick={() => setSortMode('alpha')}>A–Z</button>
            </div>

            <div className="abt-candidateList">
              {candidatePool.map((player) => {
                const logo = teamLogo(player.teamKey);
                return (
                  <button
                    key={player.id}
                    type="button"
                    className="abt-candidate"
                    style={{ ['--abt-accent' as string]: roleColor(player.group) }}
                    onClick={() => replaceSelected(player)}
                    disabled={!selectedSlot}
                  >
                    <div className="abt-candidate__left">
                      <div className="abt-candidate__avatar">
                        {player.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={16} />}
                      </div>
                      {logo ? <SmartImg src={logo} alt="" className="abt-candidate__clubBadge" /> : null}
                    </div>
                    <div className="abt-candidate__body">
                      <div className="abt-candidate__titleRow">
                        <strong>{player.name}</strong>
                        <span className="abt-candidate__roleTag" style={{ color: roleColor(player.group) }}>{roleLabel(player.group)}</span>
                      </div>
                      <div className="abt-candidate__meta">{TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName} · {player.position || roleLabel(player.group)}</div>
                      <div className="abt-candidate__statBars">
                        <MiniStatBar label="GLS" value={total(player, 'goals')} max={maxStats.goals} />
                        <MiniStatBar label="DIS" value={total(player, 'disposals')} max={maxStats.disposals} />
                        <MiniStatBar label="MRK" value={total(player, 'marks')} max={maxStats.marks} />
                        <MiniStatBar label="TKL" value={total(player, 'tackles')} max={maxStats.tackles} />
                        <MiniStatBar label="FPT" value={total(player, 'fantasyPoints')} max={maxStats.fantasyPoints} />
                      </div>
                    </div>
                  </button>
                );
              })}
              {!selectedSlot ? <div className="abt-empty">Select a field or interchange slot first.</div> : null}
              {selectedSlot && !candidatePool.length ? <div className="abt-empty">No available players for the current filters.</div> : null}
            </div>
          </aside>

          <section className="abt-panel abt-panel--board">
            <div className="abt-boardTop">
              <div>
                <span className="abt-panel__eyebrow">Tactical board</span>
                <h3>Field layout</h3>
              </div>
              <span className="abt-boardTop__meta">Tap any card to replace</span>
            </div>

            <div className="abt-ovalBoard">
              <div className="abt-ovalBoard__surface">
                {team.fieldLayout.map((row, rowIndex) => (
                  <div key={row.key} className="abt-lineGroup">
                    <div className="abt-lineLabel">{row.label}</div>
                    <div className="abt-lineRow">
                      {row.players.map((player, slotIndex) => {
                        const active = selectedSlot?.section === 'field' && selectedSlot.rowIndex === rowIndex && selectedSlot.slotIndex === slotIndex;
                        const logo = player ? teamLogo(player.teamKey) : '';
                        return (
                          <button
                            key={`${row.key}-${slotIndex}`}
                            type="button"
                            className={`abt-slotCard ${active ? 'is-active' : ''}`}
                            style={{ ['--abt-accent' as string]: roleColor(player?.group) }}
                            onClick={() => setSelectedSlot({ section: 'field', rowKey: row.key, rowIndex, slotIndex })}
                          >
                            <span className="abt-slotCard__slot">{row.slots[slotIndex]}</span>
                            <div className="abt-slotCard__avatarWrap">
                              <div className="abt-slotCard__avatar">
                                {player?.photoUrl ? <img src={player.photoUrl} alt={player.name} /> : <User size={18} />}
                              </div>
                              {player && logo ? <SmartImg src={logo} alt="" className="abt-slotCard__clubBadge" /> : null}
                            </div>
                            <strong>{player ? player.name.split(' ').slice(-1)[0] : 'Select'}</strong>
                            <span className="abt-slotCard__teamName">{player ? (TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName.split(' ')[0]) : 'Empty'}</span>
                            {player ? <span className="abt-slotCard__position">{player.position || roleLabel(player.group)}</span> : null}
                            {player ? <em>{player.statValue} {compactStatLabel(player.statLabel)}</em> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="abt-panel abt-panel--bench">
            <div className="abt-panel__header">
              <div>
                <span className="abt-panel__eyebrow">Depth</span>
                <h3>Interchange</h3>
              </div>
              <span className="abt-panel__meta">{team.interchange.length}/5</span>
            </div>

            <div className="abt-benchList">
              {team.interchange.map((player, index) => {
                const active = selectedSlot?.section === 'interchange' && selectedSlot.index === index;
                const logo = teamLogo(player.teamKey);
                return (
                  <button
                    key={`${player.id}-${index}`}
                    type="button"
                    className={`abt-benchCard ${active ? 'is-active' : ''}`}
                    style={{ ['--abt-accent' as string]: roleColor(player.group) }}
                    onClick={() => setSelectedSlot({ section: 'interchange', index })}
                  >
                    <div className="abt-benchCard__top">
                      <span>INT {index + 1}</span>
                      <span className="abt-benchCard__roleTag" style={{ color: roleColor(player.group) }}>{roleLabel(player.group)}</span>
                    </div>
                    <div className="abt-benchCard__playerRow">
                      {logo ? <SmartImg src={logo} alt="" className="abt-benchCard__clubBadge" /> : null}
                      <div>
                        <strong>{player.name}</strong>
                        <span>{TEAM_ASSETS[player.teamKey as TeamKey]?.shortName || player.teamName}</span>
                      </div>
                    </div>
                    <span className="abt-benchCard__position">{player.position || roleLabel(player.group)}</span>
                    <em>{player.statValue} {compactStatLabel(player.statLabel)}</em>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </AdminCard>
  );
}
