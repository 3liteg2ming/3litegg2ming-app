import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';
import { resolveTeamKey, resolveTeamLogoUrl } from '@/lib/entityResolvers';
import { resolveKnownPlayerHeadshot } from '@/lib/playerHeadshots';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import '@/styles/mc-leaders.css';

type LeaderSide = {
  value: number;
  player: string;
  team: string;
  photoUrl?: string | null;
};

type LeaderRow = {
  stat: string;
  home: LeaderSide;
  away: LeaderSide;
};

const DEFAULT_LEADER_STATS = ['GOALS', 'DISPOSALS', 'MARKS'];
const INVALID_IMAGE_VALUE = /^(null|undefined|n\/a|na|none|false)$/i;

function resolveHex(value?: string | null) {
  const raw = String(value || '').trim();
  if (raw.startsWith('#') && (raw.length === 7 || raw.length === 4)) return raw;
  return null;
}

function hexToRgb(hex?: string | null) {
  const resolved = resolveHex(hex) || '#3b82f6';
  const compact = resolved.replace('#', '');
  const full = compact.length === 3 ? compact.split('').map((part) => `${part}${part}`).join('') : compact;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return {
    r: Number.isFinite(r) ? r : 59,
    g: Number.isFinite(g) ? g : 130,
    b: Number.isFinite(b) ? b : 246,
  };
}

const TINT_OVERRIDES: Record<string, string> = {
  collingwood: '#C4A942',
  carlton: '#1E4ED8',
  brisbane: '#7A1933',
  sydney: '#C71F2D',
};

function pickTeamTint(teamKey?: TeamKey | null, teamName?: string | null, explicitColour?: string | null) {
  const direct = resolveHex(explicitColour);
  if (direct) return direct;

  const keyStr = String(teamKey || '').trim().toLowerCase();
  if (TINT_OVERRIDES[keyStr]) return TINT_OVERRIDES[keyStr];

  const asset = (teamKey ? (TEAM_ASSETS[teamKey] as Record<string, string | undefined>) : null) || null;
  const candidates = [asset?.glow, asset?.accent, asset?.tint, asset?.primary, asset?.colour];
  for (const candidate of candidates) {
    const resolved = resolveHex(candidate);
    if (resolved) return resolved;
  }

  return '#3b82f6';
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function pickSeeded<T>(rows: T[], seed: string): T | null {
  if (!rows.length) return null;
  return rows[stableHash(seed) % rows.length] || rows[0] || null;
}

function slugToTeamKey(slug?: string | null): TeamKey | null {
  const raw = String(slug || '').trim();
  if (!raw) return null;
  const key = resolveTeamKey({ slug: raw });
  return TEAM_ASSETS[key] ? key : null;
}

function initials(name: string) {
  if (/pending|tbc|tbd/i.test(name)) return 'TBD';

  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (first + second).toUpperCase() || 'EG';
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function rowsForSide(rows: PlayerStatRow[], teamName: string, teamId?: string | null) {
  const normalizedName = normalizeText(teamName);
  const normalizedId = String(teamId || '').trim();

  return rows.filter((row) => {
    const rowId = String(row.teamId || '').trim();
    if (normalizedId && rowId && normalizedId === rowId) return true;
    return normalizeText(row.team) === normalizedName;
  });
}

function buildLeaderRows(model: MatchCentreModel | null): LeaderRow[] {
  const source = Array.isArray(model?.playerStats) ? model.playerStats : [];
  const homeTeamName = model?.home.fullName || 'Home Team';
  const awayTeamName = model?.away.fullName || 'Away Team';
  const homeRows = rowsForSide(source, homeTeamName, model?.home.id);
  const awayRows = rowsForSide(source, awayTeamName, model?.away.id);

  return DEFAULT_LEADER_STATS.map((stat, index) => {
    const sourceLeader = model?.leaders?.find((row) => String(row?.stat || '').toUpperCase() === stat) || model?.leaders?.[index];
    const homePick = pickSeeded(homeRows, `${model?.fixtureId || 'match-centre'}:${stat}:home`);
    const awayPick = pickSeeded(awayRows, `${model?.fixtureId || 'match-centre'}:${stat}:away`);

    return {
      stat: String(sourceLeader?.stat || stat),
      home: {
        value: Number(sourceLeader?.home?.value ?? 0),
        player: String(sourceLeader?.home?.player || homePick?.name || 'Line-up pending'),
        team: String(sourceLeader?.home?.team || homeTeamName),
        photoUrl: sourceLeader?.home?.photoUrl || homePick?.photoUrl || null,
      },
      away: {
        value: Number(sourceLeader?.away?.value ?? 0),
        player: String(sourceLeader?.away?.player || awayPick?.name || 'Line-up pending'),
        team: String(sourceLeader?.away?.team || awayTeamName),
        photoUrl: sourceLeader?.away?.photoUrl || awayPick?.photoUrl || null,
      },
    };
  });
}

export default function MatchLeaders({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const leaders = buildLeaderRows(model);
  const awaitingSubmission = !!model && !model.hasSubmissionData;
  const isLoadingShell = !!loading && !model;
  const showPlaceholderBars = isLoadingShell || awaitingSubmission || !model?.leaders?.length;

  return (
    <section className="mcLeadersRail" aria-label="Match leaders">
      <div className="mcLeadersRail__track" role="list" aria-label="Match leaders rail">
        {leaders.map((leader, index) => (
          <LeaderCard key={`${leader.stat}-${index}`} leader={leader} model={model} showPlaceholderBars={showPlaceholderBars} />
        ))}
      </div>
    </section>
  );
}

function LeaderCard({
  leader,
  model,
  showPlaceholderBars,
}: {
  leader: LeaderRow;
  model: MatchCentreModel | null;
  showPlaceholderBars: boolean;
}) {
  const home = model?.home;
  const away = model?.away;
  const homeKey = slugToTeamKey(home?.slug);
  const awayKey = slugToTeamKey(away?.slug);

  const homeLogo = resolveTeamLogoUrl({
    logoUrl: home?.logoUrl,
    slug: home?.slug,
    teamKey: homeKey || undefined,
    name: home?.fullName,
    fallbackPath: homeKey ? TEAM_ASSETS[homeKey]?.logoFile || TEAM_ASSETS[homeKey]?.logoPath : 'elite-gaming-logo.png',
  });

  const awayLogo = resolveTeamLogoUrl({
    logoUrl: away?.logoUrl,
    slug: away?.slug,
    teamKey: awayKey || undefined,
    name: away?.fullName,
    fallbackPath: awayKey ? TEAM_ASSETS[awayKey]?.logoFile || TEAM_ASSETS[awayKey]?.logoPath : 'elite-gaming-logo.png',
  });

  const homeTint = pickTeamTint(homeKey, home?.fullName, home?.color || home?.colour);
  const awayTint = pickTeamTint(awayKey, away?.fullName, away?.color || away?.colour);

  const homeRgb = hexToRgb(homeTint);
  const awayRgb = hexToRgb(awayTint);

  const cardVars = useMemo(
    () => ({
      '--mc-leaders-home-r': String(homeRgb.r),
      '--mc-leaders-home-g': String(homeRgb.g),
      '--mc-leaders-home-b': String(homeRgb.b),
      '--mc-leaders-away-r': String(awayRgb.r),
      '--mc-leaders-away-g': String(awayRgb.g),
      '--mc-leaders-away-b': String(awayRgb.b),
    } as CSSProperties),
    [homeRgb, awayRgb],
  );

  const homeName = String(leader.home.player || 'Line-up pending');
  const awayName = String(leader.away.player || 'Line-up pending');
  const homeTeam = String(leader.home.team || home?.fullName || 'Home Team');
  const awayTeam = String(leader.away.team || away?.fullName || 'Away Team');
  const homeCode = String(home?.abbreviation || home?.shortName || 'HOME');
  const awayCode = String(away?.abbreviation || away?.shortName || 'AWAY');
  const homeValue = Number.isFinite(leader.home.value) ? leader.home.value : 0;
  const awayValue = Number.isFinite(leader.away.value) ? leader.away.value : 0;
  const totalValue = homeValue + awayValue;
  const homeShare = totalValue > 0 ? (homeValue / totalValue) * 100 : 50;
  const awayShare = totalValue > 0 ? (awayValue / totalValue) * 100 : 50;

  return (
    <article className={`mcLeadersRail__card${showPlaceholderBars ? ' is-pending' : ''}`} role="listitem" style={cardVars}>
      <div className="mcLeadersRail__cardAtmosphere" aria-hidden="true">
        <span className="mcLeadersRail__cardGlow mcLeadersRail__cardGlow--home" />
        <span className="mcLeadersRail__cardGlow mcLeadersRail__cardGlow--away" />
      </div>

      <div className="mcLeadersRail__cardTop">
        <div className="mcLeadersRail__pillRow">
          <span className="mcLeadersRail__pill">{leader.stat}</span>
        </div>

        <div className="mcLeadersRail__teams" aria-hidden="true">
          <span className="mcLeadersRail__teamLabel">
            <SmartImg src={homeLogo} alt={home?.fullName || 'Home'} className="mcLeadersRail__teamLogo" fallbackText={homeCode.slice(0, 2)} />
            <span>{homeCode}</span>
          </span>
          <span className="mcLeadersRail__teamsDivider" />
          <span className="mcLeadersRail__teamLabel mcLeadersRail__teamLabel--away">
            <span>{awayCode}</span>
            <SmartImg src={awayLogo} alt={away?.fullName || 'Away'} className="mcLeadersRail__teamLogo" fallbackText={awayCode.slice(0, 2)} />
          </span>
        </div>
      </div>

      <div className="mcLeadersRail__scoreboard" aria-label={`${leader.stat} leaders`}>
        <div className="mcLeadersRail__valueBlock">
          <span className="mcLeadersRail__value">{homeValue}</span>
        </div>
        <span className="mcLeadersRail__valueDivider" aria-hidden="true">
          vs
        </span>
        <div className="mcLeadersRail__valueBlock mcLeadersRail__valueBlock--away">
          <span className="mcLeadersRail__value mcLeadersRail__value--away">{awayValue}</span>
        </div>
      </div>

      <div className="mcLeadersRail__comparison" aria-hidden="true">
        <span className="mcLeadersRail__comparisonTrack mcLeadersRail__comparisonTrack--home">
          <span className="mcLeadersRail__comparisonFill mcLeadersRail__comparisonFill--home" style={{ width: `${homeShare}%` }} />
        </span>
        <span className="mcLeadersRail__comparisonCenter" />
        <span className="mcLeadersRail__comparisonTrack mcLeadersRail__comparisonTrack--away">
          <span className="mcLeadersRail__comparisonFill mcLeadersRail__comparisonFill--away" style={{ width: `${awayShare}%` }} />
        </span>
      </div>

      <div className="mcLeadersRail__players">
        <div className="mcLeadersRail__playerPanel">
          <div className="mcLeadersRail__playerAvatarShell">
            <LeaderAvatar photoUrl={leader.home.photoUrl} name={homeName} />
          </div>
          <div className="mcLeadersRail__playerMeta">
            <span className="mcLeadersRail__playerName" title={homeName}>
              {homeName}
            </span>
            <span className="mcLeadersRail__playerTeam" title={homeTeam}>
              {homeCode}
            </span>
          </div>
        </div>

        <div className="mcLeadersRail__playerPanel mcLeadersRail__playerPanel--away">
          <div className="mcLeadersRail__playerAvatarShell">
            <LeaderAvatar photoUrl={leader.away.photoUrl} name={awayName} />
          </div>
          <div className="mcLeadersRail__playerMeta">
            <span className="mcLeadersRail__playerName" title={awayName}>
              {awayName}
            </span>
            <span className="mcLeadersRail__playerTeam" title={awayTeam}>
              {awayCode}
            </span>
          </div>
        </div>
      </div>

      <div className={`mcLeadersRail__footerAccent${showPlaceholderBars ? ' is-pending' : ''}`} aria-hidden="true">
        <span className="mcLeadersRail__footerLine mcLeadersRail__footerLine--home" />
        <span className="mcLeadersRail__footerDot" />
        <span className="mcLeadersRail__footerLine mcLeadersRail__footerLine--away" />
      </div>
    </article>
  );
}

function LeaderAvatar({ photoUrl, name }: { photoUrl?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = resolveKnownPlayerHeadshot({ name, photoUrl }) || '';

  useEffect(() => {
    setFailed(false);
  }, [src, name]);

  if (!src || INVALID_IMAGE_VALUE.test(src) || failed) {
    return <div className="mcLeadersRail__avatarFallback">{initials(name)}</div>;
  }

  return (
    <img
      src={src}
      alt={name}
      className="mcLeadersRail__avatar"
      width={64}
      height={64}
      loading="eager"
      decoding="async"
      {...({ fetchpriority: 'high' } as any)}
      onError={() => setFailed(true)}
    />
  );
}
