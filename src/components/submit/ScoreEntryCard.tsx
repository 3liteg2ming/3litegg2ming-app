import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';

interface ScoreEntryCardProps {
  homeTeamName: string;
  homeTeamLogo?: string;
  awayTeamName: string;
  awayTeamLogo?: string;
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
  onHomeGoalsChange: (value: string) => void;
  onHomeBehindsChange: (value: string) => void;
  onAwayGoalsChange: (value: string) => void;
  onAwayBehindsChange: (value: string) => void;
}

function safeNum(v: any): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function ScoreEntryCard({
  homeTeamName,
  homeTeamLogo,
  awayTeamName,
  awayTeamLogo,
  homeGoals,
  homeBehinds,
  awayGoals,
  awayBehinds,
  onHomeGoalsChange,
  onHomeBehindsChange,
  onAwayGoalsChange,
  onAwayBehindsChange,
}: ScoreEntryCardProps) {
  const homeGoalsN = useMemo(() => safeNum(homeGoals), [homeGoals]);
  const homeBehindsN = useMemo(() => safeNum(homeBehinds), [homeBehinds]);
  const awayGoalsN = useMemo(() => safeNum(awayGoals), [awayGoals]);
  const awayBehindsN = useMemo(() => safeNum(awayBehinds), [awayBehinds]);

  const homeTotal = homeGoalsN * 6 + homeBehindsN;
  const awayTotal = awayGoalsN * 6 + awayBehindsN;

  const isValid =
    homeGoals !== '' &&
    homeBehinds !== '' &&
    awayGoals !== '' &&
    awayBehinds !== '' &&
    homeGoalsN >= 0 &&
    homeBehindsN >= 0 &&
    awayGoalsN >= 0 &&
    awayBehindsN >= 0;

  const handleNumericInput = (value: string) => {
    return value.replace(/[^\d]/g, '').slice(0, 2);
  };

  return (
    <div className="scoreCard">
      <div className="scoreCard__header">
        <h3 className="scoreCard__title">Enter Final Score</h3>
        <p className="scoreCard__subtitle">Goals and Behinds</p>
      </div>

      <div className="scoreCard__grid">
        {/* HOME TEAM */}
        <div className="scoreCard__side">
          <div className="scoreCard__teamHeader">
            <div className="scoreCard__teamLogo">
              {homeTeamLogo ? (
                <img src={homeTeamLogo} alt={homeTeamName} />
              ) : (
                <span>{homeTeamName.charAt(0)}</span>
              )}
            </div>
            <div className="scoreCard__teamName">{homeTeamName}</div>
          </div>

          <div className="scoreCard__inputs">
            <div className="scoreCard__inputGroup">
              <label className="scoreCard__label">Goals</label>
              <input
                type="text"
                inputMode="numeric"
                className="scoreCard__input"
                value={homeGoals}
                onChange={(e) => onHomeGoalsChange(handleNumericInput(e.target.value))}
                placeholder="0"
              />
            </div>

            <div className="scoreCard__inputGroup">
              <label className="scoreCard__label">Behinds</label>
              <input
                type="text"
                inputMode="numeric"
                className="scoreCard__input"
                value={homeBehinds}
                onChange={(e) => onHomeBehindsChange(handleNumericInput(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="scoreCard__total">
            <span className="scoreCard__totalLabel">Total</span>
            <span className="scoreCard__totalScore">{homeTotal}</span>
          </div>
        </div>

        {/* AWAY TEAM */}
        <div className="scoreCard__side">
          <div className="scoreCard__teamHeader">
            <div className="scoreCard__teamName">{awayTeamName}</div>
            <div className="scoreCard__teamLogo">
              {awayTeamLogo ? (
                <img src={awayTeamLogo} alt={awayTeamName} />
              ) : (
                <span>{awayTeamName.charAt(0)}</span>
              )}
            </div>
          </div>

          <div className="scoreCard__inputs">
            <div className="scoreCard__inputGroup">
              <label className="scoreCard__label">Goals</label>
              <input
                type="text"
                inputMode="numeric"
                className="scoreCard__input"
                value={awayGoals}
                onChange={(e) => onAwayGoalsChange(handleNumericInput(e.target.value))}
                placeholder="0"
              />
            </div>

            <div className="scoreCard__inputGroup">
              <label className="scoreCard__label">Behinds</label>
              <input
                type="text"
                inputMode="numeric"
                className="scoreCard__input"
                value={awayBehinds}
                onChange={(e) => onAwayBehindsChange(handleNumericInput(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="scoreCard__total">
            <span className="scoreCard__totalLabel">Total</span>
            <span className="scoreCard__totalScore">{awayTotal}</span>
          </div>
        </div>
      </div>

      {/* Live score preview */}
      <div className="scoreCard__preview">
        <div className="scoreCard__previewScore">
          <span className="scoreCard__previewHome">{homeTotal}</span>
          <span className="scoreCard__previewDash">—</span>
          <span className="scoreCard__previewAway">{awayTotal}</span>
        </div>
      </div>

      {!isValid && (homeGoals || homeBehinds || awayGoals || awayBehinds) && (
        <div className="scoreCard__error">
          <AlertCircle size={16} />
          Please enter all scores (0 or higher)
        </div>
      )}
    </div>
  );
}
