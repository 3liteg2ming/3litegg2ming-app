import type { CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';

const LS_USER = 'eg_auth_user';
const LS_PASS = 'eg_auth_pass';

type StoredUser = CoachUser;

function safeParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export function mockGetUser(): StoredUser | null {
  return safeParse<StoredUser>(localStorage.getItem(LS_USER));
}

export async function mockSignUp(opts: {
  email: string;
  password: string;
  displayName?: string;
  psn?: string;
  firstName?: string;
  lastName?: string;
  teamKey?: TeamKey;
}): Promise<StoredUser> {
  const user: StoredUser = {
    id: `local_${Math.random().toString(16).slice(2)}`,
    email: opts.email,
    displayName: opts.displayName,
    psn: opts.psn,
    firstName: opts.firstName,
    lastName: opts.lastName,
    teamKey: opts.teamKey,
  };

  localStorage.setItem(LS_USER, JSON.stringify(user));
  localStorage.setItem(LS_PASS, opts.password);
  return user;
}

export async function mockSignIn(opts: {
  email: string;
  password: string;
}): Promise<StoredUser> {
  const user = mockGetUser();
  const pass = localStorage.getItem(LS_PASS) || '';

  if (!user || user.email.toLowerCase() !== opts.email.toLowerCase() || pass !== opts.password) {
    throw new Error('Invalid email or password');
  }
  return user;
}

export async function mockSignOut(): Promise<void> {
  localStorage.removeItem(LS_USER);
}
