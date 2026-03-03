import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${crypto.randomUUID()}-${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const ADMIN_PASSCODE = Deno.env.get('ADMIN_PASSCODE');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!ADMIN_PASSCODE || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Server config missing' }, 500);
  }

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const code = String(body.code || '').trim();
  if (!code || code !== ADMIN_PASSCODE) {
    return json({ ok: false }, 401);
  }

  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = newToken();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  await adminDb.from('eg_admin_sessions').delete().lt('expires_at', new Date().toISOString());

  const { error } = await adminDb.from('eg_admin_sessions').insert({
    token,
    expires_at: expiresAt,
    created_by: 'passcode',
  });

  if (error) {
    return json({ ok: false, error: error.message || 'Failed to create admin session' }, 500);
  }

  return json({ ok: true, token, expires_in: 3600 });
});
