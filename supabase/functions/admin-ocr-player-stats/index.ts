import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  slug: string | null;
};

type PlayerRow = {
  id: string;
  name: string | null;
  full_name?: string | null;
  display_name: string | null;
  team_id: string | null;
  afl_player_id: number | null;
};

type SubmissionImageRow = {
  id: string;
  fixture_id: string;
  submission_id: string;
  image_type: string;
  page_number: number | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  ocr_status: string;
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

function text(value: unknown): string {
  return String(value || '').trim();
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded >= 0 ? rounded : null;
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((warning) => text(warning)).filter(Boolean);
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function coerceTeamSlug(rawSlug: unknown, homeTeamSlug: string, awayTeamSlug: string): string {
  const normalized = normalizeSlug(text(rawSlug));
  if (!normalized) return '';
  if (normalized === normalizeSlug(homeTeamSlug)) return homeTeamSlug;
  if (normalized === normalizeSlug(awayTeamSlug)) return awayTeamSlug;
  return text(rawSlug);
}

function extractResponseText(responseData: Record<string, unknown>): string {
  const output = Array.isArray(responseData.output) ? responseData.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const message = item as Record<string, unknown>;
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const row = block as Record<string, unknown>;
      const type = text(row.type);
      if ((type === 'output_text' || type === 'text') && text(row.text)) {
        parts.push(text(row.text));
      }
      if (type === 'refusal' && text(row.refusal)) {
        parts.push(text(row.refusal));
      }
    }
  }

  return parts.join('\n').trim();
}

function normalizeDraft(args: {
  raw: unknown;
  fixtureId: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
}) {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawPlayerStats = Array.isArray(source.playerStats) ? source.playerStats : [];

  const draft = {
    fixtureId: args.fixtureId,
    homeTeamSlug: args.homeTeamSlug,
    awayTeamSlug: args.awayTeamSlug,
    playerStats: rawPlayerStats
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const playerRef =
          row.playerRef && typeof row.playerRef === 'object'
            ? (row.playerRef as Record<string, unknown>)
            : {};
        const teamSlug = coerceTeamSlug(row.teamSlug, args.homeTeamSlug, args.awayTeamSlug);
        const playerId = text(playerRef.playerId) || null;
        const aflPlayerId = toNullableInt(playerRef.aflPlayerId);
        const playerName = text(playerRef.playerName) || null;

        if (!teamSlug || (!playerId && !aflPlayerId && !playerName)) {
          return null;
        }

        return {
          teamSlug,
          playerRef: {
            playerId,
            aflPlayerId,
            playerName,
          },
          kicks: toNullableInt(row.kicks),
          handballs: toNullableInt(row.handballs),
          disposals: toNullableInt(row.disposals),
          marks: toNullableInt(row.marks),
          tackles: toNullableInt(row.tackles),
          fantasyPoints: toNullableInt(row.fantasyPoints ?? row.fantasy_points),
        };
      })
      .filter(Boolean),
    warnings: normalizeWarnings(source.warnings),
  };

  return draft;
}

function countNullStats(playerStats: Array<Record<string, unknown>>) {
  let total = 0;
  for (const row of playerStats) {
    for (const key of ['kicks', 'handballs', 'disposals', 'marks', 'tackles', 'fantasyPoints']) {
      if (row[key] === null || row[key] === undefined) total += 1;
    }
  }
  return total;
}

function buildPrompt(args: {
  fixtureId: string;
  homeTeam: TeamRow;
  awayTeam: TeamRow;
  homePlayers: PlayerRow[];
  awayPlayers: PlayerRow[];
}) {
  const roster = {
    fixtureId: args.fixtureId,
    homeTeam: {
      id: args.homeTeam.id,
      name: args.homeTeam.short_name || args.homeTeam.name,
      slug: args.homeTeam.slug,
      roster: args.homePlayers.map((player) => ({
        playerId: player.id,
        aflPlayerId: player.afl_player_id,
        playerName: player.display_name || player.full_name || player.name,
      })),
    },
    awayTeam: {
      id: args.awayTeam.id,
      name: args.awayTeam.short_name || args.awayTeam.name,
      slug: args.awayTeam.slug,
      roster: args.awayPlayers.map((player) => ({
        playerId: player.id,
        aflPlayerId: player.afl_player_id,
        playerName: player.display_name || player.full_name || player.name,
      })),
    },
  };

  return [
    'Return JSON only.',
    'You are reading AFL player-stat screenshots from a submitted match result.',
    'Use the provided fixture roster to identify players and produce OCR extraction output.',
    'Do not invent players or teams. Match rows only to the provided roster.',
    'If a stat is unreadable, return null for that stat instead of guessing or using 0.',
    'Only use the allowed stat keys: kicks, handballs, disposals, marks, tackles, fantasyPoints.',
    'Each playerStats row must include teamSlug and playerRef with playerId, aflPlayerId, and playerName when known.',
    `Allowed teamSlug values are "${args.homeTeam.slug}" and "${args.awayTeam.slug}".`,
    'If you are unsure about a player match, still include the best roster-based playerRef and add a warning entry.',
    'Output JSON shape:',
    '{ "playerStats": [{ "teamSlug": "...", "playerRef": { "playerId": "...", "aflPlayerId": 0, "playerName": "..." }, "kicks": null, "handballs": null, "disposals": null, "marks": null, "tackles": null, "fantasyPoints": null }], "warnings": ["..."] }',
    'Fixture roster JSON:',
    JSON.stringify(roster),
  ].join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const OPENAI_OCR_MODEL = Deno.env.get('OPENAI_OCR_MODEL') || 'gpt-4.1-mini';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Server config missing' }, 500);
  }

  let body: { adminToken?: string; fixtureId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const adminToken = text(body.adminToken);
  const fixtureId = text(body.fixtureId);

  if (!adminToken || !fixtureId) {
    return json({ ok: false, error: 'adminToken and fixtureId are required' }, 400);
  }

  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: adminSession, error: adminSessionError } = await adminDb
    .from('eg_admin_sessions')
    .select('id')
    .eq('token', adminToken)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (adminSessionError) {
    return json({ ok: false, error: adminSessionError.message || 'Failed to validate admin session' }, 500);
  }

  if (!adminSession?.id) {
    return json({ ok: false, error: 'Admin session invalid or expired' }, 401);
  }

  const { data: fixture, error: fixtureError } = await adminDb
    .from('eg_fixtures')
    .select('id,home_team_id,away_team_id')
    .eq('id', fixtureId)
    .maybeSingle();

  if (fixtureError) {
    return json({ ok: false, error: fixtureError.message || 'Failed to load fixture' }, 500);
  }
  if (!fixture?.id || !fixture.home_team_id || !fixture.away_team_id) {
    return json({ ok: false, error: 'Fixture not found or missing team assignments' }, 404);
  }

  const { data: teams, error: teamError } = await adminDb
    .from('eg_teams')
    .select('id,name,short_name,slug')
    .in('id', [fixture.home_team_id, fixture.away_team_id]);

  if (teamError) {
    return json({ ok: false, error: teamError.message || 'Failed to load fixture teams' }, 500);
  }

  const teamMap = new Map<string, TeamRow>(
    ((teams || []) as TeamRow[]).map((team) => [team.id, team]),
  );
  const homeTeam = teamMap.get(fixture.home_team_id);
  const awayTeam = teamMap.get(fixture.away_team_id);

  if (!homeTeam?.slug || !awayTeam?.slug) {
    return json({ ok: false, error: 'Fixture teams are missing slugs' }, 400);
  }

  const { data: players, error: playerError } = await adminDb
    .from('eg_players')
    .select('id,name,full_name,display_name,team_id,afl_player_id')
    .in('team_id', [fixture.home_team_id, fixture.away_team_id])
    .order('display_name', { ascending: true });

  if (playerError) {
    return json({ ok: false, error: playerError.message || 'Failed to load roster players' }, 500);
  }

  const homePlayers = ((players || []) as PlayerRow[]).filter((player) => player.team_id === fixture.home_team_id);
  const awayPlayers = ((players || []) as PlayerRow[]).filter((player) => player.team_id === fixture.away_team_id);

  const { data: fixtureSubmission, error: fixtureSubmissionError } = await adminDb
    .from('eg_fixture_submissions')
    .select('id')
    .eq('fixture_id', fixtureId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fixtureSubmissionError && !fixtureSubmissionError.message.includes('does not exist')) {
    return json({ ok: false, error: fixtureSubmissionError.message || 'Failed to load fixture submission' }, 500);
  }

  if (!fixtureSubmission?.id) {
    return json({ ok: false, error: 'No submitted fixture pack found for this fixture' }, 400);
  }

  const { data: images, error: imageError } = await adminDb
    .from('eg_fixture_submission_images')
    .select('id,fixture_id,submission_id,image_type,page_number,storage_bucket,storage_path,mime_type,ocr_status')
    .eq('submission_id', fixtureSubmission.id)
    .eq('fixture_id', fixtureId)
    .eq('image_type', 'player_stat')
    .order('page_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (imageError) {
    return json({ ok: false, error: imageError.message || 'Failed to load player-stat screenshots' }, 500);
  }

  const playerStatImages = (images || []) as SubmissionImageRow[];
  if (!playerStatImages.length) {
    return json({ ok: false, error: 'No uploaded player-stat screenshots found for this fixture' }, 400);
  }

  let queueId = '';
  const sourceImages = playerStatImages.map((image) => ({
    imageId: image.id,
    bucket: image.storage_bucket,
    path: image.storage_path,
    pageNumber: image.page_number,
    mimeType: image.mime_type,
    ocrStatus: image.ocr_status,
  }));

  try {
    const { data: queueRow, error: queueInsertError } = await adminDb
      .from('eg_ocr_queue')
      .insert({
        fixture_id: fixtureId,
        status: 'running',
        source_images: sourceImages,
        result: {
          summary: {
            stage: 'starting',
            imageCount: playerStatImages.length,
          },
        },
        error: null,
      })
      .select('id')
      .single();

    if (queueInsertError) {
      return json({ ok: false, error: queueInsertError.message || 'Failed to create OCR queue row' }, 500);
    }

    queueId = text(queueRow?.id);

    const imageIds = playerStatImages.map((image) => image.id);
    const { error: processingError } = await adminDb
      .from('eg_fixture_submission_images')
      .update({ ocr_status: 'processing', ocr_confidence: null })
      .in('id', imageIds);

    if (processingError) {
      throw new Error(processingError.message || 'Failed to mark images as processing');
    }

    const signedImages = [];
    for (const image of playerStatImages) {
      const { data: signed, error: signedError } = await adminDb.storage
        .from(image.storage_bucket || 'Assets')
        .createSignedUrl(image.storage_path, 60 * 30);

      if (signedError || !signed?.signedUrl) {
        throw new Error(signedError?.message || `Failed to sign screenshot ${image.storage_path}`);
      }

      signedImages.push({
        ...image,
        signedUrl: signed.signedUrl,
      });
    }

    const prompt = buildPrompt({
      fixtureId,
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
    });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_OCR_MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
              ...signedImages.map((image) => ({
                type: 'input_image',
                image_url: image.signedUrl,
                detail: 'high',
              })),
            ],
          },
        ],
        max_output_tokens: 8000,
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    });

    const responseJson = await response.json();
    if (!response.ok) {
      const responseRecord = (responseJson || {}) as Record<string, unknown>;
      const responseError =
        responseRecord.error && typeof responseRecord.error === 'object'
          ? (responseRecord.error as Record<string, unknown>)
          : {};
      const errorMessage =
        text(responseError.message) ||
        text(responseRecord.message) ||
        'OpenAI OCR request failed';
      throw new Error(errorMessage);
    }

    const responseRecord = (responseJson || {}) as Record<string, unknown>;
    const rawText = extractResponseText(responseRecord);
    if (!rawText) {
      throw new Error('OpenAI OCR response did not include any JSON text output');
    }

    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(rawText);
    } catch {
      throw new Error('OpenAI OCR response was not valid JSON');
    }

    const draft = normalizeDraft({
      raw: parsedOutput,
      fixtureId,
      homeTeamSlug: homeTeam.slug,
      awayTeamSlug: awayTeam.slug,
    });

    if (!draft.playerStats.length) {
      throw new Error('OCR completed but did not return any player stat rows');
    }

    const warnings = draft.warnings || [];
    const summary = {
      stage: 'completed',
      imageCount: signedImages.length,
      playerStatRows: draft.playerStats.length,
      warningCount: warnings.length,
      nullStatCount: countNullStats(draft.playerStats as Array<Record<string, unknown>>),
    };

    const { error: queueSuccessError } = await adminDb
      .from('eg_ocr_queue')
      .update({
        status: 'succeeded',
        result: {
          draft,
          warnings,
          summary,
          rawText,
          rawResponseId: text(responseRecord.id) || null,
          model: OPENAI_OCR_MODEL,
        },
        error: null,
      })
      .eq('id', queueId);

    if (queueSuccessError) {
      throw new Error(queueSuccessError.message || 'Failed to store OCR result');
    }

    const { error: imageDoneError } = await adminDb
      .from('eg_fixture_submission_images')
      .update({ ocr_status: 'done', ocr_confidence: null })
      .in('id', playerStatImages.map((image) => image.id));

    if (imageDoneError) {
      throw new Error(imageDoneError.message || 'Failed to mark OCR images as done');
    }

    return json({
      ok: true,
      queueId,
      status: 'succeeded',
      summary,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR processing failed';

    if (queueId) {
      await adminDb
        .from('eg_ocr_queue')
        .update({
          status: 'failed',
          result: {
            summary: {
              stage: 'failed',
              imageCount: playerStatImages.length,
            },
          },
          error: message,
        })
        .eq('id', queueId);
    }

    await adminDb
      .from('eg_fixture_submission_images')
      .update({ ocr_status: 'failed', ocr_confidence: null })
      .in('id', playerStatImages.map((image) => image.id));

    return json({ ok: false, error: message, queueId: queueId || null }, 500);
  }
});
