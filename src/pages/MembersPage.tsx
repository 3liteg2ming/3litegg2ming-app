import { ChevronLeft, Mail, Shield, Trophy, Gamepad2, KeyRound } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SmartImg from '../components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';

function chipLabel(v: string) {
  return v;
}

export default function MembersPage() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();

  const team = useMemo(() => {
    const k = user?.teamKey as TeamKey | undefined;
    return k ? TEAM_ASSETS[k] : null;
  }, [user?.teamKey]);

  const displayName = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Coach');
  const seasonBadges = useMemo(() => ['AFL 26 Season Two', 'AFL Pro Team Season One'], []);

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/')} aria-label="Back to home">
          <ChevronLeft size={18} />
          <span>Home</span>
        </button>
      </div>

      <div className="auth-card auth-card--wide">
        <div className="member-head">
          <div className="member-title">
            <div className="auth-badge">MEMBERS</div>
            <div className="auth-title">Hi {displayName}</div>
            <div className="auth-sub">Your coach profile and season access.</div>
          </div>

          <button type="button" className="member-signout" onClick={() => signOut()} aria-label="Sign out">
            Sign out
          </button>
        </div>

        <div className="member-grid">
          <div className="member-panel">
            <div className="member-panelTitle">
              <Shield size={16} style={{ opacity: 0.75 }} /> Team badge
            </div>

            <div className="teamBadge">
              <div className="teamBadgeLogo">
                {team ? (
                  <SmartImg
                    className="teamBadgeImg"
                    src={assetUrl(team.logoFile ?? '')}
                    alt={team.name}
                    fallbackText={team.short}
                  />
                ) : (
                  <div className="teamBadgeFallback">EG</div>
                )}
              </div>
              <div className="teamBadgeMeta">
                <div className="teamBadgeName">{team ? team.name : 'Unassigned team'}</div>
                <div className="teamBadgeHint">
                  Only this logged-in coach can submit results for this team.
                </div>
              </div>
            </div>
          </div>

          <div className="member-panel">
            <div className="member-panelTitle">
              <Trophy size={16} style={{ opacity: 0.75 }} /> Season badges
            </div>

            <div className="badgeRow">
              {seasonBadges.map((b) => (
                <span key={b} className="badgeChip">
                  {chipLabel(b)}
                </span>
              ))}
            </div>

            <div className="member-mini">
              <div className="member-miniRow">
                <Mail size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">Email</div>
                  <div className="member-miniValue">{user?.email || '—'}</div>
                </div>
              </div>

              <div className="member-miniRow">
                <Gamepad2 size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">PSN</div>
                  <div className="member-miniValue">{user?.psn || 'Not set'}</div>
                </div>
              </div>

              <div className="member-miniRow">
                <KeyRound size={16} className="member-ico" />
                <div>
                  <div className="member-miniLabel">Account</div>
                  <div className="member-miniValue">Name locked • Email/password editable soon</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="member-next">
          <div className="member-nextTitle">Next up</div>
          <div className="member-nextText">
            We’ll plug this coach profile into Fixtures + Submit Results so you see your upcoming rounds automatically.
          </div>
        </div>
      </div>
    </div>
  );
}
