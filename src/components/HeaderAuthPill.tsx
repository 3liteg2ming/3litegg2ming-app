import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';
import SmartImg from './SmartImg';

function initials(name?: string) {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'C';
}

export function HeaderAuthPill() {
  const nav = useNavigate();
  const { user, loading, signOut } = useAuth();

  const team = useMemo(() => {
    const key = user?.teamKey as TeamKey | undefined;
    return key ? TEAM_ASSETS[key] : null;
  }, [user?.teamKey]);

  if (loading) {
    return <div className="authPill authPill--ghost">…</div>;
  }

  if (!user) {
    return (
      <button
        type="button"
        className="authPill"
        onClick={() => nav('/auth/sign-in')}
        aria-label="Sign in"
      >
        <LogIn size={16} />
        <span>Sign in</span>
      </button>
    );
  }

  return (
    <div className="authPillGroup">
      <button
        type="button"
        className="authPill authPill--user"
        onClick={() => nav('/members')}
        aria-label="Open Coach Hub"
      >
        <span className="authPillAvatar" aria-hidden="true">
          {team ? (
            <SmartImg
              className="authPillTeamLogo"
              src={assetUrl(team.logoFile ?? '')}
              alt={team.short ?? team.name ?? 'Team'}
              fallbackText={(team.short ?? team.shortName ?? team.name ?? 'EG').slice(0, 2).toUpperCase()}
            />
          ) : (
            <span className="authPillInitials">{initials(user.displayName || user.email)}</span>
          )}
        </span>
        <span className="authPillText">
          <span className="authPillTop">Coach</span>
          <span className="authPillBottom">{team ? team.short : 'Hub'}</span>
        </span>
        <UserRound size={16} style={{ opacity: 0.7 }} />
      </button>

      <button
        type="button"
        className="authPill authPill--icon"
        onClick={() => signOut()}
        aria-label="Sign out"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
