import { playerHeadshotByName } from '../data/playerHeadshotByName';
import { assetUrl } from './teamAssets';

function normalizePlayerName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function lookupPlayerHeadshotByName(name?: string | null): string | null {
  const normalized = normalizePlayerName(name);
  if (!normalized) return null;
  return playerHeadshotByName[normalized] || null;
}

export function resolveKnownPlayerHeadshot(args: {
  name?: string | null;
  photoUrl?: string | null;
  headshotUrl?: string | null;
}): string | null {
  const explicit = String(args.photoUrl || args.headshotUrl || '').trim();
  if (explicit) {
    if (/^https?:\/\//i.test(explicit) || explicit.startsWith('data:') || explicit.startsWith('blob:')) {
      return explicit;
    }
    return assetUrl(explicit);
  }
  return lookupPlayerHeadshotByName(args.name);
}
