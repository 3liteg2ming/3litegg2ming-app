import { useEffect, useState } from 'react';

import { applyBest23Override, fetchBest23Override } from '../lib/best23Repo';

type TeamOfTournament = import('../lib/teamOfTournament').TeamOfTournament;
type TotPlayer = import('../lib/teamOfTournament').TotPlayer;

function normalizeClubToken(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

export function flattenTeamOfTournamentPlayers(data: TeamOfTournament | null | undefined): TotPlayer[] {
  if (!data) return [];
  return [...data.defenders, ...data.midfielders, ...data.rucks, ...data.forwards, ...data.interchange];
}

export function getTeamOfTournamentClubSelections(
  data: TeamOfTournament | null | undefined,
  club: { teamKey?: string | null; teamName?: string | null },
): TotPlayer[] {
  const clubKey = normalizeClubToken(club.teamKey);
  const clubName = normalizeClubToken(club.teamName);
  if (!clubKey && !clubName) return [];

  return flattenTeamOfTournamentPlayers(data).filter((player) => {
    const playerKey = normalizeClubToken(player.teamKey);
    const playerName = normalizeClubToken(player.teamName);

    if (clubKey && playerKey && playerKey === clubKey) return true;
    if (!clubName || !playerName) return false;
    return playerName === clubName || playerName.includes(clubName) || clubName.includes(playerName);
  });
}

export function useTeamOfTournament() {
  const [data, setData] = useState<TeamOfTournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let mounted = true;

    const load = async (forceFresh: boolean, silent = false) => {
      if (!silent && mounted) setIsLoading(true);
      try {
        const [mod, override] = await Promise.all([
          import('../lib/teamOfTournament'),
          fetchBest23Override({ publishedOnly: true }).catch(() => null),
        ]);
        const result = await mod.fetchTeamOfTournament({ force: forceFresh });
        const resolved = applyBest23Override(result, override);
        if (!cancelled) setData(resolved);
      } catch (error) {
        console.warn('Failed to fetch team of tournament:', error);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled && mounted) setIsLoading(false);
      }
    };

    void load(true);

    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void load(true, true);
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      cancelled = true;
      mounted = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return { data, isLoading };
}
