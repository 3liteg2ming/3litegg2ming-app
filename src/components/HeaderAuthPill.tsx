import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';
import SmartImg from './SmartImg';

function firstName(value?: string | null, email?: string | null) {
  const name = String(value || '').trim();
  if (name) return name.split(/\s+/)[0] || 'Coach';
  return String(email || '').split('@')[0] || 'Coach';
}

export function HeaderAuthPill() {
  const nav = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const coachFirstName = firstName(user?.firstName || user?.displayName, user?.email);
  const hasAssignedTeam = Boolean(user?.teamKey || user?.teamLogoUrl || user?.teamName);

  const teamBrand = useMemo(() => {
    const key = user?.teamKey as TeamKey | undefined;
    const team = key ? TEAM_ASSETS[key] : null;
    const shortLabel = String(user?.teamName || team?.short || team?.shortName || team?.name || '').trim();
    const logoSrc = String(user?.teamLogoUrl || (team?.logoFile ? assetUrl(team.logoFile) : '')).trim();

    return {
      shortLabel: shortLabel || null,
      logoSrc: logoSrc || null,
      logoAlt: shortLabel || 'Team',
    };
  }, [user?.teamKey, user?.teamLogoUrl, user?.teamName]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (loading) {
    return (
      <div className="authPill authPill--ghost authPill--header authPill--loading" aria-hidden="true">
        <span className="authPillAvatar" />
        <span className="authPillText">Account</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        className="authPill authPill--header authPill--signedOut"
        onClick={() => nav('/auth/sign-in')}
        aria-label="Sign in"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="authPillMenu authPillMenu--header" ref={menuRef}>
      <button
        type="button"
        className={`authPill authPill--account authPill--header ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`${coachFirstName} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="authPillAvatar" aria-hidden="true">
          {hasAssignedTeam && teamBrand.logoSrc ? (
            <SmartImg
              className="authPillTeamLogo"
              src={teamBrand.logoSrc}
              alt={teamBrand.logoAlt}
              fallbackText={(teamBrand.shortLabel || 'EG').slice(0, 2).toUpperCase()}
            />
          ) : (
            <span className="authPillInitials">{coachFirstName.slice(0, 1)}</span>
          )}
        </span>
        <span className="authPillText">{coachFirstName}</span>
        <ChevronDown size={14} className={`authPillChevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="authPillPopover" role="menu" aria-label="Account actions">
          <button
            type="button"
            className="authPillPopover__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              nav('/members');
            }}
          >
            <LayoutDashboard size={15} />
            <span>Coach Hub</span>
          </button>
          <button
            type="button"
            className="authPillPopover__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut().finally(() => {
                nav('/preseason-registration');
              });
            }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
