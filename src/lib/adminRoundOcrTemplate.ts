import { listPlayersForTeam } from './adminApi';

type RoundFixture = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
};

type TeamMeta = { slug: string; label: string };

type RosterPlayer = {
  id: string;
  name: string | null;
  display_name: string | null;
  afl_player_id: number | null;
};

export type RoundOcrTemplate = {
  round: number;
  matchups: Array<{
    fixtureId: string;
    homeTeamName: string;
    awayTeamName: string;
    homeTeamSlug: string;
    awayTeamSlug: string;
    playerStats: Array<{
      teamSlug: string;
      playerRef: { playerId: string; aflPlayerId?: number; playerName: string };
      kicks: null;
      handballs: null;
      disposals: null;
      marks: null;
      tackles: null;
      fantasyPoints: null;
    }>;
  }>;
};

export type BuildRoundOcrTemplateResult = {
  json: string;
  template: RoundOcrTemplate;
  skipped: Array<{ fixtureId: string; reason: string }>;
};

export async function buildRoundOcrTemplate(args: {
  round: number;
  fixtures: RoundFixture[];
  teamMetaById: Map<string, TeamMeta>;
  loadPlayersForTeam?: (teamId: string) => Promise<RosterPlayer[]>;
}): Promise<BuildRoundOcrTemplateResult> {
  const loader = args.loadPlayersForTeam ?? listPlayersForTeam;
  const rosterCache = new Map<string, RosterPlayer[]>();

  async function rosterFor(teamId: string): Promise<RosterPlayer[]> {
    const cached = rosterCache.get(teamId);
    if (cached) return cached;
    const players = await loader(teamId);
    rosterCache.set(teamId, players);
    return players;
  }

  function buildPlayerStats(players: RosterPlayer[], slug: string) {
    return players.map((p) => ({
      teamSlug: slug,
      playerRef: {
        playerId: p.id,
        ...(p.afl_player_id ? { aflPlayerId: p.afl_player_id } : {}),
        playerName: p.display_name || p.name || '',
      },
      kicks: null,
      handballs: null,
      disposals: null,
      marks: null,
      tackles: null,
      fantasyPoints: null,
    }));
  }

  const matchups: RoundOcrTemplate['matchups'] = [];
  const skipped: Array<{ fixtureId: string; reason: string }> = [];

  for (const fixture of args.fixtures) {
    const homeMeta = fixture.home_team_id ? args.teamMetaById.get(fixture.home_team_id) : null;
    const awayMeta = fixture.away_team_id ? args.teamMetaById.get(fixture.away_team_id) : null;

    if (!fixture.home_team_id || !fixture.away_team_id || !homeMeta?.slug || !awayMeta?.slug) {
      skipped.push({ fixtureId: fixture.id, reason: 'Missing team or team slug' });
      continue;
    }

    const [homeRoster, awayRoster] = await Promise.all([
      rosterFor(fixture.home_team_id),
      rosterFor(fixture.away_team_id),
    ]);

    matchups.push({
      fixtureId: fixture.id,
      homeTeamName: fixture.home_team_name || homeMeta.label,
      awayTeamName: fixture.away_team_name || awayMeta.label,
      homeTeamSlug: homeMeta.slug,
      awayTeamSlug: awayMeta.slug,
      playerStats: [
        ...buildPlayerStats(homeRoster, homeMeta.slug),
        ...buildPlayerStats(awayRoster, awayMeta.slug),
      ],
    });
  }

  const template: RoundOcrTemplate = { round: args.round, matchups };
  return { json: JSON.stringify(template, null, 2), template, skipped };
}
