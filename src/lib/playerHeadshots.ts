import { playerHeadshotByName } from '../data/playerHeadshotByName';
import { assetUrl } from './teamAssets';

const INVALID_IMAGE_VALUE = /^(null|undefined|n\/a|na|none|false)$/i;

type HeadshotIndexEntry = {
  normalizedName: string;
  firstName: string;
  lastName: string;
  surnameCompact: string;
  url: string;
};

const AFL_HEADSHOT_VERSION = '2026-03-16-headshots-v2';

function addAflHeadshotVersion(url: string): string {
  try {
    const parsed = new URL(url);
    const isAflHeadshot =
      parsed.hostname.toLowerCase() === 's.afl.com.au' &&
      /\/Players\/ChampIDImages\/AFL\/2026014\//i.test(parsed.pathname);

    if (!isAflHeadshot) return url;

    parsed.searchParams.set('v', AFL_HEADSHOT_VERSION);
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeStoragePath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^storage\/v1\/object\/public\/assets\//i, '')
    .replace(/^assets\//i, '');
}

function resolveExplicitImageUrl(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw || INVALID_IMAGE_VALUE.test(raw)) return null;

  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (!parsed.pathname || parsed.pathname === '/') return null;
      } catch {
        return null;
      }

      return addAflHeadshotVersion(raw);
    }

    return raw;
  }

  const normalized = normalizeStoragePath(raw);
  if (!normalized) return null;

  const basename = normalized.split('/').pop() || normalized;
  const stem = basename.replace(/\.[a-z0-9]+$/i, '');
  if (!stem || INVALID_IMAGE_VALUE.test(stem)) return null;

  return assetUrl(normalized);
}

function buildNameProfile(value: unknown) {
  const normalized = normalizePlayerNameForLookup(value);
  const tokens = normalized.split(' ').filter(Boolean);
  const firstName = tokens[0] || '';
  const lastName = tokens[tokens.length - 1] || '';
  const surnameTokens = tokens.slice(1);
  const surname = surnameTokens.join(' ').trim();
  const compact = tokens.join('');
  const surnameCompact = surnameTokens.join('');

  return {
    normalized,
    tokens,
    firstName,
    lastName,
    surname,
    compact,
    surnameCompact,
  };
}

export function normalizePlayerNameForLookup(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[\u2010-\u2015-]/g, ' ')
    .replace(/[./,]/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\b(jnr|jr|snr|sr)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPlayerNameLookupKeys(name?: string | null): string[] {
  const profile = buildNameProfile(name);
  if (!profile.normalized) return [];

  const { normalized, tokens, firstName, lastName, surname, compact, surnameCompact } = profile;
  const out = new Set<string>([normalized, compact].filter(Boolean));

  if (tokens.length >= 2) {
    out.add(`${firstName} ${lastName}`.trim());
    out.add(`${firstName} ${surname}`.trim());
    out.add(`${firstName}${lastName}`.trim());
    out.add(`${firstName}${surnameCompact}`.trim());

    if (firstName) {
      out.add(`${firstName.charAt(0)} ${lastName}`.trim());
      out.add(`${firstName.charAt(0)} ${surname}`.trim());
      out.add(`${firstName.charAt(0)}${lastName}`.trim());
      out.add(`${firstName.charAt(0)}${surnameCompact}`.trim());
    }

    if (firstName.length > 1) {
      const shortFirst = firstName.slice(0, Math.min(firstName.length, 3));
      out.add(`${shortFirst} ${lastName}`.trim());
      out.add(`${shortFirst} ${surname}`.trim());
      out.add(`${shortFirst}${lastName}`.trim());
      out.add(`${shortFirst}${surnameCompact}`.trim());
    }
  }

  return Array.from(out).filter(Boolean);
}

function createHeadshotIndexes() {
  const exact = new Map<string, string>();
  const aliases = new Map<string, string>();
  const byLastName = new Map<string, HeadshotIndexEntry[]>();
  const bySurnameCompact = new Map<string, HeadshotIndexEntry[]>();

  for (const [rawName, rawUrl] of Object.entries(playerHeadshotByName)) {
    const url = resolveExplicitImageUrl(rawUrl);
    if (!url) continue;

    const profile = buildNameProfile(rawName);
    if (!profile.normalized) continue;

    exact.set(profile.normalized, url);
    for (const key of buildPlayerNameLookupKeys(rawName)) {
      if (!aliases.has(key)) aliases.set(key, url);
    }

    if (profile.tokens.length >= 2) {
      const entry: HeadshotIndexEntry = {
        normalizedName: profile.normalized,
        firstName: profile.firstName,
        lastName: profile.lastName,
        surnameCompact: profile.surnameCompact,
        url,
      };

      const byLastNameBucket = byLastName.get(profile.lastName) || [];
      byLastNameBucket.push(entry);
      byLastName.set(profile.lastName, byLastNameBucket);

      if (profile.surnameCompact) {
        const bySurnameBucket = bySurnameCompact.get(profile.surnameCompact) || [];
        bySurnameBucket.push(entry);
        bySurnameCompact.set(profile.surnameCompact, bySurnameBucket);
      }
    }
  }

  return { exact, aliases, byLastName, bySurnameCompact };
}

const HEADSHOT_INDEXES = createHeadshotIndexes();

function firstNameMatchStrength(requested: string, candidate: string) {
  if (!requested || !candidate) return 0;
  if (requested === candidate) return 5;

  if (requested.length === 1 || candidate.length === 1) {
    return requested.charAt(0) === candidate.charAt(0) ? 3 : 0;
  }

  if (requested.startsWith(candidate) || candidate.startsWith(requested)) {
    return Math.min(requested.length, candidate.length) >= 2 ? 4 : 2;
  }

  return requested.charAt(0) === candidate.charAt(0) ? 2 : 0;
}

function lookupPlayerHeadshotExactish(name?: string | null): string | null {
  const candidates = buildPlayerNameLookupKeys(name);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    if (HEADSHOT_INDEXES.exact.has(candidate)) {
      return HEADSHOT_INDEXES.exact.get(candidate) || null;
    }

    if (HEADSHOT_INDEXES.aliases.has(candidate)) {
      return HEADSHOT_INDEXES.aliases.get(candidate) || null;
    }
  }

  return null;
}

function lookupPlayerHeadshotAbbreviated(name?: string | null): string | null {
  const profile = buildNameProfile(name);
  if (profile.tokens.length < 2) return null;

  const candidates = new Map<string, HeadshotIndexEntry>();
  for (const entry of HEADSHOT_INDEXES.byLastName.get(profile.lastName) || []) {
    candidates.set(entry.url, entry);
  }
  for (const entry of HEADSHOT_INDEXES.bySurnameCompact.get(profile.surnameCompact) || []) {
    candidates.set(entry.url, entry);
  }

  if (!candidates.size) return null;

  let best: HeadshotIndexEntry | null = null;
  let bestScore = -1;
  let secondScore = -1;

  for (const entry of candidates.values()) {
    let score = 0;
    if (entry.normalizedName === profile.normalized) score += 120;
    if (entry.lastName === profile.lastName) score += 24;
    if (entry.surnameCompact && entry.surnameCompact === profile.surnameCompact) score += 28;
    score += firstNameMatchStrength(profile.firstName, entry.firstName) * 14;

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = entry;
      continue;
    }

    if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best) return null;
  if (bestScore >= 118) return best.url;
  if (bestScore >= 86 && bestScore - secondScore >= 14) return best.url;
  if (bestScore >= 72 && candidates.size === 1) return best.url;

  return null;
}

export function lookupPlayerHeadshotByName(name?: string | null): string | null {
  return lookupPlayerHeadshotExactish(name) || lookupPlayerHeadshotAbbreviated(name);
}

export function resolveKnownPlayerHeadshot(args: {
  name?: string | null;
  photoUrl?: string | null;
  headshotUrl?: string | null;
  alternateNames?: Array<string | null | undefined>;
}): string | null {
  const explicitPhoto = resolveExplicitImageUrl(args.photoUrl);
  if (explicitPhoto) return explicitPhoto;

  const explicitHeadshot = resolveExplicitImageUrl(args.headshotUrl);
  if (explicitHeadshot) return explicitHeadshot;

  const candidateNames = Array.from(
    new Set(
      [args.name, ...(args.alternateNames || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  for (const candidate of candidateNames) {
    const known = lookupPlayerHeadshotExactish(candidate);
    if (known) return known;
  }

  for (const candidate of candidateNames) {
    const known = lookupPlayerHeadshotAbbreviated(candidate);
    if (known) return known;
  }

  return null;
}
