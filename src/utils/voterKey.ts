const VOTER_KEY_STORAGE_KEY = 'elite_gaming_voter_key';

let memoryFallbackKey = '';

function buildVoterKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `egv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getPersistentVoterKey() {
  if (typeof window === 'undefined') {
    if (!memoryFallbackKey) memoryFallbackKey = buildVoterKey();
    return memoryFallbackKey;
  }

  try {
    const existing = String(window.localStorage.getItem(VOTER_KEY_STORAGE_KEY) || '').trim();
    if (existing) return existing;

    const next = buildVoterKey();
    window.localStorage.setItem(VOTER_KEY_STORAGE_KEY, next);
    return next;
  } catch {
    if (!memoryFallbackKey) memoryFallbackKey = buildVoterKey();
    return memoryFallbackKey;
  }
}

export { VOTER_KEY_STORAGE_KEY };
