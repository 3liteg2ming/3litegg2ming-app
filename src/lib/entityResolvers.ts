import { TEAM_ASSETS, assetUrl, type TeamKey } from '@/lib/teamAssets';

const TEAM_KEY_ALIASES: Record<string, TeamKey> = {
  adelaidecrows: 'adelaide',
  brisbanelions: 'brisbane',
  carltonblues: 'carlton',
  collingwoodmagpies: 'collingwood',
  essendonbombers: 'essendon',
  fremantledockers: 'fremantle',
  geelongcats: 'geelong',
  goldcoast: 'goldcoast',
  goldcoastsuns: 'goldcoast',
  gws: 'gws',
  gwsgiants: 'gws',
  hawthornhawks: 'hawthorn',
  melbournedemons: 'melbourne',
  northmelbourne: 'northmelbourne',
  northmelbournekangaroos: 'northmelbourne',
  portadelaide: 'portadelaide',
  portadelaidepower: 'portadelaide',
  richmondtigers: 'richmond',
  stkilda: 'stkilda',
  stkildasaints: 'stkilda',
  sydneyswans: 'sydney',
  westcoast: 'westcoast',
  westcoasteagles: 'westcoast',
  westernbulldogs: 'westernbulldogs',
};

function normalizeTeamToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

export function resolveTeamKey(input: { slug?: string | null; teamKey?: string | null; name?: string | null }): TeamKey {
  const candidates = [input.teamKey, input.slug, input.name]
    .map((v) => normalizeTeamToken(String(v || '')))
    .filter(Boolean);

  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];

  for (const c of candidates) {
    if (keys.includes(c as TeamKey)) return c as TeamKey;
    if (TEAM_KEY_ALIASES[c]) return TEAM_KEY_ALIASES[c];

    const byCompact = keys.find((k) => normalizeTeamToken(k) === c);
    if (byCompact) return byCompact;
  }

  return 'unknown' as TeamKey;
}

export function resolveTeamName(input: { name?: string | null; shortName?: string | null; slug?: string | null; teamKey?: string | null }): string {
  const explicit = String(input.name || input.shortName || '').trim();
  if (explicit) return explicit;

  const key = resolveTeamKey({ slug: input.slug, teamKey: input.teamKey, name: input.name });
  const fromAsset = String(TEAM_ASSETS[key]?.name || '').trim();
  if (fromAsset) return fromAsset;

  const rawSlug = String(input.slug || '').trim();
  if (!rawSlug) return 'Unassigned';
  return rawSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function normalizeStoragePath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^storage\/v1\/object\/public\/assets\//i, '')
    .replace(/^assets\//i, '');
}

export function resolveTeamLogoUrl(input: {
  logoUrl?: string | null;
  slug?: string | null;
  teamKey?: string | null;
  name?: string | null;
  fallbackPath?: string;
}): string {
  const raw = String(input.logoUrl || '').trim();

  if (raw) {
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }
    const normalized = normalizeStoragePath(raw);
    if (normalized) return assetUrl(normalized);
  }

  const key = resolveTeamKey({ slug: input.slug, teamKey: input.teamKey, name: input.name });
  const assetPath = TEAM_ASSETS[key]?.logoFile || TEAM_ASSETS[key]?.logoPath || input.fallbackPath || 'elite-gaming-logo.png';
  return assetUrl(assetPath);
}

export function resolvePlayerDisplayName(input: {
  name?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const explicit = String(input.displayName || input.fullName || input.name || '').trim();
  if (explicit) return explicit;
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();
  const joined = `${first} ${last}`.trim();
  return joined || 'Player not linked';
}

export function resolvePlayerPhotoUrl(input: { photoUrl?: string | null; headshotUrl?: string | null; fallbackPath?: string }): string {
  const raw = String(input.photoUrl || input.headshotUrl || '').trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    const normalized = normalizeStoragePath(raw);
    if (normalized) return assetUrl(normalized);
  }
  return assetUrl(input.fallbackPath || 'elite-gaming-logo.png');
}
