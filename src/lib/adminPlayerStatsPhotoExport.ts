import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { requireSupabaseClient } from './supabaseClient';

const AFL26_SEASON_SLUG = 'afl26-season-two';
const MIN_ROUND = 1;
const MAX_ROUND = 11;
const BATCH_SIZE = 200;

type TeamRow = { id: string; name: string | null; short_name: string | null };
type FixtureRow = { id: string; round: number | null; home_team_id: string | null; away_team_id: string | null };
type ImageRow = {
  fixture_id: string;
  stat_key: string | null;
  storage_bucket: string | null;
  storage_path: string;
  mime_type: string | null;
};

export type PhotoExportResult = {
  downloaded: number;
  skipped: number;
  total: number;
};

export type PhotoExportProgress = (done: number, total: number) => void;

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

function mimeToExt(mime: string | null | undefined): string {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function resolveTeamLabel(team: TeamRow | undefined, fallbackId: string | null): string {
  return String(team?.short_name || team?.name || fallbackId || 'unknown').trim();
}

export async function exportPlayerStatsPhotos(opts: {
  seasonId?: string;
  onProgress?: PhotoExportProgress;
}): Promise<PhotoExportResult> {
  const supabase = requireSupabaseClient();

  // Resolve season — use provided ID, or look up afl26-season-two by slug
  let resolvedSeasonId: string | undefined =
    opts.seasonId && opts.seasonId !== 'all' ? opts.seasonId : undefined;

  if (!resolvedSeasonId) {
    const { data: seasons } = await supabase
      .from('eg_seasons')
      .select('id')
      .eq('slug', AFL26_SEASON_SLUG)
      .limit(1);
    resolvedSeasonId = (seasons as Array<{ id: string }> | null)?.[0]?.id;
  }

  // Query fixtures for rounds 1–11
  let fixturesQuery = supabase
    .from('eg_fixtures')
    .select('id,round,home_team_id,away_team_id')
    .gte('round', MIN_ROUND)
    .lte('round', MAX_ROUND);

  if (resolvedSeasonId) {
    fixturesQuery = fixturesQuery.eq('season_id', resolvedSeasonId);
  }

  const { data: fixturesData, error: fixturesError } = await fixturesQuery;
  if (fixturesError) throw new Error(fixturesError.message);

  const fixtures = (fixturesData as FixtureRow[] | null) ?? [];
  if (!fixtures.length) return { downloaded: 0, skipped: 0, total: 0 };

  // Hydrate team names
  const teamIds = Array.from(
    new Set(
      fixtures.flatMap((f) => [f.home_team_id, f.away_team_id].filter((id): id is string => Boolean(id))),
    ),
  );

  const teamMap = new Map<string, TeamRow>();
  for (let i = 0; i < teamIds.length; i += BATCH_SIZE) {
    const chunk = teamIds.slice(i, i + BATCH_SIZE);
    const { data: teams } = await supabase.from('eg_teams').select('id,name,short_name').in('id', chunk);
    for (const t of (teams as TeamRow[] | null) ?? []) {
      teamMap.set(t.id, t);
    }
  }

  const fixtureMap = new Map<string, FixtureRow>(fixtures.map((f) => [f.id, f]));
  const fixtureIds = fixtures.map((f) => f.id);

  // Query player_stat images in batches
  const images: ImageRow[] = [];
  for (let i = 0; i < fixtureIds.length; i += BATCH_SIZE) {
    const chunk = fixtureIds.slice(i, i + BATCH_SIZE);
    const { data: rows, error: imgError } = await supabase
      .from('eg_fixture_submission_images')
      .select('fixture_id,stat_key,storage_bucket,storage_path,mime_type')
      .eq('image_type', 'player_stat')
      .in('fixture_id', chunk);

    if (imgError) {
      if (imgError.message.includes('does not exist')) continue;
      throw new Error(imgError.message);
    }

    for (const row of (rows as ImageRow[] | null) ?? []) {
      if (row.storage_path) images.push(row);
    }
  }

  const total = images.length;
  if (!total) return { downloaded: 0, skipped: 0, total: 0 };

  opts.onProgress?.(0, total);

  // Build ZIP
  const zip = new JSZip();
  const root = zip.folder('Elite-Gaming-Player-Stats-Photos')!;
  const folderCounters = new Map<string, number>();
  let downloaded = 0;
  let skipped = 0;

  for (const img of images) {
    const fixture = fixtureMap.get(img.fixture_id);
    const round = fixture?.round ?? 0;
    const home = slugify(resolveTeamLabel(teamMap.get(fixture?.home_team_id ?? ''), fixture?.home_team_id ?? null));
    const away = slugify(resolveTeamLabel(teamMap.get(fixture?.away_team_id ?? ''), fixture?.away_team_id ?? null));
    const stat = slugify(img.stat_key || 'uncategorised');
    const folderPath = `Round-${padTwo(round)}/${home}-v-${away}/${stat}`;

    const count = (folderCounters.get(folderPath) ?? 0) + 1;
    folderCounters.set(folderPath, count);

    const ext = mimeToExt(img.mime_type);
    const filename = `image-${padTwo(count)}.${ext}`;

    const bucket = String(img.storage_bucket || 'Assets').trim() || 'Assets';
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(img.storage_path).data.publicUrl;

    try {
      const response = await fetch(publicUrl);
      if (!response.ok) {
        skipped++;
      } else {
        const blob = await response.blob();
        root
          .folder(`Round-${padTwo(round)}`)!
          .folder(`${home}-v-${away}`)!
          .folder(stat)!
          .file(filename, blob);
        downloaded++;
      }
    } catch {
      skipped++;
    }

    opts.onProgress?.(downloaded + skipped, total);
  }

  if (downloaded === 0) return { downloaded: 0, skipped, total };

  opts.onProgress?.(total, total);

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'Elite-Gaming-Player-Stats-Photos.zip');

  return { downloaded, skipped, total };
}
