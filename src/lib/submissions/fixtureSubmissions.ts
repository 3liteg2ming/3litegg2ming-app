import { supabase } from '@/lib/supabaseClient';

export type FixtureSubmissionStatus =
  | 'draft'
  | 'processing'
  | 'ready'
  | 'needs_review'
  | 'approved'
  | 'rejected';

export type FixtureSubmissionImageType =
  | 'player_stat'
  | 'team_stats'
  | 'match_summary'
  | 'worm'
  | 'quarter_breakdown';

export type FixtureSubmissionStatKey =
  | 'clearances'
  | 'tackles'
  | 'disposals'
  | 'marks'
  | 'kicks'
  | 'handballs';

export type CreateSubmissionOptions = {
  submittedTeamId?: string | null;
  notes?: string | null;
};

export type AddSubmissionImageInput = {
  fixtureId: string;
  imageType: FixtureSubmissionImageType;
  statKey?: FixtureSubmissionStatKey | null;
  pageNumber?: number | null;
  storageBucket?: string;
  storagePath: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  ocrStatus?: 'pending' | 'processing' | 'done' | 'failed';
  ocrConfidence?: number | null;
};

export type FixturePlayerStatUpsertRow = {
  player_id: string;
  team_id: string;
  disposals?: number | null;
  kicks?: number | null;
  handballs?: number | null;
  marks?: number | null;
  tackles?: number | null;
  clearances?: number | null;
};

function assertUuid(value: string, fieldName: string) {
  const v = String(value || '').trim();
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  if (!ok) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const int = Math.max(0, Math.floor(n));
  return int;
}

function sanitizePlayerStatRow(row: FixturePlayerStatUpsertRow): FixturePlayerStatUpsertRow {
  return {
    player_id: String(row.player_id || '').trim(),
    team_id: String(row.team_id || '').trim(),
    disposals: toIntOrNull(row.disposals),
    kicks: toIntOrNull(row.kicks),
    handballs: toIntOrNull(row.handballs),
    marks: toIntOrNull(row.marks),
    tackles: toIntOrNull(row.tackles),
    clearances: toIntOrNull(row.clearances),
  };
}

export async function createSubmission(
  fixtureId: string,
  options: CreateSubmissionOptions = {}
): Promise<string> {
  assertUuid(fixtureId, 'fixtureId');
  if (options.submittedTeamId) assertUuid(options.submittedTeamId, 'submittedTeamId');

  const { data, error } = await supabase.rpc('eg_create_fixture_submission', {
    p_fixture_id: fixtureId,
    p_submitted_team_id: options.submittedTeamId ?? null,
    p_notes: options.notes ?? null,
  });

  if (error) {
    console.error('[fixtureSubmissions] createSubmission failed:', error);
    throw new Error(error.message || 'Failed to create fixture submission');
  }

  const submissionId = String(data || '').trim();
  if (!submissionId) {
    throw new Error('Failed to create fixture submission: empty submission id');
  }
  return submissionId;
}

export async function addSubmissionImage(
  submissionId: string,
  input: AddSubmissionImageInput
): Promise<string> {
  assertUuid(submissionId, 'submissionId');
  assertUuid(input.fixtureId, 'fixtureId');

  const payload = {
    submission_id: submissionId,
    fixture_id: input.fixtureId,
    image_type: input.imageType,
    stat_key: input.statKey ?? null,
    page_number: input.pageNumber ?? null,
    storage_bucket: input.storageBucket || 'Assets',
    storage_path: String(input.storagePath || '').trim(),
    mime_type: input.mimeType ?? null,
    width: toIntOrNull(input.width),
    height: toIntOrNull(input.height),
    ocr_status: input.ocrStatus ?? 'pending',
    ocr_confidence:
      input.ocrConfidence === null || input.ocrConfidence === undefined
        ? null
        : Math.max(0, Math.min(1, Number(input.ocrConfidence))),
  };

  if (!payload.storage_path) {
    throw new Error('storagePath is required');
  }

  const { data, error } = await supabase
    .from('eg_fixture_submission_images')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[fixtureSubmissions] addSubmissionImage failed:', error);
    throw new Error(error.message || 'Failed to insert submission image metadata');
  }

  const imageId = String(data?.id || '').trim();
  if (!imageId) {
    throw new Error('Failed to insert submission image metadata: empty id');
  }
  return imageId;
}

export async function upsertPlayerStats(
  fixtureId: string,
  rows: FixturePlayerStatUpsertRow[]
): Promise<void> {
  assertUuid(fixtureId, 'fixtureId');

  const sanitized = (rows || [])
    .map(sanitizePlayerStatRow)
    .filter((r) => {
      if (!r.player_id || !r.team_id) return false;
      try {
        assertUuid(r.player_id, 'player_id');
        assertUuid(r.team_id, 'team_id');
        return true;
      } catch {
        return false;
      }
    });

  const { error } = await supabase.rpc('eg_upsert_fixture_player_stats', {
    p_fixture_id: fixtureId,
    p_rows: sanitized,
  });

  if (error) {
    console.error('[fixtureSubmissions] upsertPlayerStats failed:', error);
    throw new Error(error.message || 'Failed to upsert fixture player stats');
  }
}
