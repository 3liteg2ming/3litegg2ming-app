import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client (safe):
 * - Never hard-crashes the app if env vars are missing or invalid.
 * - If misconfigured, queries resolve with { data: null, error } so pages can fallback.
 */

// Support both naming conventions that have appeared across the project.
const env = (import.meta as any).env || {};
const supabaseUrl: string | undefined = env.VITE_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey: string | undefined = env.VITE_SUPABASE_ANON_KEY || env.VITE_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseInitError: Error | null = (() => {
  if (!hasSupabaseEnv) {
    return new Error(
      '[Supabase] Missing env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a .env file and restart Vite.'
    );
  }
  // Validity is checked during createClient below.
  return null;
})();

function asError(e: unknown, fallback: string) {
  return e instanceof Error ? e : new Error(fallback);
}

function makeThenableErrorBuilder(err: Error) {
  // A tiny "query builder" that supports common PostgREST chaining and is awaitable.
  // Awaiting it resolves to { data: null, error }.
  const result = { data: null as any, error: err as any };

  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    gt: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    like: () => builder,
    ilike: () => builder,
    in: () => builder,
    contains: () => builder,
    containedBy: () => builder,
    is: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,

    then: (onFulfilled: any, onRejected: any) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: any) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally: any) => Promise.resolve(result).finally(onFinally),
  };

  return builder;
}

function makeMissingEnvClient(err: Error): SupabaseClient {
  const from = () => makeThenableErrorBuilder(err);

  const auth = {
    getSession: async () => ({ data: { session: null }, error: err as any }),
    getUser: async () => ({ data: { user: null }, error: err as any }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: err as any }),
    signUp: async () => ({ data: { user: null, session: null }, error: err as any }),
    signOut: async () => ({ error: err as any }),
  };

  const rpc = async () => ({ data: null as any, error: err as any });

  // Cast to SupabaseClient so existing code keeps working.
  return { from, auth, rpc } as any;
}

function buildClient(): SupabaseClient {
  // Missing env vars → stub client.
  if (!hasSupabaseEnv) {
    return makeMissingEnvClient(supabaseInitError!);
  }

  // Env present, but URL might still be invalid (eg: user accidentally put just the project ref).
  try {
    return createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (e) {
    const err = asError(e, '[Supabase] Failed to create client. Check VITE_SUPABASE_URL format.');
    console.error(err);
    return makeMissingEnvClient(err);
  }
}

export const supabase: SupabaseClient = buildClient();