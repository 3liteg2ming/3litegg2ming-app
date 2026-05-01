import {
  normalisePlayerStatRows,
  type ExtractedPlayerStatRow,
} from '../_shared/playerStatsExtraction.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ExtractionType = 'final_score' | 'match_stats' | 'key_stats';

type OpenAiResponsePayload = {
  id?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
    code?: string;
  };
};

type LovableChatPayload = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
      refusal?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: string;
  };
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

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  const raw = text(value).toLowerCase();
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

function parseJsonBody(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error('AI response was not valid JSON');
  }
}

function normalizeGoalKickerArray(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((entry) => {
      if (typeof entry === 'string') return text(entry);
      if (entry && typeof entry === 'object') {
        return text((entry as Record<string, unknown>).name || (entry as Record<string, unknown>).playerName);
      }
      return '';
    })
    .filter(Boolean);
}

function extractOpenAiText(payload: OpenAiResponsePayload): string {
  const parts: string[] = [];
  for (const item of payload.output || []) {
    for (const block of item.content || []) {
      if ((block.type === 'output_text' || block.type === 'text') && text(block.text)) {
        parts.push(text(block.text));
      }
      if (block.type === 'refusal' && text(block.refusal)) {
        parts.push(text(block.refusal));
      }
    }
  }
  return parts.join('\n').trim();
}

function extractLovableText(payload: LovableChatPayload): string {
  const parts: string[] = [];
  for (const choice of payload.choices || []) {
    const content = text(choice.message?.content);
    if (content) parts.push(content);
    const refusal = text(choice.message?.refusal);
    if (refusal) parts.push(refusal);
  }
  return parts.join('\n').trim();
}

function providerErrorMessage(status: number, body: Record<string, unknown>) {
  const nested = body.error && typeof body.error === 'object'
    ? (body.error as Record<string, unknown>)
    : {};
  const message = text(nested.message || body.message || 'AI request failed');
  const lowered = message.toLowerCase();

  if (status === 429 || lowered.includes('rate limit')) {
    return { status: 429, message: 'AI rate limit reached. Please retry shortly.' };
  }

  if (
    lowered.includes('credit') ||
    lowered.includes('quota') ||
    lowered.includes('billing') ||
    lowered.includes('insufficient')
  ) {
    return { status: 402, message: 'AI credits exhausted. Top up the provider account and retry.' };
  }

  return { status: status >= 400 ? status : 500, message: message || 'AI request failed' };
}

function buildPrompt(extractionType: ExtractionType) {
  if (extractionType === 'final_score') {
    return [
      'Return JSON only.',
      'You are reading an AFL scoreboard screenshot.',
      'Extract the final score exactly as shown.',
      'Output JSON shape:',
      '{ "home_goals": number|null, "home_behinds": number|null, "away_goals": number|null, "away_behinds": number|null, "confidence": "high"|"medium"|"low", "extractionType": "final_score" }',
      'Use null for unreadable values.',
    ].join('\n\n');
  }

  if (extractionType === 'match_stats') {
    return [
      'Return JSON only.',
      'You are reading an AFL team-stats screenshot.',
      'Extract the visible team totals from the image.',
      'Output JSON shape:',
      '{ "team_stats": { "home": { "disposals": number|null, "kicks": number|null, "handballs": number|null, "marks": number|null, "tackles": number|null, "clearances": number|null, "hitOuts": number|null }, "away": { "disposals": number|null, "kicks": number|null, "handballs": number|null, "marks": number|null, "tackles": number|null, "clearances": number|null, "hitOuts": number|null } }, "confidence": "high"|"medium"|"low", "extractionType": "match_stats" }',
      'Use null for any stat that is not visible.',
    ].join('\n\n');
  }

  return [
    'Return JSON only.',
    'You are reading an AFL player-stat screenshot.',
    'The screenshot may show only one category such as goals, disposals, kicks, handballs, marks, tackles, hitouts, or AFL Fantasy.',
    'Even if only one stat category is visible, return one player_stats row per visible player.',
    'Never return only goal_kickers if player stat rows can be read.',
    'Always include the stat shown in that screenshot.',
    'Use null for fields not visible.',
    'Accept player names like "N. Daicos", "J.Cameron", "C. WARNER", and "S.CONIGLIO".',
    'Do not invent players or stats that are not visible.',
    'Output JSON shape:',
    '{ "player_stats": [{ "name": "Player Name", "team": "home" | "away" | null, "goals": number | null, "behinds": number | null, "disposals": number | null, "kicks": number | null, "handballs": number | null, "marks": number | null, "tackles": number | null, "hitouts": number | null, "afl_fantasy": number | null, "fantasyPoints": number | null }], "goal_kickers_home": string[], "goal_kickers_away": string[], "confidence": "high" | "medium" | "low", "extractionType": "key_stats" }',
  ].join('\n\n');
}

function normalizeKeyStatRow(row: ExtractedPlayerStatRow) {
  const fantasy = row.fantasyPoints ?? row.afl_fantasy ?? null;
  return {
    name: row.name,
    team: row.team,
    goals: row.goals,
    behinds: row.behinds,
    disposals: row.disposals,
    kicks: row.kicks,
    handballs: row.handballs,
    marks: row.marks,
    tackles: row.tackles,
    hitouts: row.hitouts,
    afl_fantasy: fantasy,
    fantasyPoints: fantasy,
  };
}

function normalizeResponsePayload(parsed: Record<string, unknown>, extractionType: ExtractionType) {
  if (extractionType === 'key_stats') {
    const rows = normalisePlayerStatRows(parsed.player_stats || parsed.playerStats || []);
    return {
      player_stats: rows.map((row) => normalizeKeyStatRow(row)),
      goal_kickers_home: normalizeGoalKickerArray(parsed.goal_kickers_home),
      goal_kickers_away: normalizeGoalKickerArray(parsed.goal_kickers_away),
      confidence: normalizeConfidence(parsed.confidence),
      extractionType: 'key_stats' as const,
    };
  }

  if (extractionType === 'final_score') {
    return {
      home_goals: Number.isFinite(Number(parsed.home_goals)) ? Number(parsed.home_goals) : null,
      home_behinds: Number.isFinite(Number(parsed.home_behinds)) ? Number(parsed.home_behinds) : null,
      away_goals: Number.isFinite(Number(parsed.away_goals)) ? Number(parsed.away_goals) : null,
      away_behinds: Number.isFinite(Number(parsed.away_behinds)) ? Number(parsed.away_behinds) : null,
      confidence: normalizeConfidence(parsed.confidence),
      extractionType: 'final_score' as const,
    };
  }

  return {
    team_stats: parsed.team_stats && typeof parsed.team_stats === 'object'
      ? parsed.team_stats
      : { home: {}, away: {} },
    confidence: normalizeConfidence(parsed.confidence),
    extractionType: 'match_stats' as const,
  };
}

async function invokeOpenAi(args: {
  apiKey: string;
  model: string;
  imageUrl: string;
  prompt: string;
}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: args.prompt },
            { type: 'input_image', image_url: args.imageUrl, detail: 'high' },
          ],
        },
      ],
      max_output_tokens: 6000,
      text: {
        format: {
          type: 'json_object',
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAiResponsePayload & Record<string, unknown>;
  if (!response.ok) {
    throw providerErrorMessage(response.status, payload);
  }

  const rawText = extractOpenAiText(payload);
  if (!rawText) {
    throw { status: 502, message: 'AI response did not contain any JSON text output.' };
  }

  return {
    model: args.model,
    responseId: text(payload.id) || null,
    rawText,
  };
}

async function invokeLovable(args: {
  apiKey: string;
  model: string;
  imageUrl: string;
  prompt: string;
}) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: args.prompt },
            {
              type: 'image_url',
              image_url: {
                url: args.imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 6000,
    }),
  });

  const payload = (await response.json()) as LovableChatPayload & Record<string, unknown>;
  if (!response.ok) {
    throw providerErrorMessage(response.status, payload);
  }

  const rawText = extractLovableText(payload);
  if (!rawText) {
    throw { status: 502, message: 'AI response did not contain any JSON text output.' };
  }

  return {
    model: args.model,
    responseId: text(payload.id) || null,
    rawText,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: { imageUrl?: string; extractionType?: ExtractionType } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const imageUrl = text(body.imageUrl);
  const extractionType = body.extractionType;
  if (!imageUrl) {
    return json({ error: 'Missing imageUrl' }, 400);
  }

  if (!extractionType || !['final_score', 'match_stats', 'key_stats'].includes(extractionType)) {
    return json({ error: 'Invalid extractionType. Expected final_score, match_stats, or key_stats.' }, 400);
  }

  const openAiKey = text(Deno.env.get('OPENAI_API_KEY'));
  const openAiModel = text(Deno.env.get('OPENAI_OCR_MODEL')) || 'gpt-4.1-mini';
  const lovableKey = text(Deno.env.get('LOVABLE_API_KEY'));
  const lovableModel = 'google/gemini-2.5-flash';

  if (!openAiKey && !lovableKey) {
    return json({ error: 'Missing AI key. Set OPENAI_API_KEY or LOVABLE_API_KEY.' }, 500);
  }

  const prompt = buildPrompt(extractionType);

  try {
    const providerResult = openAiKey
      ? await invokeOpenAi({
          apiKey: openAiKey,
          model: openAiModel,
          imageUrl,
          prompt,
        })
      : await invokeLovable({
          apiKey: lovableKey,
          model: lovableModel,
          imageUrl,
          prompt,
        });

    const parsed = parseJsonBody(providerResult.rawText);
    const normalized = normalizeResponsePayload(parsed, extractionType);

    return json({
      ...normalized,
      model: providerResult.model,
      responseId: providerResult.responseId,
    });
  } catch (error) {
    const status = Number((error as { status?: number }).status || 500) || 500;
    const message = text((error as { message?: string }).message) || 'AI extraction failed';
    if (message.toLowerCase().includes('valid json')) {
      return json({ error: 'Unparseable AI response' }, 502);
    }
    return json({ error: message }, status);
  }
});
