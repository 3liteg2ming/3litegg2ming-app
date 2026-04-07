import { clearAflPlayersCache, fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { getAfl26RoundsFromSupabase } from '../data/afl26Supabase';
import { resolveTeamLogoUrl } from './entityResolvers';
import { resolveKnownPlayerHeadshot } from './playerHeadshots';
import { clearStatLeadersCache, fetchLivePlayerMetrics, type PlayerMetricRow } from './stats-leaders-cache';

type TeamOfTournamentGroup = 'defenders' | 'midfielders' | 'rucks' | 'forwards';
type MetricKey = 'goals' | 'disposals' | 'marks' | 'tackles' | 'hitOuts' | 'fantasyPoints';

type PositionConfig = {
  group: TeamOfTournamentGroup;
  aliases: string[];
};

type MetricConfig = {
  key: MetricKey;
  label: string;
};

type WeightedMetric = {
  key: MetricKey;
  weight: number;
};

type GroupPickConfig = {
  count: number;
  primaryMetric: MetricConfig;
  weights: WeightedMetric[];
  positionBonus: number;
};

export type TotPlayer = {
  id: string;
  name: string;
  position: string;
  group: TeamOfTournamentGroup;
  teamName: string;
  teamKey: string;
  teamLogoUrl: string;
  photoUrl: string;
  statLabel: string;
  statValue: number;
  totals: Record<MetricKey, number>;
};

export type TeamOfTournamentSpecialist = {
  key: MetricKey;
  label: string;
  subtitle: string;
  player: TotPlayer | null;
};

export type TeamOfTournamentFieldRowKey = 'backLine' | 'halfBack' | 'centre' | 'followers' | 'halfForward' | 'forwardLine';

export type TeamOfTournamentFieldRow = {
  key: TeamOfTournamentFieldRowKey;
  label: string;
  slots: [string, string, string];
  players: Array<TotPlayer | null>;
};

export type TeamOfTournament = {
  completedRounds: number;
  selectionRound: number;
  defenders: TotPlayer[];
  midfielders: TotPlayer[];
  rucks: TotPlayer[];
  forwards: TotPlayer[];
  interchange: TotPlayer[];
  availableDefenders: TotPlayer[];
  availableMidfielders: TotPlayer[];
  availableRucks: TotPlayer[];
  availableForwards: TotPlayer[];
  availablePlayers: TotPlayer[];
  fieldLayout: TeamOfTournamentFieldRow[];
  specialists: TeamOfTournamentSpecialist[];
};

type Candidate = PlayerMetricRow & {
  primaryGroup: TeamOfTournamentGroup;
  eligibleGroups: TeamOfTournamentGroup[];
  aflPlayer: AflPlayer;
};

const POSITION_CONFIGS: PositionConfig[] = [
  { group: 'defenders', aliases: ['def', 'defender', 'back'] },
  { group: 'midfielders', aliases: ['mid', 'midfielder', 'wing', 'centre', 'center'] },
  { group: 'rucks', aliases: ['ruck', 'ruc'] },
  { group: 'forwards', aliases: ['fwd', 'forward'] },
];

const METRIC_LABELS: Record<MetricKey, string> = {
  goals: 'Goals',
  disposals: 'Disposals',
  marks: 'Marks',
  tackles: 'Tackles',
  hitOuts: 'Hit Outs',
  fantasyPoints: 'Fantasy Points',
};

const PLAYER_GROUP_OVERRIDES: Record<string, TeamOfTournamentGroup[]> = {
  /* ── Rucks ── */
  tristanxerri: ['rucks'],
  rowanmarshall: ['rucks'],
  maxgawn: ['rucks'],
  timenglish: ['rucks', 'forwards'],
  brodiegrundy: ['rucks'],
  seandarcy: ['rucks'],
  lukejackson: ['rucks', 'forwards'],
  jarrodwitts: ['rucks'],
  tobynankervis: ['rucks'],
  tomdekoning: ['rucks'],
  oscarmcinerney: ['rucks'],
  lloydmeek: ['rucks'],
  lukebriggs: ['rucks'],
  samdraper: ['rucks'],
  kierenbriggs: ['rucks'],
  lachlanmcandrew: ['rucks'],
  marcpittonet: ['rucks'],
  markblicavs: ['rucks', 'midfielders'],
  reillyobrien: ['rucks'],
  darcyfort: ['rucks'],
  ethanread: ['rucks'],
  baileywilliams: ['rucks'],
  samdarcy: ['forwards', 'rucks'],
  macandrew: ['rucks', 'defenders'],

  /* ── Midfielders ── */
  marcusbontempelli: ['midfielders'],
  nickdaicos: ['midfielders'],
  zakbutters: ['midfielders'],
  harrysheezel: ['midfielders'],
  errolgulden: ['midfielders'],
  claytonoliver: ['midfielders'],
  finncallaghan: ['midfielders'],
  jacksinclair: ['midfielders', 'defenders'],
  joshdaicos: ['midfielders'],
  baileysmith: ['midfielders'],
  christianpetracca: ['midfielders'],
  lukedaviesuniacke: ['midfielders'],
  willashcroft: ['midfielders'],
  lachieneale: ['midfielders'],
  jaspaletcher: ['midfielders'],
  colbymckercher: ['midfielders'],
  chadwarner: ['midfielders'],
  jackmacrae: ['midfielders'],
  hughmccluggage: ['midfielders'],
  georgewardlaw: ['midfielders'],
  joshdunkley: ['midfielders'],
  calebserong: ['midfielders'],
  jamesrowbottom: ['midfielders'],
  jainewcombe: ['midfielders'],
  andrewbrayshaw: ['midfielders'],
  jordandawson: ['midfielders', 'defenders'],
  jarrodberry: ['midfielders', 'defenders'],
  benkeays: ['midfielders'],
  matthewkennedy: ['midfielders'],
  noahanderson: ['midfielders'],
  mattrowell: ['midfielders'],
  toukmiller: ['midfielders'],
  callummills: ['midfielders'],
  willday: ['midfielders'],
  daynezerko: ['midfielders'],
  daynezorko: ['midfielders'],
  darcywilmot: ['midfielders'],
  tobybedford: ['midfielders'],
  danielrioli: ['midfielders', 'forwards'],
  angussheldrick: ['midfielders'],
  braedencampbell: ['midfielders'],
  tomgreen: ['midfielders'],
  malcolmrosas: ['midfielders'],
  mitchowens: ['midfielders'],

  /* ── Forwards ── */
  tobygreene: ['forwards'],
  tomlynch: ['forwards'],
  benking: ['forwards'],
  nicklarkey: ['forwards'],
  jackgunston: ['forwards'],
  aaronnaughton: ['forwards'],
  joshtreacy: ['forwards'],
  joelamartey: ['forwards'],
  kailohmann: ['forwards'],
  jakestringer: ['forwards'],
  loganmorris: ['forwards'],
  jakewaterman: ['forwards'],
  brentdaniels: ['forwards'],
  nickwatson: ['forwards'],
  shaibolton: ['forwards', 'midfielders'],
  isaacheeney: ['forwards', 'midfielders'],
  jessehogan: ['forwards'],
  oscarallen: ['forwards'],
  coopersharman: ['forwards'],
  tompapley: ['forwards'],
  charliecurnow: ['forwards'],
  jeremycameron: ['forwards'],
  loganmcdonald: ['forwards'],
  darcyfogarty: ['forwards'],
  aaroncadman: ['forwards'],
  haydenmclean: ['forwards', 'rucks'],
  mabiorchor: ['forwards'],
  mabiorchol: ['forwards'],
  jackginnivan: ['forwards'],
  dylanmoore: ['forwards'],
  jackhiggins: ['forwards'],
  liamryan: ['forwards'],
  erichipwood: ['forwards'],
  masonwood: ['forwards'],
  taylorwalker: ['forwards'],
  izakrankine: ['forwards'],
  paulcurtis: ['forwards'],
  jyeamiss: ['forwards'],
  grylanmiers: ['forwards'],
  gryanmiers: ['forwards'],
  jamesworpel: ['midfielders', 'forwards'],
  harryhimmelberg: ['forwards'],

  /* ── Defenders ── */
  nickblakey: ['defenders'],
  jamessicily: ['defenders'],
  callumwilkie: ['defenders'],
  samcollins: ['defenders'],
  rorylobb: ['defenders', 'rucks'],
  calebdaniel: ['defenders', 'midfielders'],
  jaydenlaverde: ['defenders'],
  aliiraliir: ['defenders'],
  danhouston: ['defenders', 'midfielders'],
  jaydenort: ['defenders'],
  edrichards: ['defenders'],
  joshworrell: ['defenders'],
  lachlanash: ['defenders'],
  harrisandrews: ['defenders'],
  samtaylor: ['defenders'],
  danerampe: ['defenders'],
  baileydale: ['defenders'],
  johnoble: ['defenders'],
  nasiahanganenmilera: ['defenders'],
  nasiahwanganeenmilera: ['defenders'],
  bradleyhill: ['defenders'],
  lachiewhitfield: ['defenders'],
  lachieash: ['defenders'],
  harveythomas: ['defenders'],
  markkeane: ['defenders'],
  darcygardiner: ['defenders'],
  tomstewart: ['defenders'],
  tomsteward: ['defenders'],
  tommccartin: ['defenders', 'rucks'],
  jarmanimpey: ['defenders'],
  jackpayne: ['defenders'],
};

const GROUP_PICK_CONFIG: Record<TeamOfTournamentGroup, GroupPickConfig> = {
  defenders: {
    count: 6,
    primaryMetric: { key: 'marks', label: 'Marks' },
    weights: [
      { key: 'marks', weight: 8 },
      { key: 'tackles', weight: 3 },
      { key: 'disposals', weight: 0.8 },
      { key: 'fantasyPoints', weight: 0.03 },
    ],
    positionBonus: 26,
  },
  midfielders: {
    count: 5,
    primaryMetric: { key: 'disposals', label: 'Disposals' },
    weights: [
      { key: 'disposals', weight: 4.2 },
      { key: 'tackles', weight: 1.8 },
      { key: 'fantasyPoints', weight: 0.04 },
      { key: 'marks', weight: 0.8 },
    ],
    positionBonus: 24,
  },
  rucks: {
    count: 1,
    primaryMetric: { key: 'hitOuts', label: 'Hit Outs' },
    weights: [
      { key: 'hitOuts', weight: 7.5 },
      { key: 'fantasyPoints', weight: 0.05 },
      { key: 'marks', weight: 0.6 },
      { key: 'disposals', weight: 0.4 },
    ],
    positionBonus: 16,
  },
  forwards: {
    count: 6,
    primaryMetric: { key: 'goals', label: 'Goals' },
    weights: [
      { key: 'goals', weight: 12 },
      { key: 'marks', weight: 1.1 },
      { key: 'fantasyPoints', weight: 0.03 },
      { key: 'disposals', weight: 0.35 },
    ],
    positionBonus: 24,
  },
};

const INTERCHANGE_CONFIG = {
  count: 5,
  metric: { key: 'fantasyPoints', label: 'Fantasy Points' } as const,
};

const SPECIALIST_CONFIGS: Array<{ key: MetricKey; label: string; subtitle: string }> = [
  { key: 'goals', label: 'Goal King', subtitle: 'Most goals kicked' },
  { key: 'disposals', label: 'Ball Magnet', subtitle: 'Most disposals' },
  { key: 'fantasyPoints', label: 'Fantasy Beast', subtitle: 'Highest fantasy points' },
];

const TTL_MS = 5 * 60_000;

let cachedResult: { at: number; value: TeamOfTournament } | null = null;
let pendingPromise: Promise<TeamOfTournament> | null = null;

type FetchTeamOfTournamentOptions = {
  force?: boolean;
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function tokenizePosition(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[\/,|-]/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getCandidateId(candidate: PlayerMetricRow | Candidate): string {
  return cleanText(candidate.playerId || candidate.id);
}

function normalizePersonToken(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function uniqueGroups(groups: TeamOfTournamentGroup[]): TeamOfTournamentGroup[] {
  return groups.filter((group, index, array) => array.indexOf(group) === index);
}

function resolveEligibleGroups(position: string | undefined): TeamOfTournamentGroup[] {
  const raw = cleanText(position).toLowerCase();
  if (!raw) return [];

  const tokens = tokenizePosition(raw);
  const groups: TeamOfTournamentGroup[] = [];

  const addGroup = (group: TeamOfTournamentGroup) => {
    if (!groups.includes(group)) groups.push(group);
  };

  const maybeMatchGroup = (value: string) => {
    for (const config of POSITION_CONFIGS) {
      if (config.aliases.some((alias) => value === alias || value.startsWith(alias) || value.includes(alias))) {
        addGroup(config.group);
      }
    }
  };

  if (tokens.length) {
    for (const token of tokens) maybeMatchGroup(token);
  }

  if (!groups.length) maybeMatchGroup(raw);

  return groups;
}

function resolveStatProfileGroups(metric: PlayerMetricRow): TeamOfTournamentGroup[] {
  const groups: TeamOfTournamentGroup[] = [];
  const goals = Number(metric.totals.goals || 0);
  const disposals = Number(metric.totals.disposals || 0);
  const marks = Number(metric.totals.marks || 0);
  const tackles = Number(metric.totals.tackles || 0);
  const hitOuts = Number(metric.totals.hitOuts || 0);
  const clearances = Number(metric.totals.clearances || 0);

  if (hitOuts >= 20) groups.push('rucks');
  if (goals >= 6 || (goals >= 4 && disposals <= 92)) groups.push('forwards');
  if (disposals >= 80 || tackles >= 14 || clearances >= 10) groups.push('midfielders');
  if (marks >= 10 && goals <= 4) groups.push('defenders');

  return uniqueGroups(groups);
}

function countCompletedRounds(rounds: Awaited<ReturnType<typeof getAfl26RoundsFromSupabase>>): number {
  return rounds.filter((round) => {
    const matches = Array.isArray(round.matches) ? round.matches : [];
    if (!matches.length) return false;
    return matches.every((match) => cleanText(match.status).toUpperCase() === 'FINAL');
  }).length;
}

function resolveSelectionRound(rounds: Awaited<ReturnType<typeof getAfl26RoundsFromSupabase>>): number {
  return rounds.reduce((latest, round) => {
    const hasResults = (round.matches || []).some((match) => cleanText(match.status).toUpperCase() === 'FINAL');
    return hasResults ? Math.max(latest, Number(round.round) || 0) : latest;
  }, 0);
}

function buildPlayerMap(players: AflPlayer[]): Map<string, AflPlayer> {
  const map = new Map<string, AflPlayer>();
  for (const player of players) {
    const id = cleanText(player.id);
    if (!id) continue;
    map.set(id, player);
  }
  return map;
}

function toCandidate(metric: PlayerMetricRow, playerMap: Map<string, AflPlayer>): Candidate | null {
  const aflPlayer = playerMap.get(cleanText(metric.playerId)) || playerMap.get(cleanText(metric.id));
  if (!aflPlayer) return null;

  const overrideGroups =
    PLAYER_GROUP_OVERRIDES[normalizePersonToken(metric.name)] ||
    PLAYER_GROUP_OVERRIDES[normalizePersonToken(aflPlayer.name)] ||
    [];
  const resolvedGroups = resolveEligibleGroups(aflPlayer.position);
  const statProfileGroups = resolveStatProfileGroups(metric);
  const eligibleGroups = uniqueGroups(
    overrideGroups.length
      ? overrideGroups
      : resolvedGroups.length
        ? resolvedGroups
        : statProfileGroups,
  );
  const primaryGroup = eligibleGroups[0] || resolvedGroups[0] || statProfileGroups[0] || 'midfielders';

  return {
    ...metric,
    primaryGroup,
    eligibleGroups,
    aflPlayer,
  };
}

function metricValue(candidate: Candidate, metric: MetricKey): number {
  return Number(candidate.totals[metric] || 0);
}

function compareCandidates(a: Candidate, b: Candidate, metric: MetricKey): number {
  const metricDiff = metricValue(b, metric) - metricValue(a, metric);
  if (Math.abs(metricDiff) > 0.0001) return metricDiff;

  const fantasyDiff = metricValue(b, 'fantasyPoints') - metricValue(a, 'fantasyPoints');
  if (Math.abs(fantasyDiff) > 0.0001) return fantasyDiff;

  const disposalDiff = metricValue(b, 'disposals') - metricValue(a, 'disposals');
  if (Math.abs(disposalDiff) > 0.0001) return disposalDiff;

  const markDiff = metricValue(b, 'marks') - metricValue(a, 'marks');
  if (Math.abs(markDiff) > 0.0001) return markDiff;

  const goalDiff = metricValue(b, 'goals') - metricValue(a, 'goals');
  if (Math.abs(goalDiff) > 0.0001) return goalDiff;

  return a.name.localeCompare(b.name);
}

function scoreCandidateForGroup(candidate: Candidate, group: TeamOfTournamentGroup): number {
  const config = GROUP_PICK_CONFIG[group];
  const metricScore = config.weights.reduce((sum, metric) => sum + metricValue(candidate, metric.key) * metric.weight, 0);
  const positionBoost = candidate.eligibleGroups.includes(group) ? config.positionBonus : 0;
  return metricScore + positionBoost;
}

function compareCandidatesForGroup(a: Candidate, b: Candidate, group: TeamOfTournamentGroup): number {
  const scoreDiff = scoreCandidateForGroup(b, group) - scoreCandidateForGroup(a, group);
  if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;

  const primaryMetric = GROUP_PICK_CONFIG[group].primaryMetric.key;
  return compareCandidates(a, b, primaryMetric);
}

function toTotPlayer(
  candidate: Candidate,
  statKey: MetricKey,
  statLabel: string,
  selectedGroup: TeamOfTournamentGroup = candidate.primaryGroup,
): TotPlayer {
  const teamKey = cleanText(candidate.teamKey || candidate.aflPlayer.teamKey) || 'unknown';
  const teamName = cleanText(candidate.teamName || candidate.aflPlayer.teamName) || 'Unknown Team';
  const playerName = cleanText(candidate.name || candidate.aflPlayer.name) || 'Unknown Player';

  return {
    id: getCandidateId(candidate),
    name: playerName,
    position: cleanText(candidate.aflPlayer.position) || selectedGroup,
    group: selectedGroup,
    teamName,
    teamKey,
    teamLogoUrl: resolveTeamLogoUrl({
      teamKey: teamKey || null,
      slug: teamKey || null,
      name: teamName || null,
      fallbackPath: 'elite-gaming-logo.png',
    }),
    photoUrl:
      resolveKnownPlayerHeadshot({
        name: playerName,
        photoUrl: candidate.photoUrl || candidate.aflPlayer.headshotUrl,
        headshotUrl: candidate.aflPlayer.headshotUrl,
      }) || '',
    statLabel,
    statValue: metricValue(candidate, statKey),
    totals: {
      goals: metricValue(candidate, 'goals'),
      disposals: metricValue(candidate, 'disposals'),
      marks: metricValue(candidate, 'marks'),
      tackles: metricValue(candidate, 'tackles'),
      hitOuts: metricValue(candidate, 'hitOuts'),
      fantasyPoints: metricValue(candidate, 'fantasyPoints'),
    },
  };
}

function rankGroupCandidates(candidates: Candidate[], group: TeamOfTournamentGroup): TotPlayer[] {
  const config = GROUP_PICK_CONFIG[group];
  const eligiblePool = candidates.filter((candidate) => {
    const playerId = getCandidateId(candidate);
    return Boolean(playerId) && candidate.eligibleGroups.includes(group);
  });
  const hasPrimaryMetricData = eligiblePool.some((candidate) => metricValue(candidate, config.primaryMetric.key) > 0);
  const useFallbackMetric = group === 'rucks' && !hasPrimaryMetricData;
  const statKey = useFallbackMetric ? INTERCHANGE_CONFIG.metric.key : config.primaryMetric.key;
  const statLabel = useFallbackMetric ? INTERCHANGE_CONFIG.metric.label : config.primaryMetric.label;
  const sortCandidates = (a: Candidate, b: Candidate) =>
    useFallbackMetric
      ? compareCandidates(a, b, INTERCHANGE_CONFIG.metric.key)
      : compareCandidatesForGroup(a, b, group);

  return [...eligiblePool].sort(sortCandidates).map((candidate) => toTotPlayer(candidate, statKey, statLabel, group));
}

function rankAllCandidates(candidates: Candidate[]): TotPlayer[] {
  const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, INTERCHANGE_CONFIG.metric.key));
  return sorted.map((candidate) => {
    const preferredGroup = candidate.primaryGroup || candidate.eligibleGroups[0] || 'midfielders';
    const config = GROUP_PICK_CONFIG[preferredGroup];
    const primaryMetric = metricValue(candidate, config.primaryMetric.key) > 0
      ? config.primaryMetric
      : INTERCHANGE_CONFIG.metric;
    return toTotPlayer(candidate, primaryMetric.key, primaryMetric.label, preferredGroup);
  });
}

function pickGroup(rankedPlayers: TotPlayer[], group: TeamOfTournamentGroup, selectedIds: Set<string>): TotPlayer[] {
  const config = GROUP_PICK_CONFIG[group];
  const out: TotPlayer[] = [];

  for (const player of rankedPlayers) {
    if (!player.id || selectedIds.has(player.id)) continue;
    selectedIds.add(player.id);
    out.push(player);
    if (out.length >= config.count) break;
  }

  return out;
}

function pickInterchange(candidates: Candidate[], selectedIds: Set<string>): TotPlayer[] {
  const pool = candidates.filter((candidate) => {
    const playerId = getCandidateId(candidate);
    return playerId && !selectedIds.has(playerId);
  });

  const sorted = [...pool].sort((a, b) => compareCandidates(a, b, INTERCHANGE_CONFIG.metric.key));
  const out: TotPlayer[] = [];

  for (const candidate of sorted) {
    const playerId = getCandidateId(candidate);
    if (!playerId || selectedIds.has(playerId)) continue;
    selectedIds.add(playerId);
    out.push(toTotPlayer(candidate, INTERCHANGE_CONFIG.metric.key, INTERCHANGE_CONFIG.metric.label));
    if (out.length >= INTERCHANGE_CONFIG.count) break;
  }

  return out;
}

function pickSpecialists(candidates: Candidate[]): TeamOfTournamentSpecialist[] {
  return SPECIALIST_CONFIGS.map((config) => {
    const leader = [...candidates].sort((a, b) => compareCandidates(a, b, config.key))[0] || null;
    return {
      key: config.key,
      label: config.label,
      subtitle: config.subtitle,
      player: leader ? toTotPlayer(leader, config.key, METRIC_LABELS[config.key]) : null,
    };
  });
}

function dedupeTotPlayers(players: TotPlayer[]): TotPlayer[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (!player.id || seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  });
}

export const TEAM_OF_TOURNAMENT_FIELD_ROWS: Array<Pick<TeamOfTournamentFieldRow, 'key' | 'label' | 'slots'>> = [
  { key: 'backLine', label: 'Back Line', slots: ['BP', 'FB', 'BP'] },
  { key: 'halfBack', label: 'Half Back', slots: ['HBF', 'CHB', 'HBF'] },
  { key: 'centre', label: 'Centre', slots: ['W', 'C', 'W'] },
  { key: 'followers', label: 'Followers', slots: ['ROV', 'RUC', 'RR'] },
  { key: 'halfForward', label: 'Half Forward', slots: ['HFF', 'CHF', 'HFF'] },
  { key: 'forwardLine', label: 'Forward Line', slots: ['FP', 'FF', 'FP'] },
];

function totalValue(player: TotPlayer | null | undefined, key: keyof TotPlayer['totals']) {
  return Number(player?.totals?.[key] || 0);
}

function sortPlayersByScore(players: TotPlayer[], score: (player: TotPlayer) => number) {
  return [...players].sort((a, b) => {
    const scoreDiff = score(b) - score(a);
    if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;

    const disposalDiff = totalValue(b, 'disposals') - totalValue(a, 'disposals');
    if (Math.abs(disposalDiff) > 0.0001) return disposalDiff;

    const fantasyDiff = totalValue(b, 'fantasyPoints') - totalValue(a, 'fantasyPoints');
    if (Math.abs(fantasyDiff) > 0.0001) return fantasyDiff;

    return a.name.localeCompare(b.name);
  });
}

function removePlayersFromPool(players: TotPlayer[], picked: Array<TotPlayer | null | undefined>) {
  const pickedIds = new Set(picked.filter(Boolean).map((player) => player!.id));
  return players.filter((player) => !pickedIds.has(player.id));
}

export function buildTeamOfTournamentFieldLayout(team: Pick<TeamOfTournament, 'defenders' | 'midfielders' | 'rucks' | 'forwards'>): TeamOfTournamentFieldRow[] {
  const defenderPool = [...team.defenders];
  const fullBack = sortPlayersByScore(defenderPool, (player) => totalValue(player, 'marks') * 2.4 + totalValue(player, 'tackles') * 1.25 + totalValue(player, 'fantasyPoints') * 0.02)[0] || null;
  const afterFullBack = removePlayersFromPool(defenderPool, [fullBack]);
  const centerHalfBack = sortPlayersByScore(afterFullBack, (player) => totalValue(player, 'marks') * 2.1 + totalValue(player, 'disposals') * 0.8 + totalValue(player, 'tackles') * 1.15)[0] || null;
  const afterKeyBacks = removePlayersFromPool(afterFullBack, [centerHalfBack]);
  const halfBacks = sortPlayersByScore(afterKeyBacks, (player) => totalValue(player, 'disposals') * 2.35 + totalValue(player, 'marks') * 1.05 + totalValue(player, 'fantasyPoints') * 0.03).slice(0, 2);
  const backPockets = sortPlayersByScore(removePlayersFromPool(afterKeyBacks, halfBacks), (player) => totalValue(player, 'marks') * 1.7 + totalValue(player, 'tackles') * 1.1 + totalValue(player, 'fantasyPoints') * 0.02).slice(0, 2);

  const midfielders = sortPlayersByScore([...team.midfielders], (player) => totalValue(player, 'disposals') * 3 + totalValue(player, 'tackles') * 1.2 + totalValue(player, 'fantasyPoints') * 0.03);
  const centre = midfielders[0] || null;
  const rover = midfielders[1] || null;
  const ruckRover = midfielders[2] || null;
  const wings = midfielders.slice(3, 5);

  const forwardPool = [...team.forwards];
  const fullForward = sortPlayersByScore(forwardPool, (player) => totalValue(player, 'goals') * 3.2 + totalValue(player, 'marks') * 1.2 + totalValue(player, 'fantasyPoints') * 0.02)[0] || null;
  const afterFullForward = removePlayersFromPool(forwardPool, [fullForward]);
  const centerHalfForward = sortPlayersByScore(afterFullForward, (player) => totalValue(player, 'marks') * 2 + totalValue(player, 'goals') * 2.2 + totalValue(player, 'disposals') * 0.75)[0] || null;
  const afterKeyForwards = removePlayersFromPool(afterFullForward, [centerHalfForward]);
  const halfForwards = sortPlayersByScore(afterKeyForwards, (player) => totalValue(player, 'disposals') * 1.6 + totalValue(player, 'marks') * 1.15 + totalValue(player, 'goals') * 1.1).slice(0, 2);
  const forwardPockets = sortPlayersByScore(removePlayersFromPool(afterKeyForwards, halfForwards), (player) => totalValue(player, 'goals') * 2.5 + totalValue(player, 'fantasyPoints') * 0.02 + totalValue(player, 'disposals') * 0.4).slice(0, 2);

  return [
    { key: 'backLine', label: 'Back Line', slots: ['BP', 'FB', 'BP'], players: [backPockets[0] || null, fullBack, backPockets[1] || null] },
    { key: 'halfBack', label: 'Half Back', slots: ['HBF', 'CHB', 'HBF'], players: [halfBacks[0] || null, centerHalfBack, halfBacks[1] || null] },
    { key: 'centre', label: 'Centre', slots: ['W', 'C', 'W'], players: [wings[0] || null, centre, wings[1] || null] },
    { key: 'followers', label: 'Followers', slots: ['ROV', 'RUC', 'RR'], players: [rover, team.rucks[0] || null, ruckRover] },
    { key: 'halfForward', label: 'Half Forward', slots: ['HFF', 'CHF', 'HFF'], players: [halfForwards[0] || null, centerHalfForward, halfForwards[1] || null] },
    { key: 'forwardLine', label: 'Forward Line', slots: ['FP', 'FF', 'FP'], players: [forwardPockets[0] || null, fullForward, forwardPockets[1] || null] },
  ];
}

async function buildTeamOfTournament(): Promise<TeamOfTournament> {
  const [metrics, players, rounds] = await Promise.all([
    fetchLivePlayerMetrics(),
    fetchAflPlayers(),
    getAfl26RoundsFromSupabase().catch(() => []),
  ]);

  const playerMap = buildPlayerMap(players);
  const candidates = metrics
    .map((metric) => toCandidate(metric, playerMap))
    .filter((candidate): candidate is Candidate => Boolean(candidate));

  const availableDefenders = rankGroupCandidates(candidates, 'defenders');
  const availableMidfielders = rankGroupCandidates(candidates, 'midfielders');
  const availableRucks = rankGroupCandidates(candidates, 'rucks');
  const availableForwards = rankGroupCandidates(candidates, 'forwards');
  const availablePool = rankAllCandidates(candidates);

  const selectedIds = new Set<string>();
  const rucks = pickGroup(availableRucks, 'rucks', selectedIds);
  const forwards = pickGroup(availableForwards, 'forwards', selectedIds);
  const midfielders = pickGroup(availableMidfielders, 'midfielders', selectedIds);
  const defenders = pickGroup(availableDefenders, 'defenders', selectedIds);
  const interchange = pickInterchange(candidates, selectedIds);
  const fieldLayout = buildTeamOfTournamentFieldLayout({ defenders, midfielders, rucks, forwards });

  return {
    completedRounds: countCompletedRounds(rounds),
    selectionRound: resolveSelectionRound(rounds),
    defenders,
    midfielders,
    rucks,
    forwards,
    interchange,
    availableDefenders,
    availableMidfielders,
    availableRucks,
    availableForwards,
    availablePlayers: dedupeTotPlayers(availablePool),
    fieldLayout,
    specialists: pickSpecialists(candidates),
  };
}

export function clearTeamOfTournamentCache() {
  cachedResult = null;
  pendingPromise = null;
}

export async function fetchTeamOfTournamentFresh(): Promise<TeamOfTournament> {
  clearStatLeadersCache();
  clearTeamOfTournamentCache();
  clearAflPlayersCache();
  return fetchTeamOfTournament();
}

export async function fetchTeamOfTournament(options: FetchTeamOfTournamentOptions = {}): Promise<TeamOfTournament> {
  if (options.force) {
    return fetchTeamOfTournamentFresh();
  }

  if (cachedResult && Date.now() - cachedResult.at < TTL_MS) {
    return cachedResult.value;
  }

  if (pendingPromise) return pendingPromise;

  pendingPromise = buildTeamOfTournament()
    .then((value) => {
      cachedResult = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pendingPromise = null;
    });

  return pendingPromise;
}
