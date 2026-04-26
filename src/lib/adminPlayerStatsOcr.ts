import type { AdminPlayerStatsOcrDraftRow, AdminPlayerStatsOcrResult } from './adminTypes';
import { egRunOcrOnImage } from './egOcr';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

type SupportedStatKey =
  | 'kicks'
  | 'handballs'
  | 'disposals'
  | 'marks'
  | 'tackles'
  | 'fantasyPoints'
  | 'goals'
  | 'behinds';

type TrackedStatKey = keyof Pick<
  AdminPlayerStatsOcrDraftRow,
  'kicks' | 'handballs' | 'disposals' | 'marks' | 'tackles' | 'fantasyPoints'
>;

export type LocalPlayerStatsOcrPlayer = {
  id: string;
  teamSlug: string;
  playerName: string;
  aflPlayerId: number | null;
};

export type LocalPlayerStatsOcrScreenshot = {
  id?: string;
  url: string;
  pageNumber?: number | null;
  label?: string | null;
  bucket?: string | null;
  path?: string | null;
};

export type LocalPlayerStatsOcrPage = {
  pageNumber?: number | null;
  label?: string | null;
  text: string;
};

export type LocalPlayerStatsOcrProgress = {
  phase: 'fetching' | 'ocr' | 'parsing';
  pageIndex: number;
  pageCount: number;
  label: string;
};

type IndexedPlayer = LocalPlayerStatsOcrPlayer & {
  fullNameNormalized: string;
  fullNameCompact: string;
  firstName: string;
  lastName: string;
  initials: string[];
};

type CandidateMatch = {
  player: IndexedPlayer;
  score: number;
};

type PageCandidate = {
  raw: string;
  index: number;
};

const TRACKED_STAT_KEYS: TrackedStatKey[] = [
  'kicks',
  'handballs',
  'disposals',
  'marks',
  'tackles',
  'fantasyPoints',
];

const STAT_LIMITS: Record<SupportedStatKey, number> = {
  kicks: 60,
  handballs: 60,
  disposals: 80,
  marks: 30,
  tackles: 30,
  fantasyPoints: 250,
  goals: 20,
  behinds: 20,
};

const OCR_CORRECTIONS: Array<[RegExp, string]> = [
  [/[|!]/g, 'l'],
  [/0/g, 'o'],
  [/5/g, 's'],
  [/\$/g, 's'],
];

function applyOcrCorrections(value: string): string {
  let next = String(value || '');
  for (const [pattern, replacement] of OCR_CORRECTIONS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeName(value: string): string {
  return applyOcrCorrections(String(value || ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactName(value: string): string {
  return normalizeName(value).replace(/\s+/g, '');
}

function tokenizeName(value: string): string[] {
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeCandidateForValue(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function diceCoefficient(a: string, b: string): number {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftBigrams = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    leftBigrams.set(gram, (leftBigrams.get(gram) || 0) + 1);
  }

  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const count = leftBigrams.get(gram) || 0;
    if (count > 0) {
      leftBigrams.set(gram, count - 1);
      overlap += 1;
    }
  }

  return (2 * overlap) / (left.length + right.length - 2);
}

function hasLetters(value: string): boolean {
  return /[a-z]/i.test(value);
}

function buildCandidates(text: string): PageCandidate[] {
  const lines = String(text || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const candidates: PageCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1] || '';
    if (!hasLetters(current)) continue;

    const options = [current];
    if (next) {
      const nextHasLetters = hasLetters(next);
      if (!nextHasLetters || current.length <= 42) {
        options.push(`${current} ${next}`);
      }
    }

    for (const option of options) {
      const trimmed = option.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      candidates.push({ raw: trimmed, index });
    }
  }

  return candidates;
}

function buildIndexedPlayers(players: LocalPlayerStatsOcrPlayer[]): IndexedPlayer[] {
  return players
    .map((player) => {
      const tokens = tokenizeName(player.playerName);
      const firstName = tokens[0] || '';
      const lastName = tokens[tokens.length - 1] || '';
      return {
        ...player,
        fullNameNormalized: tokens.join(' '),
        fullNameCompact: tokens.join(''),
        firstName,
        lastName,
        initials: firstName ? [firstName[0]] : [],
      };
    })
    .filter((player) => player.fullNameNormalized && player.lastName);
}

function detectPageStatKey(text: string): SupportedStatKey | null {
  const header = String(text || '')
    .split(/\r?\n+/)
    .slice(0, 16)
    .join(' ')
    .toLowerCase();

  const scores = new Map<SupportedStatKey, number>();

  function addScore(key: SupportedStatKey, pattern: RegExp, weight = 1) {
    const matches = header.match(pattern);
    if (matches?.length) {
      scores.set(key, (scores.get(key) || 0) + matches.length * weight);
    }
  }

  addScore('fantasyPoints', /\bafl fantasy\b/g, 4);
  addScore('fantasyPoints', /\bfantasy points?\b/g, 4);
  addScore('fantasyPoints', /\bfantasy\b/g, 2);
  addScore('disposals', /\bdisposals?\b/g, 4);
  addScore('disposals', /\bdisposal\b/g, 3);
  addScore('kicks', /\bkicks?\b/g, 4);
  addScore('handballs', /\bhandballs?\b/g, 4);
  addScore('handballs', /\bhandball\b/g, 3);
  addScore('marks', /\bmarks?\b/g, 4);
  addScore('marks', /\bmark\b/g, 3);
  addScore('tackles', /\btackles?\b/g, 4);
  addScore('tackles', /\btackle\b/g, 3);
  addScore('goals', /\bgoals?\b/g, 3);
  addScore('behinds', /\bbehinds?\b/g, 3);

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked.length) return null;

  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    return null;
  }

  return ranked[0][1] > 0 ? ranked[0][0] : null;
}

function findBestPlayerMatch(candidate: string, players: IndexedPlayer[], lastNameCounts: Map<string, number>): CandidateMatch | null {
  const normalized = normalizeName(candidate);
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return null;

  let best: CandidateMatch | null = null;
  let secondBestScore = 0;

  for (const player of players) {
    let score = 0;
    const includesFull = normalized.includes(player.fullNameNormalized);
    const includesLast = player.lastName.length > 2 && normalized.includes(player.lastName);
    const includesFirst = player.firstName.length > 1 && normalized.includes(player.firstName);

    if (includesFull) {
      score = 1;
    } else if (includesLast && includesFirst) {
      score = 0.96;
    } else if (
      includesLast &&
      player.initials.some(
        (initial) =>
          normalized.includes(`${initial} ${player.lastName}`) ||
          normalized.includes(`${initial}${player.lastName}`) ||
          normalized.includes(`${player.lastName} ${initial}`),
      )
    ) {
      score = 0.91;
    } else if (includesLast && (lastNameCounts.get(player.lastName) || 0) === 1) {
      score = 0.82;
    } else {
      const fuzzy = Math.max(
        diceCoefficient(normalized, player.fullNameNormalized),
        diceCoefficient(compact, player.fullNameCompact),
      );
      if (fuzzy >= 0.9) {
        score = fuzzy;
      } else if (includesLast && fuzzy >= 0.78) {
        score = fuzzy;
      }
    }

    if (score <= 0) continue;

    if (!best || score > best.score) {
      secondBestScore = best?.score || secondBestScore;
      best = { player, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!best || best.score < 0.8) return null;
  if (best.score < 0.95 && secondBestScore > 0 && best.score - secondBestScore < 0.04) {
    return null;
  }

  return best;
}

function pickStatValue(candidate: string, player: IndexedPlayer, statKey: SupportedStatKey): number | null {
  const normalized = normalizeCandidateForValue(candidate);
  const tokens = normalized.match(/[a-z']+|\d+/g) || [];
  if (!tokens.length) return null;

  let surnameIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!/[a-z]/.test(token)) continue;
    const cleaned = normalizeName(token);
    if (cleaned === player.lastName || cleaned.endsWith(player.lastName) || player.lastName.endsWith(cleaned)) {
      surnameIndex = index;
      break;
    }
  }

  const numericTokens = tokens
    .map((token, index) => ({ token, index }))
    .filter((item) => /^\d+$/.test(item.token))
    .map((item) => ({ value: Number(item.token), index: item.index }))
    .filter((item) => Number.isFinite(item.value) && item.value >= 0 && item.value <= STAT_LIMITS[statKey]);

  if (!numericTokens.length) return null;

  if (surnameIndex >= 0) {
    const numbersAfterSurname = numericTokens.filter((item) => item.index > surnameIndex);
    const closeNumbers = numbersAfterSurname.filter((item) => item.index - surnameIndex <= 4);
    if (closeNumbers.length) {
      return closeNumbers[closeNumbers.length - 1].value;
    }
    if (numbersAfterSurname.length) {
      return numbersAfterSurname[numbersAfterSurname.length - 1].value;
    }
  }

  return numericTokens[numericTokens.length - 1].value;
}

function countNullStats(rows: AdminPlayerStatsOcrDraftRow[]): number {
  let total = 0;
  for (const row of rows) {
    for (const key of TRACKED_STAT_KEYS) {
      if (row[key] == null) total += 1;
    }
  }
  return total;
}

function chooseBetterValue(
  current: { value: number; score: number; source: string },
  incoming: { value: number; score: number; source: string },
) {
  if (incoming.score > current.score) return incoming;
  if (incoming.score === current.score && incoming.value > current.value) return incoming;
  return current;
}

export function parsePlayerStatsOcrPages(args: {
  fixtureId: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
  players: LocalPlayerStatsOcrPlayer[];
  pages: LocalPlayerStatsOcrPage[];
}): AdminPlayerStatsOcrResult {
  const indexedPlayers = buildIndexedPlayers(args.players);
  const lastNameCounts = new Map<string, number>();
  for (const player of indexedPlayers) {
    lastNameCounts.set(player.lastName, (lastNameCounts.get(player.lastName) || 0) + 1);
  }

  const warnings: string[] = [];
  const valuesByPlayer = new Map<
    string,
    {
      player: IndexedPlayer;
      stats: Partial<Record<TrackedStatKey, { value: number; score: number; source: string }>>;
    }
  >();
  const detectedPagesByStat = new Map<string, number>();
  const rawTextParts: string[] = [];
  let pagesWithMatches = 0;

  for (let pageIndex = 0; pageIndex < args.pages.length; pageIndex += 1) {
    const page = args.pages[pageIndex];
    const label = page.label || `Page ${page.pageNumber || pageIndex + 1}`;
    const text = String(page.text || '').trim();
    rawTextParts.push(`--- ${label} ---\n${text}`);

    if (!text) {
      warnings.push(`${label} produced no OCR text.`);
      continue;
    }

    const statKey = detectPageStatKey(text);
    if (!statKey) {
      warnings.push(`${label} did not clearly identify a player-stat category.`);
      continue;
    }

    detectedPagesByStat.set(statKey, (detectedPagesByStat.get(statKey) || 0) + 1);

    if (!TRACKED_STAT_KEYS.includes(statKey as TrackedStatKey)) {
      continue;
    }

    const pageMatches = new Map<string, { player: IndexedPlayer; value: number; score: number; source: string }>();
    const candidates = buildCandidates(text);

    for (const candidate of candidates) {
      const match = findBestPlayerMatch(candidate.raw, indexedPlayers, lastNameCounts);
      if (!match) continue;

      const value = pickStatValue(candidate.raw, match.player, statKey);
      if (value == null) continue;

      const existing = pageMatches.get(match.player.id);
      const next = {
        player: match.player,
        value,
        score: match.score,
        source: candidate.raw,
      };
      if (!existing) {
        pageMatches.set(match.player.id, next);
        continue;
      }

      const chosen = chooseBetterValue(existing, next);
      pageMatches.set(match.player.id, { ...existing, ...chosen });
    }

    if (!pageMatches.size) {
      warnings.push(`${label} was detected as ${statKey} but no roster players were matched.`);
      continue;
    }

    pagesWithMatches += 1;

    for (const pageMatch of pageMatches.values()) {
      const existing = valuesByPlayer.get(pageMatch.player.id) || {
        player: pageMatch.player,
        stats: {},
      };

      const current = existing.stats[statKey as TrackedStatKey];
      if (current && current.value !== pageMatch.value) {
        warnings.push(
          `${pageMatch.player.playerName} has conflicting ${statKey} values (${current.value} vs ${pageMatch.value}). Keeping the stronger OCR match.`,
        );
      }

      existing.stats[statKey as TrackedStatKey] = current
        ? chooseBetterValue(current, {
            value: pageMatch.value,
            score: pageMatch.score,
            source: pageMatch.source,
          })
        : {
            value: pageMatch.value,
            score: pageMatch.score,
            source: pageMatch.source,
          };

      valuesByPlayer.set(pageMatch.player.id, existing);
    }
  }

  const playerStats = [...valuesByPlayer.values()]
    .map((entry) => {
      const row: AdminPlayerStatsOcrDraftRow = {
        teamSlug: entry.player.teamSlug,
        playerRef: {
          playerId: entry.player.id,
          aflPlayerId: entry.player.aflPlayerId,
          playerName: entry.player.playerName,
        },
        kicks: entry.stats.kicks?.value ?? null,
        handballs: entry.stats.handballs?.value ?? null,
        disposals: entry.stats.disposals?.value ?? null,
        marks: entry.stats.marks?.value ?? null,
        tackles: entry.stats.tackles?.value ?? null,
        fantasyPoints: entry.stats.fantasyPoints?.value ?? null,
      };

      if (row.disposals == null && row.kicks != null && row.handballs != null) {
        row.disposals = row.kicks + row.handballs;
      }

      const hasTrackedStat = TRACKED_STAT_KEYS.some((key) => row[key] != null);
      return hasTrackedStat ? row : null;
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left!.teamSlug !== right!.teamSlug) return left!.teamSlug.localeCompare(right!.teamSlug);
      return String(left!.playerRef.playerName || '').localeCompare(String(right!.playerRef.playerName || ''));
    }) as AdminPlayerStatsOcrDraftRow[];

  const summary: Record<string, unknown> = {
    pagesProcessed: args.pages.length,
    pagesWithMatches,
    playerStatRows: playerStats.length,
    nullStatCount: countNullStats(playerStats),
  };

  for (const [key, count] of detectedPagesByStat.entries()) {
    summary[`pages_${key}`] = count;
  }

  return {
    draft: {
      fixtureId: args.fixtureId,
      homeTeamSlug: args.homeTeamSlug,
      awayTeamSlug: args.awayTeamSlug,
      playerStats,
      warnings,
    },
    warnings,
    summary,
    rawText: rawTextParts.join('\n\n'),
    model: 'tesseract.js-local',
  };
}

function scoreTextQuality(text: string): number {
  return (text.match(/[a-z]/gi)?.length || 0) + (text.match(/\d/g)?.length || 0) * 0.5;
}

async function preprocessOcrImage(blob: Blob): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return blob;
  }

  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Failed to load OCR image'));
      next.src = objectUrl;
    });

    const scale = image.naturalWidth > 0 && image.naturalWidth < 1600 ? Math.min(2, 1600 / image.naturalWidth) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) return blob;

    context.filter = 'grayscale(1) contrast(1.35) brightness(1.05)';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const average = (red + green + blue) / 3;
      const threshold = average > 184 ? 255 : 0;
      imageData.data[index] = threshold;
      imageData.data[index + 1] = threshold;
      imageData.data[index + 2] = threshold;
    }
    context.putImageData(imageData, 0, 0);

    const processed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return processed || blob;
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

export async function runLocalPlayerStatsOcr(args: {
  fixtureId: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
  players: LocalPlayerStatsOcrPlayer[];
  screenshots: LocalPlayerStatsOcrScreenshot[];
  onProgress?: (progress: LocalPlayerStatsOcrProgress) => void;
}): Promise<AdminPlayerStatsOcrResult> {
  const pages: LocalPlayerStatsOcrPage[] = [];
  const warnings: string[] = [];
  const total = args.screenshots.length;

  for (let index = 0; index < args.screenshots.length; index += 1) {
    const screenshot = args.screenshots[index];
    const label = screenshot.label || `Page ${screenshot.pageNumber || index + 1}`;
    args.onProgress?.({ phase: 'fetching', pageIndex: index + 1, pageCount: total, label });

    try {
      let originalBlob: Blob | null = null;

      if (screenshot.bucket && screenshot.path) {
        const download = await supabase.storage.from(screenshot.bucket).download(screenshot.path);
        if (!download.error && download.data) {
          originalBlob = download.data;
        }
      }

      if (!originalBlob) {
        const response = await fetch(screenshot.url);
        if (!response.ok) {
          warnings.push(`${label} failed to download (${response.status}).`);
          continue;
        }
        originalBlob = await response.blob();
      }

      if (!originalBlob) {
        warnings.push(`${label} could not be downloaded.`);
        continue;
      }

      const processedBlob = await preprocessOcrImage(originalBlob);
      args.onProgress?.({ phase: 'ocr', pageIndex: index + 1, pageCount: total, label });

      const processedResult = await egRunOcrOnImage(processedBlob);
      let chosenText = processedResult.text;

      if (scoreTextQuality(chosenText) < 60) {
        const fallbackResult = await egRunOcrOnImage(originalBlob);
        if (scoreTextQuality(fallbackResult.text) > scoreTextQuality(chosenText)) {
          chosenText = fallbackResult.text;
        }
      }

      pages.push({
        pageNumber: screenshot.pageNumber,
        label,
        text: chosenText,
      });
    } catch (error) {
      warnings.push(`${label} could not be read: ${error instanceof Error ? error.message : 'Unknown OCR error'}`);
    }
  }

  if (!pages.length) {
    throw new Error('No player-stat screenshots could be read.');
  }

  args.onProgress?.({
    phase: 'parsing',
    pageIndex: pages.length,
    pageCount: pages.length,
    label: 'Parsing extracted text',
  });

  const result = parsePlayerStatsOcrPages({
    fixtureId: args.fixtureId,
    homeTeamSlug: args.homeTeamSlug,
    awayTeamSlug: args.awayTeamSlug,
    players: args.players,
    pages,
  });

  const mergedWarnings = [...result.warnings, ...warnings];
  return {
    ...result,
    draft: {
      ...result.draft,
      warnings: mergedWarnings,
    },
    warnings: mergedWarnings,
  };
}
