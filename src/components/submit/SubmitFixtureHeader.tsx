import React from 'react';
import { Shield, MapPin, Calendar } from 'lucide-react';

interface SubmitFixtureHeaderProps {
  round: number;
  venue?: string;
  status: string;
  homeTeamName: string;
  homeTeamLogo?: string;
  homeTeamColor?: string;
  awayTeamName: string;
  awayTeamLogo?: string;
  awayTeamColor?: string;
  coachName?: string;
  teamName?: string;
}

export function SubmitFixtureHeader({
  round,
  venue,
  status,
  homeTeamName,
  homeTeamLogo,
  homeTeamColor,
  awayTeamName,
  awayTeamLogo,
  awayTeamColor,
  coachName,
  teamName,
}: SubmitFixtureHeaderProps) {
  return (
    <div className="submitHeader">
      {/* Background watermark effect */}
      <div className="submitHeader__bg">
        {homeTeamLogo && (
          <img src={homeTeamLogo} alt="" className="submitHeader__bgLogo submitHeader__bgLogo--home" />
        )}
        {awayTeamLogo && (
          <img src={awayTeamLogo} alt="" className="submitHeader__bgLogo submitHeader__bgLogo--away" />
        )}
      </div>

      {/* Header content */}
      <div className="submitHeader__content">
        {/* Round + Status pill */}
        <div className="submitHeader__meta">
          <span className="submitHeader__round">Round {round}</span>
          <span className={`submitHeader__status submitHeader__status--${status.toLowerCase()}`}>
            {status === 'FINAL' ? 'FINAL' : 'READY TO SUBMIT'}
          </span>
        </div>

        {/* Team matchup */}
        <div className="submitHeader__matchup">
          {/* Home team */}
          <div className="submitHeader__team submitHeader__team--home">
            <div className="submitHeader__logo" style={{ backgroundColor: homeTeamColor ? `${homeTeamColor}15` : 'rgba(255,255,255,0.08)' }}>
              {homeTeamLogo ? (
                <img src={homeTeamLogo} alt={homeTeamName} />
              ) : (
                <span className="submitHeader__logoFallback">{homeTeamName.charAt(0)}</span>
              )}
            </div>
            <div className="submitHeader__teamInfo">
              <div className="submitHeader__teamName">{homeTeamName}</div>
              <div className="submitHeader__teamRole">Home</div>
            </div>
          </div>

          {/* VS divider */}
          <div className="submitHeader__vs">VS</div>

          {/* Away team */}
          <div className="submitHeader__team submitHeader__team--away">
            <div className="submitHeader__teamInfo">
              <div className="submitHeader__teamName">{awayTeamName}</div>
              <div className="submitHeader__teamRole">Away</div>
            </div>
            <div className="submitHeader__logo" style={{ backgroundColor: awayTeamColor ? `${awayTeamColor}15` : 'rgba(255,255,255,0.08)' }}>
              {awayTeamLogo ? (
                <img src={awayTeamLogo} alt={awayTeamName} />
              ) : (
                <span className="submitHeader__logoFallback">{awayTeamName.charAt(0)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Venue */}
        {venue && (
          <div className="submitHeader__details">
            <MapPin size={16} />
            {venue}
          </div>
        )}

        {/* Coach badge */}
        {coachName && teamName && (
          <div className="submitHeader__coach">
            <Shield size={14} />
            <div>
              <span className="submitHeader__coachLabel">Signed in as</span>
              <span className="submitHeader__coachName">{coachName}</span>
              <span className="submitHeader__coachTeam">{teamName}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
