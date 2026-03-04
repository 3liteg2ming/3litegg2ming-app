export type GamerTagProfileLike = {
  psn?: unknown;
  xbox_gamertag?: unknown;
} | null;

export type GamerTagUserLike = {
  psn?: unknown;
  user_metadata?: Record<string, unknown> | null;
} | null;

export type GamerTagResolution = {
  value: string | null;
  source:
    | 'profiles.psn'
    | 'profiles.xbox_gamertag'
    | 'user_metadata.psn'
    | 'user_metadata.gamertag'
    | 'user_metadata.psn_name'
    | 'user.psn'
    | 'none';
};

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidate = obj.value ?? obj.psn ?? obj.gamertag ?? obj.psn_name ?? obj.tag ?? '';
    if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate).trim();
    }
  }
  return '';
}

export function isPlaceholderGamerTag(value: unknown): boolean {
  const normalized = text(value).toLowerCase().replace(/\s+/g, '');
  return normalized === 'yourpsn' || normalized === 'yourpsnid' || normalized === 'yourgamertag';
}

function clean(value: unknown): string | null {
  const next = text(value);
  if (!next) return null;
  if (isPlaceholderGamerTag(next)) return null;
  return next;
}

export function resolveGamerTag(args: {
  profile?: GamerTagProfileLike;
  user?: GamerTagUserLike;
}): GamerTagResolution {
  const profile = args.profile || null;
  const user = args.user || null;
  const meta = (user?.user_metadata || {}) as Record<string, unknown>;

  const fromProfile = clean(profile?.psn);
  if (fromProfile) return { value: fromProfile, source: 'profiles.psn' };

  const fromProfileXbox = clean(profile?.xbox_gamertag);
  if (fromProfileXbox) return { value: fromProfileXbox, source: 'profiles.xbox_gamertag' };

  const fromMetaPsn = clean(meta.psn);
  if (fromMetaPsn) return { value: fromMetaPsn, source: 'user_metadata.psn' };

  const fromMetaGamertag = clean(meta.gamertag ?? meta.gamer_tag);
  if (fromMetaGamertag) return { value: fromMetaGamertag, source: 'user_metadata.gamertag' };

  const fromMetaLegacy = clean(meta.psn_name);
  if (fromMetaLegacy) return { value: fromMetaLegacy, source: 'user_metadata.psn_name' };

  const fromUser = clean(user?.psn);
  if (fromUser) return { value: fromUser, source: 'user.psn' };

  return { value: null, source: 'none' };
}
