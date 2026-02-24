export type TeamKey =
  | 'adelaide'
  | 'brisbane'
  | 'carlton'
  | 'collingwood'
  | 'essendon'
  | 'fremantle'
  | 'geelong'
  | 'goldcoast'
  | 'gws'
  | 'hawthorn'
  | 'melbourne'
  | 'northmelbourne'
  | 'portadelaide'
  | 'richmond'
  | 'stkilda'
  | 'sydney'
  | 'westcoast'
  | 'westernbulldogs';

/**
 * Team assets are stored in Supabase Storage bucket: Assets
 * Paths used here are relative to that bucket.
 *
 * NOTE: The codebase has historically referenced a few different field names.
 * To keep the UI stable (Ladder, Fixtures, Home, etc.), we keep canonical
 * fields and also provide backwards-compatible aliases:
 *  - short   -> shortName
 *  - primary -> colour
 *  - logoFile -> logoPath
 */
export type TeamAsset = {
  name: string;
  shortName: string;
  colour: string;
  logoPath: string;
  logoAltPath?: string;

  // legacy aliases
  short?: string;
  primary?: string;
  logoFile?: string;
};

export const TEAM_ASSETS: Record<TeamKey, TeamAsset> = {
  adelaide: { name: 'Adelaide', shortName: 'Crows', colour: '#0E2D52', logoPath: 'teams/Adelaide.png' },
  brisbane: { name: 'Brisbane', shortName: 'Lions', colour: '#6E0F2D', logoPath: 'teams/Brisbane.png' },
  carlton: { name: 'Carlton', shortName: 'Blues', colour: '#0B2A4C', logoPath: 'teams/Carlton.png' },
  collingwood: {
    name: 'Collingwood',
    shortName: 'Magpies',
    colour: '#1A1A1A',
    logoPath: 'teams/Collingwood.png',
  },
  essendon: { name: 'Essendon', shortName: 'Bombers', colour: '#9D1B1E', logoPath: 'teams/Essendon.png' },
  fremantle: {
    name: 'Fremantle',
    shortName: 'Dockers',
    colour: '#2B0E4A',
    logoPath: 'teams/Fremantle.png',
  },
  geelong: {
    name: 'Geelong',
    shortName: 'Cats',
    colour: '#0F2747',
    logoPath: 'teams/Geelong Cats (Light).png',
  },
  goldcoast: {
    name: 'Gold Coast',
    shortName: 'Suns',
    colour: '#B5121B',
    logoPath: 'teams/Gold Coast Suns (Light).png',
  },
  gws: {
    name: 'GWS',
    shortName: 'Giants',
    colour: '#D14F0F',
    logoPath: 'teams/GWS Giants (Light).png',
  },
  hawthorn: {
    name: 'Hawthorn',
    shortName: 'Hawks',
    colour: '#4B2D13',
    logoPath: 'teams/Hawthorn (Light).png',
  },
  melbourne: { name: 'Melbourne', shortName: 'Demons', colour: '#0B1B2D', logoPath: 'teams/Melbourne.png' },
  northmelbourne: {
    name: 'North Melbourne',
    shortName: 'Roos',
    colour: '#0B4FA6',
    logoPath: 'teams/North Melbourne.png',
  },
  portadelaide: {
    name: 'Port Adelaide',
    shortName: 'Power',
    colour: '#101316',
    logoPath: 'teams/Port Adelaide.png',
  },
  richmond: {
    name: 'Richmond',
    shortName: 'Tigers',
    colour: '#111111',
    logoPath: 'teams/Richmond (Light).png',
  },
  stkilda: { name: 'St Kilda', shortName: 'Saints', colour: '#101316', logoPath: 'teams/St Kilda.png' },
  sydney: {
    name: 'Sydney',
    shortName: 'Swans',
    colour: '#B5121B',
    logoPath: 'teams/Sydney Swans (Light).png',
  },
  westcoast: {
    name: 'West Coast',
    shortName: 'Eagles',
    colour: '#0B2A4C',
    logoPath: 'teams/West Coast Eagles (Light).png',
  },
  westernbulldogs: {
    name: 'Western Bulldogs',
    shortName: 'Dogs',
    colour: '#0B2A4C',
    logoPath: 'teams/Western Bulldogs.png',
  },
};

// Inject legacy aliases so older components keep working.
for (const k of Object.keys(TEAM_ASSETS) as TeamKey[]) {
  const t = TEAM_ASSETS[k];
  t.short = t.short ?? t.shortName;
  t.primary = t.primary ?? t.colour;
  t.logoFile = t.logoFile ?? t.logoPath;
}

// Your project ref (you posted this in chat). Keeping as fallback avoids a blank UI
// if env vars are missing during local dev.
const FALLBACK_PROJECT_REF = 'zohtixrgskbzosgfluni';

export function assetUrl(path: string) {
  const supabaseUrl =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) || `https://${FALLBACK_PROJECT_REF}.supabase.co`;
  const bucket = 'Assets';
  const clean = String(path || '').replace(/^\//, '');
  // Encode spaces and other characters in file names (your bucket has names like "Geelong Cats (Light).png")
  const encoded = clean
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}

// ---------------------------------------------------------------------------
// Lovable Stats (stats2) compatibility helper
// Returns the shape expected by the Lovable StatsHomePage design.

function _normName(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function _darken(hex: string, amount = 0.42) {
  const h = String(hex || '#2a2f38').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const k = 1 - Math.max(0, Math.min(0.85, amount));
  return `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})`;
}

function _teamKeyFromNameOrKey(team: string): TeamKey {
  const raw = String(team || '').trim();
  const maybeKey = raw.toLowerCase() as TeamKey;
  if ((TEAM_ASSETS as any)[maybeKey]) return maybeKey;

  const n = _normName(raw);
  const entries = Object.entries(TEAM_ASSETS) as Array<[TeamKey, TeamAsset]>;

  for (const [k, v] of entries) {
    const candidates = [v.name, v.shortName, v.short, k].filter(Boolean).map(_normName);
    if (candidates.includes(n)) return k;
  }
  for (const [k, v] of entries) {
    const candidates = [v.name, v.shortName, v.short, k].filter(Boolean).map(_normName);
    if (candidates.some((c) => c && (n.includes(c) || c.includes(n)))) return k;
  }
  return 'adelaide';
}

export function getTeamAssets(teamNameOrKey: string) {
  const key = _teamKeyFromNameOrKey(teamNameOrKey);
  const a = TEAM_ASSETS[key];
  const logo = a?.logoPath ? assetUrl(a.logoPath) : '';
  return {
    key,
    name: a?.name || teamNameOrKey,
    primary: a?.colour || '#2a2f38',
    primaryHex: a?.colour || '#2a2f38',
    dark: _darken(a?.colour || '#2a2f38', 0.42),
    logo,
  };
}
