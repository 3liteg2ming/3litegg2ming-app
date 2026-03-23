/**
 * Melvin Bet — Entertainment-only odds & prediction UI
 *
 * Fake fun predictions for Elite Gaming.
 * No real gambling. No real APIs. For entertainment only.
 */
import React, { useMemo } from 'react';
import '../styles/melvin-bet.css';

/* ── Deterministic seeded pseudo-random ─────────────── */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000 / 1_000_000;
}

function seededRange(seed: string, min: number, max: number): number {
  return Math.round(min + hash(seed) * (max - min));
}

function oddsFromChance(chance: number): string {
  if (chance <= 0) return '99.00';
  if (chance >= 100) return '1.01';
  const decimal = (100 / chance);
  return decimal.toFixed(2);
}

/* ── Wordmark ───────────────────────────────────────── */
export function MelvinBetWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'mb-wordmark mb-wordmark--sm' : size === 'lg' ? 'mb-wordmark mb-wordmark--lg' : 'mb-wordmark';
  return (
    <span className={cls} aria-label="Melvin Bet">
      <span className="mb-wordmark__mel">MEL</span>
      <span className="mb-wordmark__vin">VIN</span>
      <span className="mb-wordmark__bet">BET</span>
    </span>
  );
}

/* ── A) Homepage Outlook Card ───────────────────────── */
export type MelvinHomeFixture = {
  id: string;
  homeName: string;
  awayName: string;
  round?: number;
  venue?: string;
};

export function MelvinBetHomeCard({ fixtures }: { fixtures: MelvinHomeFixture[] }) {
  const rows = useMemo(() => {
    return fixtures.slice(0, 4).map((f) => {
      const homeChance = seededRange(`mb-home-${f.id}`, 30, 72);
      const awayChance = 100 - homeChance;
      return {
        ...f,
        homeOdds: oddsFromChance(homeChance),
        awayOdds: oddsFromChance(awayChance),
        tag: homeChance > 58 ? 'Fav' : awayChance > 58 ? 'Underdog' : 'Close',
      };
    });
  }, [fixtures]);

  if (!rows.length) return null;

  return (
    <section className="mb-homeCard mb-card">
      <div className="mb-stripe" />
      <div className="mb-card__header">
        <div className="mb-card__headerLeft">
          <MelvinBetWordmark size="sm" />
          <span className="mb-pill mb-pill--lime">Outlook</span>
        </div>
        <span className="mb-disclaimer">For entertainment only</span>
      </div>
      <div className="mb-card__body">
        {rows.map((r) => (
          <div key={r.id} className="mb-homeRow">
            <div className="mb-homeRow__teams">
              <div className="mb-homeRow__matchup">
                {r.homeName} v {r.awayName}
              </div>
              <div className="mb-homeRow__meta">
                {r.round ? `R${r.round}` : 'TBA'}{r.venue ? ` · ${r.venue}` : ''}
              </div>
            </div>
            <div className="mb-homeRow__odds">
              <span className="mb-pill mb-pill--lime">{r.homeOdds}</span>
              <span className="mb-pill mb-pill--gold">{r.awayOdds}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── B) Fixture Poster Odds Strip ───────────────────── */
export function MelvinBetOddsStrip({ matchId, homeName, awayName }: {
  matchId: string;
  homeName: string;
  awayName: string;
}) {
  const homeChance = useMemo(() => seededRange(`mb-strip-${matchId}`, 28, 72), [matchId]);
  const awayChance = 100 - homeChance;
  const homeOdds = oddsFromChance(homeChance);
  const awayOdds = oddsFromChance(awayChance);

  const favouriteLabel = homeChance > 55 ? 'Fav' : awayChance > 55 ? 'Fav' : '';

  return (
    <div className="mb-oddsStrip">
      <div className="mb-oddsStrip__side">
        <span className="mb-oddsStrip__label">{homeName.split(' ').pop()}</span>
        <span className="mb-pill mb-pill--lime">{homeOdds}</span>
        {homeChance > 55 && <span className="mb-pill mb-pill--gold" style={{ fontSize: 8 }}>{favouriteLabel}</span>}
      </div>
      <div className="mb-oddsStrip__center">
        <MelvinBetWordmark size="sm" />
      </div>
      <div className="mb-oddsStrip__side">
        {awayChance > 55 && <span className="mb-pill mb-pill--gold" style={{ fontSize: 8 }}>{favouriteLabel}</span>}
        <span className="mb-pill mb-pill--lime">{awayOdds}</span>
        <span className="mb-oddsStrip__label">{awayName.split(' ').pop()}</span>
      </div>
    </div>
  );
}

/* ── C) Match Centre Outlook Panel ──────────────────── */
export type MelvinMatchOutlookProps = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  homeScore?: number;
  awayScore?: number;
  isFinal?: boolean;
};

export function MelvinBetMatchOutlook({
  fixtureId,
  homeName,
  awayName,
  homeScore,
  awayScore,
  isFinal,
}: MelvinMatchOutlookProps) {
  const outlook = useMemo(() => {
    const homeChance = seededRange(`mb-mc-${fixtureId}`, 30, 72);
    const awayChance = 100 - homeChance;
    const confidence = seededRange(`mb-conf-${fixtureId}`, 45, 88);
    const upsetRisk = seededRange(`mb-upset-${fixtureId}`, 8, 42);

    const isFav = homeChance > awayChance;
    const favName = isFav ? homeName : awayName;
    const dogName = isFav ? awayName : homeName;
    const favChance = isFav ? homeChance : awayChance;
    const dogChance = isFav ? awayChance : homeChance;

    let callout = `${favName} rated slight favourite heading into this one.`;
    if (favChance > 62) callout = `${favName} expected to be dominant — ${dogName} looking for an upset.`;
    if (favChance < 55) callout = `Tight contest expected. Either side could take it.`;
    if (upsetRisk > 30) callout += ` Upset watch is elevated.`;

    // If we have a final score, add a post-match twist
    if (isFinal && homeScore !== undefined && awayScore !== undefined) {
      const predictedWinner = isFav ? homeName : awayName;
      const actualWinner = homeScore > awayScore ? homeName : awayScore > homeScore ? awayName : 'Draw';
      if (actualWinner === 'Draw') {
        callout = `Nobody saw that coming — a dead heat! Melvin Bet had ${favName} as fav.`;
      } else if (actualWinner !== predictedWinner) {
        callout = `Upset alert! ${actualWinner} defied the prediction. ${predictedWinner} were favourites.`;
      } else {
        callout = `${predictedWinner} got the job done as predicted. The form guide held true.`;
      }
    }

    return {
      favourite: favName,
      underdog: dogName,
      favChance,
      dogChance,
      confidence,
      upsetRisk,
      callout,
      homeOdds: oddsFromChance(homeChance),
      awayOdds: oddsFromChance(awayChance),
    };
  }, [fixtureId, homeName, awayName, homeScore, awayScore, isFinal]);

  return (
    <section className="mb-matchOutlook mb-card">
      <div className="mb-stripe" />
      <div className="mb-card__header">
        <div className="mb-card__headerLeft">
          <MelvinBetWordmark />
          <span className="mb-pill mb-pill--lime">Match Outlook</span>
        </div>
        <span className="mb-disclaimer">For entertainment only</span>
      </div>
      <div className="mb-card__body">
        <div className="mb-outlook__teams">
          <span className="mb-outlook__teamName mb-outlook__teamName--home">{homeName}</span>
          <span className="mb-outlook__vs">VS</span>
          <span className="mb-outlook__teamName mb-outlook__teamName--away">{awayName}</span>
        </div>

        <div className="mb-outlook__callout">
          <span className="mb-outlook__calloutIcon" aria-hidden="true">&#9889;</span>
          <span className="mb-outlook__calloutText">{outlook.callout}</span>
        </div>

        <div className="mb-statRow">
          <span className="mb-statRow__label">Favourite</span>
          <span className="mb-statRow__value mb-statRow__value--lime">{outlook.favourite}</span>
        </div>
        <div className="mb-statRow">
          <span className="mb-statRow__label">Underdog</span>
          <span className="mb-statRow__value">{outlook.underdog}</span>
        </div>
        <div className="mb-statRow">
          <span className="mb-statRow__label">{homeName} Odds</span>
          <span className="mb-statRow__value mb-statRow__value--lime">{outlook.homeOdds}</span>
        </div>
        <div className="mb-statRow">
          <span className="mb-statRow__label">{awayName} Odds</span>
          <span className="mb-statRow__value mb-statRow__value--gold">{outlook.awayOdds}</span>
        </div>

        <div className="mb-statRow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mb-statRow__label">Confidence</span>
            <span className="mb-statRow__value">{outlook.confidence}%</span>
          </div>
          <div className="mb-confBar">
            <div className="mb-confBar__fill mb-confBar__fill--lime" style={{ width: `${outlook.confidence}%` }} />
          </div>
        </div>

        <div className="mb-statRow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mb-statRow__label">Upset Watch</span>
            <span className={`mb-statRow__value ${outlook.upsetRisk > 28 ? 'mb-statRow__value--hot' : ''}`}>{outlook.upsetRisk}%</span>
          </div>
          <div className="mb-confBar">
            <div className={`mb-confBar__fill ${outlook.upsetRisk > 28 ? 'mb-confBar__fill--hot' : 'mb-confBar__fill--gold'}`} style={{ width: `${outlook.upsetRisk}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── D) Ladder Season Forecast ──────────────────────── */
export type MelvinForecastTeam = {
  id: string;
  pos: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  percentage: number;
};

export function MelvinBetSeasonForecast({ teams }: { teams: MelvinForecastTeam[] }) {
  const rows = useMemo(() => {
    return teams.slice(0, 10).map((t) => {
      const basePrem = Math.max(2, 52 - (t.pos - 1) * 6 + seededRange(`mb-prem-${t.id}`, -8, 8));
      const baseFinals = Math.min(98, Math.max(5, 105 - t.pos * 7 + seededRange(`mb-fin-${t.id}`, -6, 6)));
      const baseTop4 = Math.min(95, Math.max(3, 90 - t.pos * 8 + seededRange(`mb-t4-${t.id}`, -5, 5)));
      const spoonRisk = t.pos >= 14 ? seededRange(`mb-spn-${t.id}`, 15, 55)
        : t.pos >= 10 ? seededRange(`mb-spn-${t.id}`, 3, 18)
        : seededRange(`mb-spn-${t.id}`, 0, 5);

      return {
        ...t,
        premChance: Math.min(basePrem, 55),
        finalsChance: baseFinals,
        top4Chance: baseTop4,
        spoonRisk,
      };
    });
  }, [teams]);

  if (!rows.length) return null;

  function pctClass(value: number, invert = false): string {
    if (invert) {
      if (value > 25) return 'mb-forecast__pct--danger';
      if (value > 12) return 'mb-forecast__pct--med';
      return 'mb-forecast__pct--low';
    }
    if (value > 50) return 'mb-forecast__pct--high';
    if (value > 25) return 'mb-forecast__pct--med';
    return 'mb-forecast__pct--low';
  }

  return (
    <section className="mb-forecastCard mb-card">
      <div className="mb-stripe" />
      <div className="mb-card__header">
        <div className="mb-card__headerLeft">
          <MelvinBetWordmark />
          <span className="mb-pill mb-pill--lime">Season Forecast</span>
        </div>
        <span className="mb-disclaimer">For entertainment only</span>
      </div>
      <div className="mb-card__body">
        <table className="mb-forecast__table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Prem</th>
              <th>Finals</th>
              <th>Top 4</th>
              <th>Spoon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="mb-forecast__teamCell">
                    {r.logoUrl && (
                      <img
                        src={r.logoUrl}
                        alt={r.teamName}
                        className="mb-forecast__teamLogo"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <span className="mb-forecast__teamName">{r.teamName}</span>
                  </div>
                </td>
                <td><span className={`mb-forecast__pct ${pctClass(r.premChance)}`}>{r.premChance}%</span></td>
                <td><span className={`mb-forecast__pct ${pctClass(r.finalsChance)}`}>{r.finalsChance}%</span></td>
                <td><span className={`mb-forecast__pct ${pctClass(r.top4Chance)}`}>{r.top4Chance}%</span></td>
                <td><span className={`mb-forecast__pct ${pctClass(r.spoonRisk, true)}`}>{r.spoonRisk}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-forecast__footer">
          <MelvinBetWordmark size="sm" />
          <span className="mb-disclaimer">For entertainment only</span>
        </div>
      </div>
    </section>
  );
}
