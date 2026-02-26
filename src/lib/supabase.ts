// Backwards-compat wrapper.
// Some parts of the app import from "../lib/supabase".
// We re-export the safe client here to avoid white-screen crashes when env vars are missing/invalid.

export { supabase, hasSupabaseEnv, supabaseInitError } from './supabaseClient';