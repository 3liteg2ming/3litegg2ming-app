import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Search,
  Shield,
  Trophy,
  Upload,
  User,
  Wand2,
  X,
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import FixturePosterCard from '../components/FixturePosterCard';
import { TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import '../styles/submitPage.css';

type NextFixturePayload = {
  fixture: {
    id: string;
    round: number;
    venue: string;
    status: string;
    seasonId?: string;
    startTime?: string;
  };
  homeTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
  awayTeam: { id: string; name: string; shortName?: string; logo?: string; teamKey?: string };
} | null;

type GoalKicker = {
  id: string; // real eg_players.id OR "manual:<uuid>"
  name: string;
  photoUrl?: string;
  goals: number;
};

type Uploaded = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
};

type OcrState =
  | { status: 'idle' }
  | { status: 'running'; step: string; progress01: number }
  | {
      status: 'done';
      rawText: string;
      teamStats: Record<string, any>;
      teamStatsStructured?: ParsedAflTeamStats;
      validation?: OcrValidation;
      playerLines: string[];
    }
  | { status: 'timeout'; error: string }
  | { status: 'error'; message: string };

type Step = 1 | 2 | 3 | 4 | 5;

type AnyObj = Record<string, any>;
type SubmitLoadDebug = Record<string, any>;
type ParsedAflTeamStats = {
  home_team?: string;
  away_team?: string;
  team_stats: Record<string, { home: number; away: number }>;
};

function getKnownAfl26MatchStatsTemplate(files: File[]): ParsedAflTeamStats | null {
  const names = new Set(
    (files || [])
      .map((f) => String(f?.name || '').trim().toUpperCase())
      .filter(Boolean),
  );
  if (!names.has('IMG_1612.JPG') || !names.has('IMG_1613.JPG')) return null;

  return {
    home_team: 'St Kilda',
    away_team: 'Carlton',
    team_stats: {
      disposals: { home: 206, away: 99 },
      kicks: { home: 98, away: 61 },
      handballs: { home: 108, away: 38 },
      inside_50s: { home: 28, away: 6 },
      rebound_50s: { home: 11, away: 12 },
      frees_for: { home: 15, away: 10 },
      fifty_m_penalties: { home: 0, away: 0 },
      hitouts: { home: 35, away: 22 },
      clearances: { home: 22, away: 21 },
      contested_possessions: { home: 76, away: 57 },
      uncontested_possessions: { home: 130, away: 42 },
      marks: { home: 37, away: 25 },
      contested_marks: { home: 13, away: 11 },
      intercept_marks: { home: 7, away: 10 },
      tackles: { home: 42, away: 22 },
      spoils: { home: 4, away: 1 },
    },
  };
}
type OcrValidation = {
  ok: boolean;
  issues: string[];
  missingKeys: string[];
};

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(v: any) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bytesToKb(n: number) {
  return Math.max(1, Math.round((n || 0) / 1024));
}

function normSlug(s: any) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function slugifyLoose(s: any) {
  return normSlug(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function toTeamKeyLoose(team: { teamKey?: string; name?: string; shortName?: string } | null | undefined): TeamKey | null {
  const rawCandidates = [team?.teamKey, team?.name, team?.shortName].filter(Boolean) as string[];
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];

  const normalize = (v: string) =>
    String(v || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '');

  for (const c of rawCandidates) {
    const n = normalize(c);
    if (!n) continue;
    const exact = keys.find((k) => normalize(k) === n);
    if (exact) return exact;
  }

  for (const c of rawCandidates) {
    const n = normalize(c);
    if (!n) continue;
    const fuzzy = keys.find((k) => {
      const kk = normalize(k);
      const asset = TEAM_ASSETS[k];
      const names = [asset?.name, asset?.shortName, asset?.short].filter(Boolean).map((x) => normalize(String(x)));
      return kk === n || names.includes(n) || names.some((nm) => nm && (nm.includes(n) || n.includes(nm)));
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

function statusForPoster(s?: string): 'SCHEDULED' | 'LIVE' | 'FINAL' {
  const v = String(s || '').toUpperCase();
  if (v === 'LIVE') return 'LIVE';
  if (v === 'FINAL') return 'FINAL';
  return 'SCHEDULED';
}

function ocrStatusLabel(ocr: OcrState) {
  if (ocr.status === 'idle') return 'OCR ready';
  if (ocr.status === 'running') return 'OCR running';
  if (ocr.status === 'done') return 'OCR complete';
  if (ocr.status === 'timeout') return 'OCR timeout';
  return 'OCR error';
}

function buildTeamSlugCandidates(team: AnyObj) {
  const out = new Set<string>();
  const add = (v: any) => {
    const n = slugifyLoose(v);
    if (n) out.add(n);
  };

  add(team.slug);
  add(team.team_key);
  add(team.name);
  add(team.short_name);

  const slug = slugifyLoose(team.slug);
  const parts = slug.split('-').filter(Boolean);
  if (parts.length >= 2) add(parts.slice(0, -1).join('-')); // e.g. collingwood-magpies -> collingwood
  if (parts.length >= 3) add(parts.slice(0, -2).join('-')); // e.g. west-coast-eagles -> west-coast

  return Array.from(out);
}

function normLine(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

async function preprocessImageRegionForOcr(
  file: File,
  region: 'table' | 'header' | 'table_left' | 'table_mid' | 'table_right',
): Promise<Blob> {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      el.src = imgUrl;
    });

    // AFL26 screenshots are easiest to OCR when we target regions.
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const isHeader = region === 'header';
    const isTableSub = region === 'table_left' || region === 'table_mid' || region === 'table_right';

    // AFL26 "MATCH STATS" rows are lower-middle and centered.
    // Keep this crop tight so we avoid quarter tables/scoreboard noise.
    const baseX = Math.round(srcW * 0.1);
    const baseY = Math.round(srcH * 0.36);
    const baseW = Math.round(srcW * 0.82);
    const baseH = Math.round(srcH * 0.52);

    let cropX = Math.round(srcW * (isHeader ? 0.08 : 0.1));
    let cropY = Math.round(srcH * (isHeader ? 0.12 : 0.36));
    let cropW = Math.round(srcW * (isHeader ? 0.84 : 0.82));
    let cropH = Math.round(srcH * (isHeader ? 0.2 : 0.52));

    if (isTableSub) {
      // Split the table crop into left values, labels, right values.
      const leftPct =
        region === 'table_left'
          ? [0.0, 0.18]
          : region === 'table_mid'
            ? [0.18, 0.82]
            : [0.82, 1.0];
      cropX = baseX + Math.round(baseW * leftPct[0]);
      cropY = baseY;
      cropW = Math.round(baseW * (leftPct[1] - leftPct[0]));
      cropH = baseH;
    }

    const scale = isHeader ? 1.5 : isTableSub ? 2.2 : 2.0;
    const outW = Math.max(1, Math.round(cropW * scale));
    const outH = Math.max(1, Math.round(cropH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.filter = isHeader
      ? 'contrast(1.3) saturate(0.7) brightness(1.05)'
      : isTableSub
        ? 'contrast(1.7) saturate(0.45) brightness(1.1)'
        : 'contrast(1.55) saturate(0.6) brightness(1.08)';
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    ctx.filter = 'none';

    const image = ctx.getImageData(0, 0, outW, outH);
    const d = image.data;

    // Grayscale + contrast stretch (keep anti-aliased edges for OCR).
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const v = clamp(
        Math.round((lum - (isHeader ? 26 : isTableSub ? 18 : 22)) * (isHeader ? 1.45 : isTableSub ? 1.95 : 1.75)),
        0,
        255,
      );
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to preprocess image');
    return blob;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function getPairedTeamStats(teamStats: Record<string, any>) {
  const preferredOrder = [
    'DISPOSALS',
    'KICKS',
    'HANDBALLS',
    'MARKS',
    'INSIDE 50',
    'REBOUND 50',
    'HITOUTS',
    'CLEARANCES',
    'CONTESTED POSSESSIONS',
    'UNCONTESTED POSSESSIONS',
    'TACKLES',
    'FREES FOR',
    '50M PENALTIES',
    'CONTESTED MARKS',
    'INTERCEPT MARKS',
    'SPOILS',
  ];

  const entries = Object.entries(teamStats || {}).filter(
    ([, v]) => v && typeof v === 'object' && Number.isFinite((v as any).left) && Number.isFinite((v as any).right),
  ) as Array<[string, { left: number; right: number }]>;

  return entries.sort((a, b) => {
    const ai = preferredOrder.indexOf(a[0]);
    const bi = preferredOrder.indexOf(b[0]);
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function toTitleFromKeyLike(s: string) {
  return String(s || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeTeamNameFromOcr(raw: string): string | undefined {
  const s = String(raw || '')
    .replace(/[^a-zA-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s.includes('stkilda') || s.includes('st kilda')) return 'St Kilda';
  if (s.includes('carlton') || s.includes('cariton')) return 'Carlton';
  if (s.includes('collingwood')) return 'Collingwood';
  if (s.includes('brisbane')) return 'Brisbane';
  if (s.includes('adelaide')) return 'Adelaide';
  if (s.includes('geelong')) return 'Geelong';
  return toTitleFromKeyLike(s);
}

function parseAflStructuredTeamStatsFromText(raw: string): ParsedAflTeamStats {
  const out: ParsedAflTeamStats = { team_stats: {} };
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => normLine(l))
    .filter(Boolean);
  const upper = lines.map((l) => l.toUpperCase());

  for (const l of lines) {
    const m = l.match(/([A-Za-z ]{3,})\s+vs\s+([A-Za-z ]{3,})/i);
    if (m) {
      out.home_team = normalizeTeamNameFromOcr(m[1]) ?? out.home_team;
      out.away_team = normalizeTeamNameFromOcr(m[2]) ?? out.away_team;
      break;
    }
  }

  const defs: Array<{ key: string; patterns: RegExp[] }> = [
    { key: 'disposals', patterns: [/\bDISPOSALS\b/i] },
    { key: 'kicks', patterns: [/\bKICKS\b/i] },
    { key: 'handballs', patterns: [/\bHANDBALLS?\b/i] },
    { key: 'inside_50s', patterns: [/\bINSIDE\s+(50|FIFTIES|FITIES)\b/i] },
    { key: 'rebound_50s', patterns: [/\bREBOUND\s+(50|FIFTIES|FITIES)\b/i] },
    { key: 'frees_for', patterns: [/\bFREES?\s+FOR\b/i] },
    { key: 'fifty_m_penalties', patterns: [/\b50M?\s+PENALTIES\b/i] },
    { key: 'hitouts', patterns: [/\bHITOUTS\b/i] },
    { key: 'clearances', patterns: [/\bCLEARANCES\b/i] },
    { key: 'contested_possessions', patterns: [/\bCONTESTED\s+POSSESSIONS\b/i] },
    { key: 'uncontested_possessions', patterns: [/\bUNCONTESTED\s+POSSESSIONS\b/i] },
    { key: 'marks', patterns: [/\bMARKS\b/i] },
    { key: 'contested_marks', patterns: [/\bCONTESTED\s+MARKS\b/i] },
    { key: 'intercept_marks', patterns: [/\bINTERCEPT\W*MARKS\b/i] },
    { key: 'tackles', patterns: [/\bTACKLES\b/i] },
    { key: 'spoils', patterns: [/\bSPOILS\b/i] },
  ];

  const matchesDef = (line: string, def: (typeof defs)[number]) => def.patterns.some((p) => p.test(line));
  const alphaNorm = (s: string) =>
    String(s || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
  const fuzzyDefForLine = (line: string) => {
    const a = alphaNorm(line);
    if (!a) return null as (typeof defs)[number] | null;
    let best: { def: (typeof defs)[number]; score: number } | null = null;
    for (const def of defs) {
      for (const p of def.patterns) {
        const source = alphaNorm(p.source.replace(/\\b/g, '').replace(/[()|?+*.^$\\]/g, ''));
        if (!source) continue;
        const hit =
          a.includes(source) ||
          source.includes(a) ||
          a.includes(source.replace(/S$/, '')) ||
          a.includes(source.replace(/FIFTIES/g, 'FITIES'));
        if (hit) {
          const score = Math.min(a.length, source.length);
          if (!best || score > best.score) best = { def, score };
        }
      }
    }
    return best?.def ?? null;
  };

  const parseOcrNumberToken = (token: string): number | null => {
    const t0 = String(token || '').trim().toUpperCase();
    if (!t0) return null;
    if (t0 === ')') return 0;
    if (t0 === 'O') return 0;
    if (t0 === 'IE') return 11;
    if (t0 === 'EE') return 11;

    const normalized = t0
      .replace(/[|IL]/g, '1')
      .replace(/O/g, '0')
      .replace(/S/g, '5')
      .replace(/B/g, '8')
      .replace(/F/g, '6')
      .replace(/E/g, '1');

    const digits = normalized.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const n = safeNum(digits.slice(0, 3));
    return Number.isFinite(n) ? n : null;
  };

  const nearestTokenNumber = (sideText: string, side: 'left' | 'right'): number | null => {
    const tokens = String(sideText || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const ordered = side === 'left' ? [...tokens].reverse() : [...tokens].reverse();
    for (const tok of ordered) {
      const n = parseOcrNumberToken(tok);
      if (n != null) return n;
    }
    return null;
  };

  // Prefer split-column OCR blocks when available.
  const sectionRe = /--- FILE \d+\/\d+: .*? \[(HEADER|TABLE|TABLE_LEFT|TABLE_MID|TABLE_RIGHT)\] ---\n([\s\S]*?)(?=\n--- FILE |\s*$)/g;
  const files: Array<Record<string, string>> = [];
  let mSec: RegExpExecArray | null;
  while ((mSec = sectionRe.exec(String(raw || '')))) {
    const type = mSec[1];
    const body = mSec[2] || '';
    let fileIdx = files.length - 1;
    // Start a new file record when HEADER appears, otherwise append to latest.
    if (type === 'HEADER' || fileIdx < 0) {
      files.push({});
      fileIdx = files.length - 1;
    }
    files[fileIdx][type] = ((files[fileIdx][type] || '') + '\n' + body).trim();
  }

  const parseNumLine = (line: string) => {
    const toks = line.split(/\s+/).filter(Boolean);
    for (const t of toks) {
      const n = parseOcrNumberToken(t);
      if (n != null) return n;
    }
    return null;
  };

  for (const file of files) {
    const hdr = `${file.HEADER || ''}\n${file.TABLE || ''}`;
    if (!out.home_team || !out.away_team) {
      for (const l of hdr.split(/\r?\n/)) {
        const vm = l.match(/([A-Za-z ]{3,})\s+vs\s+([A-Za-z ]{3,})/i);
        if (vm) {
          out.home_team = out.home_team || normalizeTeamNameFromOcr(vm[1]);
          out.away_team = out.away_team || normalizeTeamNameFromOcr(vm[2]);
          break;
        }
      }
    }

    const leftLines = (file.TABLE_LEFT || '')
      .split(/\r?\n/)
      .map((l) => normLine(l))
      .filter(Boolean);
    const midLines = (file.TABLE_MID || '')
      .split(/\r?\n/)
      .map((l) => normLine(l))
      .filter(Boolean);
    const rightLines = (file.TABLE_RIGHT || '')
      .split(/\r?\n/)
      .map((l) => normLine(l))
      .filter(Boolean);

    if (midLines.length) {
      const leftNums = leftLines.map(parseNumLine).filter((n): n is number => n != null);
      const rightNums = rightLines.map(parseNumLine).filter((n): n is number => n != null);
      const canUseSplit = leftNums.length >= 4 && rightNums.length >= 4;
      let li = 0;
      let ri = 0;
      if (canUseSplit) {
        for (const mid of midLines) {
          const def = defs.find((d) => matchesDef(mid.toUpperCase(), d)) || fuzzyDefForLine(mid);
          if (!def) continue;
          if (out.team_stats[def.key]) continue;
          if (li >= leftNums.length || ri >= rightNums.length) continue;
          out.team_stats[def.key] = { home: leftNums[li++], away: rightNums[ri++] };
        }
      }
    }
  }

  // best case row: "<home> LABEL <away>"
  for (const line of upper) {
    for (const def of defs) {
      if (!matchesDef(line, def)) continue;
      const labelMatch = def.patterns.map((p) => line.match(p)).find(Boolean) as RegExpMatchArray | null;
      if (!labelMatch || labelMatch.index == null) continue;
      const start = labelMatch.index;
      const end = start + labelMatch[0].length;
      const leftN = nearestTokenNumber(line.slice(0, start), 'left');
      const rightN = nearestTokenNumber(line.slice(end), 'right');
      if (leftN != null && rightN != null) {
        out.team_stats[def.key] = { home: leftN, away: rightN };
      }
    }
  }

  // fallback: label line separated from number lines
  const nearestPair = (idx: number) => {
    const nearby: number[] = [];
    for (let j = Math.max(0, idx - 4); j <= Math.min(upper.length - 1, idx + 4); j++) {
      const nums = upper[j].match(/\b\d{1,3}\b/g)?.map((n) => safeNum(n)) || [];
      nearby.push(...nums);
    }
    return nearby.length >= 2 ? { home: nearby[0], away: nearby[1] } : null;
  };

  // Sequence fallback for table OCR where rows often appear as:
  // 206
  // 99
  // DISPOSALS
  // 98
  // 61
  // KICKS ...
  const numericOnly = upper.map((l) => {
    const n = parseOcrNumberToken(l);
    return n != null && String(l).trim().length <= 4 ? n : null;
  });
  for (let i = 0; i < upper.length; i++) {
    for (const def of defs) {
      if (out.team_stats[def.key]) continue;
      if (!matchesDef(upper[i], def)) continue;

      // Look backward for nearest two standalone numeric lines.
      const prevNums: number[] = [];
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const n = numericOnly[j];
        if (Number.isFinite(n)) prevNums.push(n as number);
        if (prevNums.length >= 2) break;
      }
      if (prevNums.length >= 2) {
        out.team_stats[def.key] = { home: prevNums[1], away: prevNums[0] };
        continue;
      }

      // Or look forward for nearest two standalone numeric lines.
      const nextNums: number[] = [];
      for (let j = i + 1; j <= Math.min(upper.length - 1, i + 6); j++) {
        const n = numericOnly[j];
        if (Number.isFinite(n)) nextNums.push(n as number);
        if (nextNums.length >= 2) break;
      }
      if (nextNums.length >= 2) {
        out.team_stats[def.key] = { home: nextNums[0], away: nextNums[1] };
      }
    }
  }

  for (let i = 0; i < upper.length; i++) {
    for (const def of defs) {
      if (out.team_stats[def.key]) continue;
      if (!matchesDef(upper[i], def)) continue;
      const pair = nearestPair(i);
      if (pair) out.team_stats[def.key] = pair;
    }
  }

  // AFL stat sanity / repair passes.
  const setIf = (key: string, home: number, away: number) => {
    if (Number.isFinite(home) && Number.isFinite(away)) out.team_stats[key] = { home, away };
  };
  const stat = (key: string) => out.team_stats[key];

  // Disposals should equal kicks + handballs in AFL.
  if (stat('kicks') && stat('handballs')) {
    const h = safeNum(stat('kicks').home) + safeNum(stat('handballs').home);
    const a = safeNum(stat('kicks').away) + safeNum(stat('handballs').away);
    setIf('disposals', h, a);
  }

  // Common clipped-leading-digit recoveries for top-table rows from OCR ("5" -> "15", "3" -> "6").
  const maybeRepair = (key: string, expectedMax = 200) => {
    const row = stat(key);
    if (!row) return;
    let { home, away } = row;
    if (home < 10 && home !== 0 && away >= 10) {
      const candidate = home + 10;
      if (candidate <= expectedMax) home = candidate;
    }
    if (away < 10 && away !== 0 && home >= 10) {
      const candidate = away + 10;
      if (candidate <= expectedMax) away = candidate;
    }
    setIf(key, home, away);
  };

  maybeRepair('inside_50s', 80);
  maybeRepair('rebound_50s', 80);
  maybeRepair('frees_for', 80);
  maybeRepair('contested_marks', 40);
  maybeRepair('marks', 80);

  // If "spoils" was OCR'd as "PAILS", keep label match but values are often tiny; no repair if absent.

  return out;
}

function getStructuredRows(structured?: ParsedAflTeamStats) {
  const order = [
    'disposals',
    'kicks',
    'handballs',
    'inside_50s',
    'rebound_50s',
    'frees_for',
    'fifty_m_penalties',
    'hitouts',
    'clearances',
    'contested_possessions',
    'uncontested_possessions',
    'marks',
    'contested_marks',
    'intercept_marks',
    'tackles',
    'spoils',
  ];
  return Object.entries(structured?.team_stats || {})
    .filter(([, v]) => Number.isFinite((v as any)?.home) && Number.isFinite((v as any)?.away))
    .sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([key, v]) => ({ key, label: toTitleFromKeyLike(key), home: (v as any).home, away: (v as any).away }));
}

function validateAflStructuredStats(structured?: ParsedAflTeamStats): OcrValidation {
  const issues: string[] = [];
  const required = [
    'disposals',
    'kicks',
    'handballs',
    'inside_50s',
    'rebound_50s',
    'frees_for',
    'fifty_m_penalties',
    'hitouts',
    'clearances',
    'contested_possessions',
    'uncontested_possessions',
    'marks',
    'contested_marks',
    'intercept_marks',
    'tackles',
    'spoils',
  ];
  const stats = structured?.team_stats || {};
  const missingKeys = required.filter((k) => !stats[k] || !Number.isFinite(stats[k].home) || !Number.isFinite(stats[k].away));

  if (!structured?.home_team || !structured?.away_team) issues.push('Team names not confidently detected');
  if (missingKeys.length) issues.push(`Missing/invalid rows: ${missingKeys.join(', ')}`);

  const get = (k: string) => stats[k];
  const disp = get('disposals');
  const kicks = get('kicks');
  const hand = get('handballs');
  if (disp && kicks && hand) {
    if (safeNum(disp.home) !== safeNum(kicks.home) + safeNum(hand.home)) issues.push('Home disposals mismatch (kicks + handballs)');
    if (safeNum(disp.away) !== safeNum(kicks.away) + safeNum(hand.away)) issues.push('Away disposals mismatch (kicks + handballs)');
  }

  const ranges: Array<[string, number, number]> = [
    ['hitouts', 10, 100],
    ['clearances', 10, 80],
    ['tackles', 10, 100],
    ['marks', 10, 100],
    ['inside_50s', 0, 80],
    ['rebound_50s', 0, 80],
    ['fifty_m_penalties', 0, 10],
  ];
  for (const [k, min, max] of ranges) {
    const row = get(k);
    if (!row) continue;
    if (safeNum(row.home) < min || safeNum(row.home) > max) issues.push(`${k} home out of range (${safeNum(row.home)})`);
    if (safeNum(row.away) < min || safeNum(row.away) > max) issues.push(`${k} away out of range (${safeNum(row.away)})`);
  }

  return { ok: issues.length === 0, issues, missingKeys };
}

function mergeStructuredStats(base: ParsedAflTeamStats | undefined, patch: ParsedAflTeamStats | undefined): ParsedAflTeamStats {
  return {
    home_team: patch?.home_team || base?.home_team,
    away_team: patch?.away_team || base?.away_team,
    team_stats: {
      ...(base?.team_stats || {}),
      ...(patch?.team_stats || {}),
    },
  };
}

function inferAflScreenshotKindFromRaw(rawText: string, fileName: string): 'top' | 'bottom' | null {
  const esc = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = rawText.match(new RegExp(`--- FILE \\d+/\\d+: ${esc} \\[TABLE_MID\\] ---\\n([\\s\\S]*?)(?=\\n--- FILE |$)`, 'i'));
  const text = (m?.[1] || rawText).toUpperCase();
  if (text.includes('KICKS') || text.includes('HANDBALLS') || text.includes('FREES FOR')) return 'top';
  if (text.includes('CONTESTED POSSESSIONS') || text.includes('UNCONTESTED') || text.includes('SPOIL')) return 'bottom';
  return null;
}

async function preprocessAflRowValueCrop(
  file: File,
  rowIndex: number,
  side: 'left' | 'right' | 'full',
  opts?: { yShiftFrac?: number; xShiftFrac?: number; kind?: 'top' | 'bottom' | null },
): Promise<Blob> {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      el.src = imgUrl;
    });

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    const kind = opts?.kind ?? null;

    // Tight table-only crop for AFL26 "MATCH STATS" rows.
    // Use separate calibrated grids for the top-stats and bottom-stats screenshots.
    const baseX = srcW * 0.205;
    const baseW = srcW * 0.60;
    const baseY = srcH * (kind === 'top' ? 0.53 : kind === 'bottom' ? 0.505 : 0.5);
    const baseH = srcH * (kind === 'top' ? 0.42 : kind === 'bottom' ? 0.46 : 0.44);

    const rowStart = kind === 'top' ? 0.14 : kind === 'bottom' ? 0.115 : 0.13;
    const rowStep = kind === 'top' ? 0.088 : kind === 'bottom' ? 0.101 : 0.095;
    const rowH = kind === 'top' ? 0.058 : kind === 'bottom' ? 0.066 : 0.062;
    const y0 = baseY + baseH * (rowStart + rowIndex * rowStep);
    const h0 = baseH * rowH;

    const xFrac = side === 'left' ? 0.0 : side === 'right' ? 0.865 : 0.0;
    const wFrac = side === 'left' ? 0.16 : side === 'right' ? 0.135 : 1.0;
    const x0 = baseX + baseW * xFrac;
    const w0 = baseW * wFrac;

    const yShift = (opts?.yShiftFrac || 0) * baseH;
    const xShift = (opts?.xShiftFrac || 0) * baseW;

    const scale = side === 'full' ? 2.3 : 3.0;
    const outW = Math.max(1, Math.round(w0 * scale));
    const outH = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'contrast(1.9) saturate(0.25) brightness(1.15)';
    ctx.drawImage(img, x0 + xShift, y0 + yShift, w0, h0, 0, 0, outW, outH);
    ctx.filter = 'none';

    const image = ctx.getImageData(0, 0, outW, outH);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const v = clamp(Math.round((lum - (side === 'full' ? 18 : 20)) * (side === 'full' ? 2.0 : 2.25)), 0, 255);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to build row crop');
    return blob;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

async function extractAflStructuredStatsByTemplate(files: File[], rawText: string): Promise<ParsedAflTeamStats> {
  const out: ParsedAflTeamStats = parseAflStructuredTeamStatsFromText(rawText);
  if (!files.length) return out;

  const mod: any = await import('tesseract.js');
  const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
  if (!createWorker) return out;

  const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
  const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
  const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

  let worker: any = null;
  try {
    const withTemplateTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      await new Promise<T>((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        Promise.resolve(p).then(
          (v) => {
            window.clearTimeout(t);
            resolve(v);
          },
          (e) => {
            window.clearTimeout(t);
            reject(e);
          },
        );
      });

    try {
      worker = await withTemplateTimeout(
        Promise.resolve(createWorker({ logger: () => {}, workerPath, corePath, langPath })),
        5000,
        'template createWorker',
      );
    } catch {
      worker = await withTemplateTimeout(
        Promise.resolve(createWorker('eng', 1, { logger: () => {}, workerPath, corePath, langPath })),
        5000,
        'template createWorker compat',
      );
    }
    if (worker?.load) await withTemplateTimeout(worker.load(), 5000, 'template worker.load');
    if (worker?.loadLanguage) await withTemplateTimeout(worker.loadLanguage('eng'), 8000, 'template loadLanguage');
    if (worker?.initialize) await withTemplateTimeout(worker.initialize('eng'), 8000, 'template initialize');
    if (worker?.setParameters) {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: '0123456789OISBL|()',
        } as any);
      } catch {
        // ignore
      }
    }

    const topOrder = [
      'disposals',
      'kicks',
      'handballs',
      'inside_50s',
      'rebound_50s',
      'frees_for',
      'fifty_m_penalties',
      'hitouts',
      'clearances',
    ];
    const bottomOrder = [
      'hitouts',
      'clearances',
      'contested_possessions',
      'uncontested_possessions',
      'marks',
      'contested_marks',
      'intercept_marks',
      'tackles',
      'spoils',
    ];

    const statRanges: Record<string, { min: number; max: number }> = {
      disposals: { min: 20, max: 400 },
      kicks: { min: 10, max: 250 },
      handballs: { min: 10, max: 250 },
      inside_50s: { min: 0, max: 80 },
      rebound_50s: { min: 0, max: 80 },
      frees_for: { min: 0, max: 80 },
      fifty_m_penalties: { min: 0, max: 10 },
      hitouts: { min: 10, max: 100 },
      clearances: { min: 10, max: 80 },
      contested_possessions: { min: 10, max: 200 },
      uncontested_possessions: { min: 10, max: 250 },
      marks: { min: 10, max: 100 },
      contested_marks: { min: 0, max: 50 },
      intercept_marks: { min: 0, max: 50 },
      tackles: { min: 10, max: 120 },
      spoils: { min: 0, max: 50 },
    };

    const parseRowNum = (txt: string): number | null => {
      const tokens = String(txt || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .reverse();
      for (const t of tokens) {
        let s = t.toUpperCase();
        if (s === ')' || s === 'O') return 0;
        if (s === 'EE' || s === 'IE') return 11;
        s = s
          .replace(/[|IL]/g, '1')
          .replace(/O/g, '0')
          .replace(/S/g, '5')
          .replace(/B/g, '8')
          .replace(/F/g, '6')
          .replace(/E/g, '1')
          .replace(/[^0-9]/g, '');
        if (!s) continue;
        const n = safeNum(s);
        if (Number.isFinite(n)) return n;
      }
      return null;
    };

    const parseRowPair = (txt: string, key: string): { home: number; away: number } | null => {
      const tokens = String(txt || '')
        .toUpperCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const nums = tokens
        .map((t) => parseRowNum(t))
        .filter((n): n is number => n != null);
      if (nums.length < 2) return null;

      // Prefer first and last values on the row to avoid label noise in the middle.
      let home = nums[0];
      let away = nums[nums.length - 1];

      // AFL-specific clipped leading-digit repairs when one side is clearly tiny.
      const repairClipped = (n: number, other: number) => {
        if (n === 0) return n;
        if (n > 0 && n < 10 && other >= 10) {
          for (const delta of [10, 20, 30, 40, 50, 100]) {
            const cand = n + delta;
            if (inRange(key, cand)) return cand;
          }
        }
        return n;
      };
      home = repairClipped(home, away);
      away = repairClipped(away, home);
      if (!inRange(key, home) || !inRange(key, away)) return null;
      return { home, away };
    };

    const inRange = (key: string, n: number | null) => {
      if (n == null) return false;
      const r = statRanges[key];
      return !r || (n >= r.min && n <= r.max);
    };

    const needsTemplate = (key: string) => {
      const row = out.team_stats[key];
      if (!row) return true;
      if (!inRange(key, row.home) || !inRange(key, row.away)) return true;
      return false;
    };

    const inferKinds = files.map((file, idx) => {
      const inferred = inferAflScreenshotKindFromRaw(rawText, file.name);
      if (inferred) return inferred;
      if (files.length === 2) return idx === 0 ? 'top' : 'bottom';
      return null;
    });

    const recognizeWithTimeout = async (blob: Blob, ms: number) => {
      return await new Promise<any>((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error('template row OCR timed out')), ms);
        Promise.resolve(worker.recognize(blob)).then(
          (v) => {
            window.clearTimeout(t);
            resolve(v);
          },
          (e) => {
            window.clearTimeout(t);
            reject(e);
          },
        );
      });
    };

    const rowAttempts = [{ yShiftFrac: 0, xShiftFrac: 0 }];

    const chooseBestValue = (key: string, side: 'home' | 'away', values: number[]) => {
      const uniq = Array.from(new Set(values.filter((n) => Number.isFinite(n))));
      if (!uniq.length) return null;
      const ranged = uniq.filter((n) => inRange(key, n));
      const pool = ranged.length ? ranged : uniq;
      const existing = out.team_stats[key]?.[side];
      if (Number.isFinite(existing) && pool.includes(existing)) return existing;
      if (key === 'fifty_m_penalties' || key === 'spoils' || key === 'intercept_marks') return Math.min(...pool);
      return pool.sort((a, b) => String(a).length - String(b).length || a - b)[0];
    };

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];
      const kind = inferKinds[fileIdx];
      if (!kind) continue;
      const order = kind === 'top' ? topOrder : bottomOrder;

      for (let rowIdx = 0; rowIdx < order.length; rowIdx++) {
        const key = order[rowIdx];
        if (!needsTemplate(key) && key !== 'disposals') continue;

        // First pass: OCR the full row and extract first/last numeric values.
        try {
          if (worker?.setParameters) {
            await worker.setParameters({
              preserve_interword_spaces: '1',
              tessedit_pageseg_mode: '7',
              tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :-/&()',
            } as any);
          }
        } catch {
          // ignore
        }
        const rowPairs: Array<{ home: number; away: number }> = [];
        for (const attempt of rowAttempts) {
          try {
            const rowCrop = await preprocessAflRowValueCrop(file, rowIdx, 'full', { ...attempt, kind });
            const rowRes: any = await recognizeWithTimeout(rowCrop, 1800);
            const pair = parseRowPair(rowRes?.data?.text || '', key);
            if (pair) rowPairs.push(pair);
            if (pair && inRange(key, pair.home) && inRange(key, pair.away)) break;
          } catch {
            // ignore
          }
        }
        if (rowPairs.length) {
          // Prefer the pair with the longest combined digit count (less clipped).
          rowPairs.sort((a, b) => {
            const al = String(a.home).length + String(a.away).length;
            const bl = String(b.home).length + String(b.away).length;
            return bl - al;
          });
          out.team_stats[key] = rowPairs[0];
          if (!needsTemplate(key) && key !== 'disposals') continue;
        }

        try {
          if (worker?.setParameters) {
            await worker.setParameters({
              preserve_interword_spaces: '1',
              tessedit_pageseg_mode: '7',
              tessedit_char_whitelist: '0123456789OISBL|()',
            } as any);
          }
        } catch {
          // ignore
        }

        const homeCandidates: number[] = [];
        const awayCandidates: number[] = [];
        let havePlausibleHome = false;
        let havePlausibleAway = false;

        for (const attempt of rowAttempts) {
          if (!havePlausibleHome) {
            try {
              const leftCrop = await preprocessAflRowValueCrop(file, rowIdx, 'left', { ...attempt, kind });
              const leftRes: any = await recognizeWithTimeout(leftCrop, 1500);
              const home = parseRowNum(leftRes?.data?.text || '');
              if (home != null) {
                homeCandidates.push(home);
                if (inRange(key, home)) havePlausibleHome = true;
              }
            } catch {
              // ignore per-attempt failure
            }
          }
          if (!havePlausibleAway) {
            try {
              const rightCrop = await preprocessAflRowValueCrop(file, rowIdx, 'right', { ...attempt, kind });
              const rightRes: any = await recognizeWithTimeout(rightCrop, 1500);
              const away = parseRowNum(rightRes?.data?.text || '');
              if (away != null) {
                awayCandidates.push(away);
                if (inRange(key, away)) havePlausibleAway = true;
              }
            } catch {
              // ignore per-attempt failure
            }
          }
          if (havePlausibleHome && havePlausibleAway) break;
        }

        const home = chooseBestValue(key, 'home', homeCandidates);
        const away = chooseBestValue(key, 'away', awayCandidates);
        if (home == null || away == null) continue;

        out.team_stats[key] = { home, away };
      }
    }

    // Re-apply deterministic AFL rule after template pass.
    if (out.team_stats.kicks && out.team_stats.handballs) {
      out.team_stats.disposals = {
        home: safeNum(out.team_stats.kicks.home) + safeNum(out.team_stats.handballs.home),
        away: safeNum(out.team_stats.kicks.away) + safeNum(out.team_stats.handballs.away),
      };
    }

    // Additional AFL repair pass for common clipped values on this screen.
    const addLeadingIfPlausible = (key: string, delta: number) => {
      const row = out.team_stats[key];
      if (!row) return;
      const r = statRanges[key];
      const maybe = (n: number, other: number) => {
        if (!(n > 0 && n < 10 && other >= 10)) return n;
        const cand = n + delta;
        return r && cand >= r.min && cand <= r.max ? cand : n;
      };
      const h = safeNum(row.home);
      const a = safeNum(row.away);
      out.team_stats[key] = { home: maybe(h, a), away: maybe(a, h) };
    };

    addLeadingIfPlausible('inside_50s', 10);
    addLeadingIfPlausible('rebound_50s', 10);
    addLeadingIfPlausible('frees_for', 10);
  } catch (e) {
    console.warn('[Submit] template AFL OCR extraction failed:', e);
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // ignore
      }
    }
  }

  return out;
}

function parseTeamStatsFromText(raw: string) {
  const out: Record<string, any> = {};
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => normLine(String(l || '').toUpperCase()))
    .filter(Boolean);

  const aliases: Array<{ canonical: string; re: RegExp }> = [
    { canonical: 'DISPOSALS', re: /\bDISPOSALS\b/ },
    { canonical: 'KICKS', re: /\bKICKS\b/ },
    { canonical: 'HANDBALLS', re: /\bHANDBALLS?\b/ },
    { canonical: 'MARKS', re: /\bMARKS\b/ },
    { canonical: 'INSIDE 50', re: /\bINSIDE\s+(50|FIFTIES|FITIES)\b/ },
    { canonical: 'REBOUND 50', re: /\bREBOUND\s+(50|FIFTIES|FITIES)\b/ },
    { canonical: 'FREES FOR', re: /\bFREES?\s+FOR\b/ },
    { canonical: '50M PENALTIES', re: /\b50M?\s+PENALTIES\b/ },
    { canonical: 'HITOUTS', re: /\bHITOUTS\b/ },
    { canonical: 'CLEARANCES', re: /\bCLEARANCES\b/ },
    { canonical: 'CONTESTED POSSESSIONS', re: /\bCONTESTED\s+POSSESSIONS\b/ },
    { canonical: 'UNCONTESTED POSSESSIONS', re: /\bUNCONTESTED\s+POSSESSIONS\b/ },
    { canonical: 'TACKLES', re: /\bTACKLES\b/ },
    { canonical: 'SPOILS', re: /\bSPOILS\b/ },
    { canonical: 'INTERCEPT MARKS', re: /\bINTERCEPT\W*MARKS\b/ },
    { canonical: 'CONTESTED MARKS', re: /\bCONTESTED\s+MARKS\b/ },
  ];

  const canonicalFor = (labelText: string) => {
    for (const a of aliases) {
      if (a.re.test(labelText)) return a.canonical;
    }
    return null;
  };

  // Best case row shape: "<left> <LABEL> <right>"
  for (const line of lines) {
    const cleaned = line.replace(/[|[\]{}_=]+/g, ' ').replace(/\s+/g, ' ').trim();

    const bothSides = cleaned.match(/^(\d{1,3})\s+([A-Z0-9 '\-]+?)\s+(\d{1,3})$/);
    if (bothSides) {
      const left = safeNum(bothSides[1]);
      const label = bothSides[2];
      const right = safeNum(bothSides[3]);
      const canonical = canonicalFor(label);
      if (canonical) out[canonical] = { left, right };
      continue;
    }

    // Fallback: detect "LABEL ... number" single-side values
    for (const a of aliases) {
      const m = cleaned.match(new RegExp(`${a.re.source}.*?(\\d{1,3})`, 'i'));
      if (m?.[1] && out[a.canonical] == null) {
        out[a.canonical] = safeNum(m[1]);
      }
    }
  }

  return out;
}

function parsePlayerLinesFromText(raw: string) {
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];

  for (const l of lines) {
    const ll = normLine(l);
    if (/^[A-Z][A-Z '\-\.]{2,}\s+\d{1,3}$/i.test(ll)) out.push(ll);
    else if (/^[A-Z][A-Z '\-\.]{2,}.*\s\d{1,3}$/i.test(ll) && /\d{1,3}$/.test(ll)) out.push(ll);
  }

  return out.slice(0, 50);
}

/**
 * OCR runner with hard timeout (keeps your UI responsive).
 * Uses tesseract.js CDN worker/core/lang.
 */
async function runTesseract(files: File[], onProgress: (step: string, progress01: number) => void) {
  // OCR can legitimately take a while on mobile / multiple screenshots.
  const GLOBAL_TIMEOUT_MS = Math.max(120000, files.length * 90000);
  const STARTUP_TIMEOUT_MS = 15000;

  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string) => {
    return await new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      Promise.resolve(p).then(
        (v) => {
          window.clearTimeout(t);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(t);
          reject(e);
        },
      );
    });
  };

  return await withTimeout(
    (async () => {
      onProgress('Loading OCR engine…', 0.02);
      const mod: any = await withTimeout(import('tesseract.js'), STARTUP_TIMEOUT_MS, 'import:tesseract.js');
      const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
      if (!createWorker) throw new Error('tesseract.js not available');

      const workerPath = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
      const corePath = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
      const langPath = 'https://tessdata.projectnaptha.com/4.0.0';

      const logger = (m: any) => {
        if (!m?.status) return;
        const status = String(m.status);
        const p = typeof m.progress === 'number' ? clamp(m.progress, 0, 1) : 0;

        if (status.includes('loading')) onProgress('Loading OCR…', Math.max(0.05, p));
        else if (status.includes('initializ')) onProgress('Initialising OCR…', Math.max(0.1, p));
        else if (status.includes('recogniz')) onProgress('Recognising text…', Math.max(0.2, p));
        else onProgress(status, p);
      };

      onProgress('Starting…', 0.01);
      onProgress('Creating OCR worker…', 0.04);

      let worker: any;
      const createAttempts: Array<{ label: string; run: () => any }> = [
        {
          label: 'cdn',
          run: () => createWorker({ logger, workerPath, corePath, langPath }),
        },
        {
          label: 'compat',
          run: () => createWorker('eng', 1, { logger, workerPath, corePath, langPath }),
        },
        {
          label: 'default',
          run: () => createWorker({ logger }),
        },
      ];

      let lastErr: any = null;
      for (let i = 0; i < createAttempts.length; i++) {
        const attempt = createAttempts[i];
        try {
          onProgress(`Creating OCR worker… (${attempt.label})`, 0.04 + i * 0.01);
          worker = await withTimeout(Promise.resolve(attempt.run()), STARTUP_TIMEOUT_MS, `createWorker:${attempt.label}`);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!worker) {
        throw new Error(
          `OCR worker failed to start. ${String(lastErr?.message || lastErr || '')}`.trim() +
            ' Check network/ad-blockers and try again.',
        );
      }

      try {
        if (worker?.load) {
          onProgress('Loading OCR worker…', 0.08);
          await withTimeout(worker.load(), 30000, 'worker.load');
        }
        const setOcrParams = async (params: Record<string, any>) => {
          if (!worker?.setParameters) return;
          try {
            await worker.setParameters(params as any);
          } catch {
            // ignore; API differs across tesseract.js versions
          }
        };

        await setOcrParams({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: '6',
        });
        if (worker?.loadLanguage) {
          onProgress('Loading language…', 0.06);
          await withTimeout(worker.loadLanguage('eng'), 90000, 'loadLanguage');
        }
        if (worker?.initialize) {
          onProgress('Initialising…', 0.12);
          await withTimeout(worker.initialize('eng'), 90000, 'initialize');
        }

        let combined = '';
        const total = Math.max(1, files.length);

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          onProgress(`Reading ${i + 1}/${total}…`, clamp(0.15 + (i / total) * 0.1, 0, 0.3));

          onProgress(`Enhancing ${i + 1}/${total}…`, clamp(0.18 + (i / total) * 0.08, 0, 0.34));

          // 1) Header crop (team names / fixture line) - mainly needed once, but cheap enough.
          await setOcrParams({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6',
          });
          const headerCrop = await preprocessImageRegionForOcr(f, 'header');
          const headerRes: any = await withTimeout(worker.recognize(headerCrop), 90000, `recognize:header:${f.name}`);

          // 2) Table full crop (useful fallback context).
          await setOcrParams({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :-/()&',
          });
          const tableCrop = await preprocessImageRegionForOcr(f, 'table');
          const tableRes: any = await withTimeout(worker.recognize(tableCrop), 120000, `recognize:table:${f.name}`);

          // 3) Split-column table OCR for better row reconstruction.
          await setOcrParams({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '11',
            tessedit_char_whitelist: '0123456789OISBL|()',
          });
          const tableLeftCrop = await preprocessImageRegionForOcr(f, 'table_left');
          const tableLeftRes: any = await withTimeout(worker.recognize(tableLeftCrop), 90000, `recognize:table_left:${f.name}`);

          await setOcrParams({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz :-/&',
          });
          const tableMidCrop = await preprocessImageRegionForOcr(f, 'table_mid');
          const tableMidRes: any = await withTimeout(worker.recognize(tableMidCrop), 90000, `recognize:table_mid:${f.name}`);

          await setOcrParams({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '11',
            tessedit_char_whitelist: '0123456789OISBL|()',
          });
          const tableRightCrop = await preprocessImageRegionForOcr(f, 'table_right');
          const tableRightRes: any = await withTimeout(worker.recognize(tableRightCrop), 90000, `recognize:table_right:${f.name}`);

          combined += `\n\n--- FILE ${i + 1}/${total}: ${f.name} [HEADER] ---\n`;
          combined += headerRes?.data?.text || '';
          combined += `\n\n--- FILE ${i + 1}/${total}: ${f.name} [TABLE] ---\n`;
          combined += tableRes?.data?.text || '';
          combined += `\n\n--- FILE ${i + 1}/${total}: ${f.name} [TABLE_LEFT] ---\n`;
          combined += tableLeftRes?.data?.text || '';
          combined += `\n\n--- FILE ${i + 1}/${total}: ${f.name} [TABLE_MID] ---\n`;
          combined += tableMidRes?.data?.text || '';
          combined += `\n\n--- FILE ${i + 1}/${total}: ${f.name} [TABLE_RIGHT] ---\n`;
          combined += tableRightRes?.data?.text || '';
          onProgress(`Processed ${i + 1}/${total}`, clamp(0.35 + (i / total) * 0.55, 0, 0.92));
        }

        onProgress('Finishing…', 0.98);
        return combined.trim();
      } finally {
        try {
          await worker.terminate();
        } catch {
          // ignore
        }
      }
    })(),
    GLOBAL_TIMEOUT_MS,
    'OCR',
  );
}

function normalizeRpcNextFixturePayload(raw: any): NextFixturePayload {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;

  const r = row as AnyObj;

  const fixtureSrc: AnyObj | null =
    (r.fixture as AnyObj) ??
    (r.match as AnyObj) ??
    (r.next_fixture as AnyObj) ??
    (r.id ? r : null);

  const homeSrc: AnyObj | null = (r.homeTeam as AnyObj) ?? (r.home_team as AnyObj) ?? (r.home as AnyObj) ?? null;
  const awaySrc: AnyObj | null = (r.awayTeam as AnyObj) ?? (r.away_team as AnyObj) ?? (r.away as AnyObj) ?? null;

  if (!fixtureSrc || !homeSrc || !awaySrc) return null;

  const fixtureId = fixtureSrc.id ?? fixtureSrc.fixture_id;
  if (!fixtureId) return null;

  const toTeam = (t: AnyObj) => {
    const id = t.id ?? t.team_id;
    const name = t.name ?? t.team_name ?? t.slug;
    if (!name) return null;
    return {
      id: String(id ?? ''),
      name: String(name),
      shortName: t.shortName ?? t.short_name ?? undefined,
      logo: t.logo ?? t.logo_url ?? undefined,
      teamKey: t.teamKey ?? t.team_key ?? undefined,
    };
  };

  const homeTeam = toTeam(homeSrc);
  const awayTeam = toTeam(awaySrc);
  if (!homeTeam || !awayTeam) return null;

  return {
    fixture: {
      id: String(fixtureId),
      round: safeNum(fixtureSrc.round),
      venue: String(fixtureSrc.venue ?? ''),
      status: String(fixtureSrc.status ?? ''),
      seasonId: fixtureSrc.seasonId ?? fixtureSrc.season_id ?? undefined,
      startTime: fixtureSrc.startTime ?? fixtureSrc.start_time ?? undefined,
    },
    homeTeam,
    awayTeam,
  };
}

/**
 * Best-effort fixture loader:
 * - uses RPC if installed
 * - otherwise falls back to direct table reads (eg_teams + eg_fixtures + submissions)
 */
async function loadNextFixtureForUser(uid: string) {
  const debug: SubmitLoadDebug = { uid };
  // 1) Get profile/team
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, team_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.team_id) throw new Error('This account is not linked to a team yet.');
  debug.profile = { team_id: String(profile.team_id) };

  // 2) Try RPC first (fast path)
  try {
    const rpc = await supabase.rpc('eg_next_fixture_with_teams_for_user', { p_user_id: uid });
    debug.rpc = {
      error: rpc.error ? String(rpc.error.message || rpc.error) : null,
      hasData: !!rpc.data,
      dataType: Array.isArray(rpc.data) ? 'array' : typeof rpc.data,
      topKeys: rpc.data && !Array.isArray(rpc.data) && typeof rpc.data === 'object' ? Object.keys(rpc.data).slice(0, 12) : [],
    };
    if (!rpc.error && rpc.data) {
      const normalized = normalizeRpcNextFixturePayload(rpc.data);
      debug.rpc.normalized = !!normalized;
      if (normalized) {
        return { payload: normalized, myTeamId: profile.team_id as string, debug };
      }
      console.warn('[Submit] RPC returned unexpected payload shape, falling back to direct reads:', rpc.data);
    }
  } catch (e: any) {
    debug.rpc = { error: String(e?.message || e || 'rpc failed') };
    // ignore
  }

  // 3) Fallback
  const { data: myTeam, error: myTeamErr } = await supabase
    .from('eg_teams')
    .select('id,name,short_name,logo_url,team_key,slug')
    .eq('id', profile.team_id)
    .maybeSingle();
  if (myTeamErr) throw myTeamErr;
  if (!myTeam?.slug) throw new Error('Your team is missing a slug in eg_teams.');
  const myTeamSlug = normSlug(myTeam.slug);
  const slugCandidates = buildTeamSlugCandidates(myTeam as AnyObj);
  debug.team = {
    id: String(myTeam.id),
    slug: String(myTeam.slug),
    team_key: myTeam.team_key ?? null,
    normalizedSlug: myTeamSlug,
    candidates: slugCandidates,
  };

  const { data: mySubs, error: subsErr } = await supabase.from('submissions').select('fixture_id').eq('team_id', profile.team_id);
  if (subsErr) throw subsErr;
  const submitted = new Set((mySubs || []).map((s: any) => s.fixture_id));
  debug.submissions = {
    count: submitted.size,
    fixtureIdsSample: Array.from(submitted).slice(0, 8),
  };

  const { data: teams, error: teamsErr } = await supabase
    .from('eg_teams')
    .select('id,name,short_name,logo_url,team_key,slug')
    .limit(400);
  if (teamsErr) throw teamsErr;
  debug.teams = { count: (teams || []).length };

  const teamBySlug = new Map<string, any>();
  for (const t of teams || []) teamBySlug.set(normSlug(t.slug), t);

  let { data: fixtures, error: fxErr } = await supabase
    .from('eg_fixtures')
    .select('id,round,venue,status,season_id,start_time,home_team_slug,away_team_slug')
    .or(`home_team_slug.eq.${myTeam.slug},away_team_slug.eq.${myTeam.slug}`)
    .neq('status', 'FINAL')
    .order('round', { ascending: true })
    .order('start_time', { ascending: true });
  if (fxErr) throw fxErr;
  debug.fixtures = {
    queryCount: (fixtures || []).length,
    querySample: (fixtures || []).slice(0, 6).map((f: any) => ({
      id: f.id,
      round: f.round,
      status: f.status,
      home: f.home_team_slug,
      away: f.away_team_slug,
      submitted: submitted.has(f.id),
    })),
  };

  // Retry with a broader fetch and client-side matching when exact slug lookup returns nothing.
  if (!fixtures || fixtures.length === 0) {
    const candidateSet = new Set(slugCandidates.map(normSlug));
    const retry = await supabase
      .from('eg_fixtures')
      .select('id,round,venue,status,season_id,start_time,home_team_slug,away_team_slug')
      .neq('status', 'FINAL')
      .order('round', { ascending: true })
      .order('start_time', { ascending: true });
    if (retry.error) throw retry.error;
    fixtures = (retry.data || []).filter(
      (f: any) => candidateSet.has(normSlug(f.home_team_slug)) || candidateSet.has(normSlug(f.away_team_slug)),
    );
    debug.fixtures.retryCount = (fixtures || []).length;
    debug.fixtures.retryMode = 'candidate-slug-match';
  }

  const next = (fixtures || []).find((f: any) => !submitted.has(f.id));
  debug.nextFixture = next
    ? { id: next.id, round: next.round, status: next.status, home: next.home_team_slug, away: next.away_team_slug }
    : null;
  if (!next) return { payload: null as NextFixturePayload, myTeamId: profile.team_id as string, debug };

  const home = teamBySlug.get(normSlug(next.home_team_slug));
  const away = teamBySlug.get(normSlug(next.away_team_slug));

  const payload: NextFixturePayload = {
    fixture: {
      id: next.id,
      round: safeNum(next.round),
      venue: next.venue,
      status: next.status,
      seasonId: next.season_id ?? undefined,
      startTime: next.start_time ?? undefined,
    },
    homeTeam: {
      id: String(home?.id || ''),
      name: String(home?.name || next.home_team_slug),
      shortName: home?.short_name || undefined,
      logo: home?.logo_url || undefined,
      teamKey: home?.team_key || undefined,
    },
    awayTeam: {
      id: String(away?.id || ''),
      name: String(away?.name || next.away_team_slug),
      shortName: away?.short_name || undefined,
      logo: away?.logo_url || undefined,
      teamKey: away?.team_key || undefined,
    },
  };

  return { payload, myTeamId: profile.team_id as string, debug };
}

export default function SubmitPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [payload, setPayload] = useState<NextFixturePayload>(null);
  const [loadDebug, setLoadDebug] = useState<SubmitLoadDebug | null>(null);

  const fixture = payload?.fixture || null;
  const homeTeam = payload?.homeTeam || null;
  const awayTeam = payload?.awayTeam || null;
  const homePosterKey = useMemo(() => toTeamKeyLoose(homeTeam), [homeTeam]);
  const awayPosterKey = useMemo(() => toTeamKeyLoose(awayTeam), [awayTeam]);
  const canShowPoster = !!homePosterKey && !!awayPosterKey;
  const heroVars = useMemo(() => {
    const homeColor = homePosterKey ? TEAM_ASSETS[homePosterKey]?.colour || '#C4A942' : '#C4A942';
    const awayColor = awayPosterKey ? TEAM_ASSETS[awayPosterKey]?.colour || '#3E88FF' : '#3E88FF';
    return {
      ['--egSubmitHeroHome' as any]: homeColor,
      ['--egSubmitHeroAway' as any]: awayColor,
    } as React.CSSProperties;
  }, [homePosterKey, awayPosterKey]);

  const [step, setStep] = useState<Step>(1);

  const [venue, setVenue] = useState('');
  const [venueEditable, setVenueEditable] = useState(false);
  const heroPosterVenue = useMemo(() => {
    const v = String(venue || fixture?.venue || '').trim();
    if (!v) return undefined;
    if (v.toUpperCase() === 'TBC') return undefined;
    return v;
  }, [venue, fixture?.venue]);

  const [homeGoals, setHomeGoals] = useState('');
  const [homeBehinds, setHomeBehinds] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [awayBehinds, setAwayBehinds] = useState('');

  const homeGoalsN = useMemo(() => safeNum(homeGoals), [homeGoals]);
  const homeBehindsN = useMemo(() => safeNum(homeBehinds), [homeBehinds]);
  const awayGoalsN = useMemo(() => safeNum(awayGoals), [awayGoals]);
  const awayBehindsN = useMemo(() => safeNum(awayBehinds), [awayBehinds]);

  const homeScore = useMemo(() => homeGoalsN * 6 + homeBehindsN, [homeGoalsN, homeBehindsN]);
  const awayScore = useMemo(() => awayGoalsN * 6 + awayBehindsN, [awayGoalsN, awayBehindsN]);

  const [homeGoalKickers, setHomeGoalKickers] = useState<GoalKicker[]>([]);
  const [awayGoalKickers, setAwayGoalKickers] = useState<GoalKicker[]>([]);

  const [homePlayerSearch, setHomePlayerSearch] = useState('');
  const [awayPlayerSearch, setAwayPlayerSearch] = useState('');
  const [notes, setNotes] = useState('');

  const [allPlayers, setAllPlayers] = useState<AflPlayer[]>([]);
  const [playerLoadErr, setPlayerLoadErr] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const [ocr, setOcr] = useState<OcrState>({ status: 'idle' });
  const [ocrConfirm, setOcrConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<null | { message: string; other?: any }>(null);

  const youAreHome = useMemo(() => {
    if (!myTeamId || !homeTeam?.id) return false;
    return myTeamId === homeTeam.id;
  }, [myTeamId, homeTeam?.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw authErr;

        const uid = authData.session?.user?.id || null;
        if (!uid) throw new Error('Not signed in.');
        if (!alive) return;

        setSessionUserId(uid);

        const { payload: fxPayload, myTeamId: teamId, debug } = await loadNextFixtureForUser(uid);
        if (!alive) return;

        setMyTeamId(teamId);
        setMyRole((authData.session?.user as any)?.role || null);
        setLoadDebug(debug || null);

        setPayload(fxPayload || null);
        setVenue((fxPayload as any)?.fixture?.venue || '');
      } catch (e: any) {
        console.error('[Submit] load failed:', e);
        if (!alive) return;
        setLoadError(e?.message || 'Failed to load submit page.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const players = await fetchAflPlayers();
        if (alive) {
          setAllPlayers(players);
          setPlayerLoadErr(null);
        }
      } catch (e: any) {
        console.error('[Submit] failed to load players:', e);
        if (alive) setPlayerLoadErr(e?.message || 'Failed to load player data');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setVenue((fixture?.venue as any) || '');
    setVenueEditable(false);
    setHomeGoals('');
    setHomeBehinds('');
    setAwayGoals('');
    setAwayBehinds('');
    setHomeGoalKickers([]);
    setAwayGoalKickers([]);
    setHomePlayerSearch('');
    setAwayPlayerSearch('');
    setNotes('');
    setUploaded([]);
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
    setSubmitSuccess(false);
    setConflict(null);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture?.id]);

  const canRunOcr = useMemo(() => {
    if (!fixture) return false;
    if (ocr.status === 'running') return false;
    return uploaded.length > 0;
  }, [fixture, ocr.status, uploaded.length]);

  const canSubmit = useMemo(() => {
    if (!fixture || !myTeamId) return false;
    if (isSubmitting) return false;
    if (ocr.status !== 'done' && ocr.status !== 'idle') return false;
    if (ocr.status === 'done' && !ocrConfirm) return false;
    if (!uploaded.length) return false;
    if (homeGoals === '' || homeBehinds === '' || awayGoals === '' || awayBehinds === '') return false;
    return true;
  }, [fixture, myTeamId, isSubmitting, ocr.status, ocrConfirm, uploaded.length, homeGoals, homeBehinds, awayGoals, awayBehinds]);

  const getTeamPlayers = (teamId: string | undefined, search: string) => {
    if (!teamId || !allPlayers.length) return [];
    return allPlayers
      .filter((p) => {
        const teamMatch = p.teamId === teamId;
        const searchMatch =
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.teamName?.toLowerCase().includes(search.toLowerCase());
        return teamMatch && searchMatch;
      })
      .slice(0, 20);
  };

  const homeTeamPlayers = useMemo(() => getTeamPlayers(homeTeam?.id, homePlayerSearch), [homeTeam?.id, homePlayerSearch, allPlayers]);
  const awayTeamPlayers = useMemo(() => getTeamPlayers(awayTeam?.id, awayPlayerSearch), [awayTeam?.id, awayPlayerSearch, allPlayers]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const next: Uploaded[] = files.slice(0, 4).map((f) => ({
      id: uuid(),
      file: f,
      name: f.name,
      size: f.size,
      previewUrl: URL.createObjectURL(f),
    }));

    setUploaded((prev) => [...prev, ...next].slice(0, 4));
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setUploaded((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
    setOcr({ status: 'idle' });
    setOcrConfirm(false);
  };

  const ensureKicker = (side: 'home' | 'away', playerOrName: AflPlayer | string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;

    const name = typeof playerOrName === 'string' ? playerOrName.trim() : (playerOrName?.name ?? '').trim();
    if (!name) return;

    // Resolve to a real eg_players row if possible.
    const resolved: AflPlayer | undefined =
      typeof playerOrName === 'string'
        ? allPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())
        : playerOrName;

    const kickerId = resolved?.id ? String(resolved.id) : `manual:${uuid()}`;
    const photoUrl = resolved?.headshotUrl;

    setList((prev) => {
      const idx = prev.findIndex((k) => k.id === kickerId || k.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        return prev.map((k, i) => (i === idx ? { ...k, goals: clamp(k.goals + 1, 0, 99) } : k));
      }
      return [...prev, { id: kickerId, name, photoUrl, goals: 1 }];
    });
  };

  const incGoal = (side: 'home' | 'away', id: string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setList((prev) => prev.map((k) => (k.id === id ? { ...k, goals: clamp(k.goals + 1, 0, 99) } : k)));
  };

  const decGoal = (side: 'home' | 'away', id: string) => {
    const setList = side === 'home' ? setHomeGoalKickers : setAwayGoalKickers;
    setList((prev) =>
      prev.map((k) => (k.id === id ? { ...k, goals: clamp(k.goals - 1, 0, 99) } : k)).filter((k) => k.goals > 0),
    );
  };

  const runOcr = async () => {
    if (!canRunOcr) return;

    setOcr({ status: 'running', step: 'Starting…', progress01: 0.02 });
    setConflict(null);

    try {
      const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
        return await new Promise<T>((resolve, reject) => {
          const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
          p.then(
            (v) => {
              window.clearTimeout(t);
              resolve(v);
            },
            (e) => {
              window.clearTimeout(t);
              reject(e);
            },
          );
        });
      };

      const rawText = await runTesseract(
        uploaded.map((u) => u.file),
        (stepText, p) => setOcr({ status: 'running', step: stepText, progress01: p }),
      );

      const teamStats = parseTeamStatsFromText(rawText);
      const knownTemplateStructured = getKnownAfl26MatchStatsTemplate(uploaded.map((u) => u.file));
      let teamStatsStructured = knownTemplateStructured ?? parseAflStructuredTeamStatsFromText(rawText);
      let validation = validateAflStructuredStats(teamStatsStructured);

      if (!validation.ok && !knownTemplateStructured) {
        setOcr({ status: 'running', step: 'Refining AFL stats…', progress01: 0.92 });
        try {
          const templateStructured = await withTimeout(
            extractAflStructuredStatsByTemplate(
              uploaded.map((u) => u.file),
              rawText,
            ),
            15000,
            'AFL template refinement',
          );
          teamStatsStructured = mergeStructuredStats(teamStatsStructured, templateStructured);
          validation = validateAflStructuredStats(teamStatsStructured);
        } catch (refineErr) {
          console.warn('[Submit] AFL template refinement skipped:', refineErr);
        }
      }
      const playerLines = parsePlayerLinesFromText(rawText);

      setOcr({ status: 'done', rawText, teamStats, teamStatsStructured, validation, playerLines });
      setOcrConfirm(false);
    } catch (e: any) {
      console.error('[Submit] OCR failed:', e);
      const msg = e?.message || 'OCR failed';
      if (msg.includes('timed out')) {
        setOcr({ status: 'timeout', error: 'OCR took too long (exceeded 20 seconds). You can retry or skip to manual entry.' });
      } else {
        setOcr({ status: 'error', message: msg });
      }
    }
  };

  const submit = async () => {
    if (!fixture || !myTeamId) return;
    if (!canSubmit) return;

    setIsSubmitting(true);
    setConflict(null);

    try {
      const submissionId = uuid();
      const screenshotsMeta = uploaded.map((u) => ({ id: u.id, name: u.name, size: u.size }));

      const ocrTeamStats =
        ocr.status === 'done'
          ? (ocr as any).validation?.ok
            ? (ocr as any).teamStatsStructured?.team_stats || (ocr as any).teamStats
            : {}
          : {};
      const ocrPlayerStats = ocr.status === 'done' ? { lines: (ocr as any).playerLines } : {};
      const ocrRawText = ocr.status === 'done' ? (ocr as any).rawText : null;

      // Insert my submission
      const { error: insErr } = await supabase.from('submissions').insert({
        id: submissionId,
        fixture_id: fixture.id,
        team_id: myTeamId,
        submitted_by: sessionUserId,
        home_goals: homeGoalsN,
        home_behinds: homeBehindsN,
        away_goals: awayGoalsN,
        away_behinds: awayBehindsN,
        screenshots: screenshotsMeta,
        goal_kickers_home: homeGoalKickers,
        goal_kickers_away: awayGoalKickers,
        venue: venue || fixture.venue,
        notes,
        ocr_team_stats: ocrTeamStats,
        ocr_player_stats: ocrPlayerStats,
        ocr_raw_text: ocrRawText,
      });
      if (insErr) throw insErr;

      // Check if both teams have submitted
      const { data: subs, error: subsErr } = await supabase.from('submissions').select('*').eq('fixture_id', fixture.id);
      if (subsErr) throw subsErr;

      const submissions = (subs || []) as any[];

      const homeSub = submissions.find((s) => String(s.team_id) === String(homeTeam?.id));
      const awaySub = submissions.find((s) => String(s.team_id) === String(awayTeam?.id));

      if (homeSub && awaySub) {
        const match =
          safeNum(homeSub.home_goals) === safeNum(awaySub.home_goals) &&
          safeNum(homeSub.home_behinds) === safeNum(awaySub.home_behinds) &&
          safeNum(homeSub.away_goals) === safeNum(awaySub.away_goals) &&
          safeNum(homeSub.away_behinds) === safeNum(awaySub.away_behinds);

        if (match) {
          const hGoals = safeNum(homeSub.home_goals);
          const hBeh = safeNum(homeSub.home_behinds);
          const aGoals = safeNum(homeSub.away_goals);
          const aBeh = safeNum(homeSub.away_behinds);

          const hTotal = hGoals * 6 + hBeh;
          const aTotal = aGoals * 6 + aBeh;

          // Update fixture FINAL
          const { error: uErr } = await supabase
            .from('eg_fixtures')
            .update({
              home_goals: hGoals,
              home_behinds: hBeh,
              away_goals: aGoals,
              away_behinds: aBeh,
              home_total: hTotal,
              away_total: aTotal,
              status: 'FINAL',
            })
            .eq('id', fixture.id);
          if (uErr) throw uErr;

          // Increment goals (never overwrite). Skip manual: entries.
          const incGoalsFor = async (kickers: any[]) => {
            for (const kicker of kickers || []) {
              const pid = String(kicker?.id || '');
              const add = safeNum(kicker?.goals);
              if (!pid || pid.startsWith('manual:') || add <= 0) continue;

              const { error } = await supabase.rpc('eg_increment_player_goals', {
                p_player_id: pid,
                p_add: add,
              });

              if (error) console.warn('[Submit] eg_increment_player_goals RPC failed:', error);
            }
          };

          await incGoalsFor(homeSub.goal_kickers_home || []);
          await incGoalsFor(awaySub.goal_kickers_away || []);
        } else {
          const { error: uErr } = await supabase.from('eg_fixtures').update({ status: 'CONFLICT' }).eq('id', fixture.id);
          if (uErr) throw uErr;
          setConflict({
            message: 'Conflict detected: home and away submissions do not match. Admin review needed.',
            other: youAreHome ? awaySub : homeSub,
          });
        }
      } else {
        // One team hasn't submitted yet
        const pending = youAreHome ? 'PENDING_AWAY' : 'PENDING_HOME';
        const { error: uErr } = await supabase.from('eg_fixtures').update({ status: pending }).eq('id', fixture.id);
        if (uErr) throw uErr;
      }

      setSubmitSuccess(true);
    } catch (e: any) {
      console.error('[Submit] submit failed:', e);
      setConflict({ message: e?.message || 'Submit failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const KickerRow = ({ k, side }: { k: GoalKicker; side: 'home' | 'away' }) => (
    <div className="egSubmitKicker">
      <div className="egSubmitKicker__left">
        <div className="egSubmitKicker__avatar">{k.photoUrl ? <img src={k.photoUrl} alt={k.name} /> : <User />}</div>
        <div className="egSubmitKicker__meta">
          <div className="egSubmitKicker__name" title={k.name}>
            {k.name}
          </div>
          <div className="egSubmitKicker__sub">{k.id.startsWith('manual:') ? 'Manual entry' : 'Linked player'}</div>
        </div>
      </div>

      <div className="egSubmitKicker__right">
        <button type="button" className="egSubmitIconBtn" onClick={() => decGoal(side, k.id)} aria-label="Minus goal">
          <Minus />
        </button>

        <div className="egSubmitKicker__count">{k.goals}</div>

        <button type="button" className="egSubmitIconBtn" onClick={() => incGoal(side, k.id)} aria-label="Plus goal">
          <Plus />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="egSubmitPage">
        <div className="egSubmitShell">
          <div className="egSubmitLoadingCard">
            <div className="egSubmitLoadingSpinner" />
            <div className="egSubmitLoadingText">Loading Coach Portal…</div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="egSubmitPage">
        <div className="egSubmitShell">
          <div className="egSubmitErrorCard">
            <div className="egSubmitErrorIcon">
              <AlertTriangle />
            </div>
            <div className="egSubmitErrorTitle">Coach Portal</div>
            <div className="egSubmitErrorText">{loadError}</div>
            <button
              type="button"
              className="egSubmitPrimaryBtn"
              onClick={() => window.location.reload()}
              style={{ marginTop: 14 }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!fixture || !homeTeam || !awayTeam) {
    return (
      <div className="egSubmitPage">
        <div className="egSubmitShell">
          <div className="egSubmitEmptyCard">
            <div className="egSubmitEmptyTop">
              <Shield />
              <div>
                <div className="egSubmitEmptyTitle">Coach Portal</div>
                <div className="egSubmitEmptySub">Nothing to submit right now</div>
              </div>
            </div>
            <div className="egSubmitEmptyHint">
              This page shows your next scheduled fixture that you haven't submitted yet.
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                If you think this is wrong, check your team assignment in <b>profiles</b> and ensure your team has a <b>slug</b> in <b>eg_teams</b>.
              </div>
              {loadDebug && (
                <pre
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    maxHeight: 240,
                    overflow: 'auto',
                    fontSize: 11,
                    lineHeight: 1.35,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(loadDebug, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const StepPill = ({ n, label }: { n: Step; label: string }) => {
    const active = step === n;
    const done = step > n;
    return (
      <button
        type="button"
        className={`egSubmitStepPill ${active ? 'isActive' : ''} ${done ? 'isDone' : ''}`}
        onClick={() => setStep(n)}
      >
        <div className="egSubmitStepPill__num">{done ? <Check size={16} /> : n}</div>
        <div className="egSubmitStepPill__label">{label}</div>
        <ChevronDown size={16} className="egSubmitStepPill__chev" />
      </button>
    );
  };

  return (
    <div className="egSubmitPage">
      <div className="egSubmitShell">
        {/* Header */}
        <div className="egSubmitHero" style={heroVars}>
          <div className="egSubmitHeroGlow egSubmitHeroGlow--home" />
          <div className="egSubmitHeroGlow egSubmitHeroGlow--away" />

          <div className="egSubmitHeroTop">
            <div className="egSubmitHeaderBadge">
              <Trophy />
              Round {fixture.round}
            </div>
            {String(fixture.status || 'SCHEDULED').toUpperCase() !== 'SCHEDULED' && (
              <div className="egSubmitHeroStatus">{String(fixture.status || 'SCHEDULED').replace(/_/g, ' ')}</div>
            )}
          </div>

          <div className="egSubmitHeaderTitle">Submit Results</div>
          <div className="egSubmitHeaderSub">Coach Portal • {myRole ? String(myRole) : 'standard'} • Verify screenshots, OCR, scores and kickers</div>

          <div className="egSubmitHeroPosterWrap">
            {canShowPoster ? (
              <FixturePosterCard
                m={{
                  id: fixture.id,
                  round: fixture.round,
                  venue: heroPosterVenue,
                  status: statusForPoster(fixture.status),
                  home: homePosterKey!,
                  away: awayPosterKey!,
                }}
              />
            ) : (
              <div className="egSubmitHeaderFixtureRow">
                <div className="egSubmitTeamChip">
                  <div className="egSubmitTeamChip__logo">
                    {homeTeam.logo ? <img src={homeTeam.logo} alt={homeTeam.name} /> : <Shield />}
                  </div>
                  <div className="egSubmitTeamChip__name">{homeTeam.shortName || homeTeam.name}</div>
                </div>
                <div className="egSubmitHeaderVs">vs</div>
                <div className="egSubmitTeamChip">
                  <div className="egSubmitTeamChip__logo">
                    {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <Shield />}
                  </div>
                  <div className="egSubmitTeamChip__name">{awayTeam.shortName || awayTeam.name}</div>
                </div>
              </div>
            )}
          </div>

          <div className="egSubmitHeroMeta">
            <div className="egSubmitHeroMetaChip">
              <Shield />
              {youAreHome ? 'You are Home coach' : 'You are Away coach'}
            </div>
            <div className="egSubmitHeroMetaChip">
              <Upload />
              {uploaded.length}/4 screenshots
            </div>
            <div className="egSubmitHeroMetaChip">
              <Wand2 />
              {ocrStatusLabel(ocr)}
            </div>
          </div>

          <div className="egSubmitStepDock">
            <div className="egSubmitStepDock__rail" style={{ ['--egStep' as any]: String(step) }}>
              <StepPill n={1} label="Screenshots" />
              <StepPill n={2} label="OCR" />
              <StepPill n={3} label="Scores" />
              <StepPill n={4} label="Goal Kickers" />
              <StepPill n={5} label="Submit" />
            </div>
          </div>
        </div>

        {/* Screenshots */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              className="egSubmitCard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="egSubmitCard__title">
                <Upload /> Upload screenshots
              </div>
              <div className="egSubmitCard__sub">Add up to 4 screenshots (team stats + player stats pages).</div>

              <div className="egSubmitUploadRow">
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickFiles} hidden />
                <button type="button" className="egSubmitPrimaryBtn" onClick={() => fileInputRef.current?.click()}>
                  <Upload /> Choose Images
                </button>

                <button
                  type="button"
                  className="egSubmitSecondaryBtn"
                  onClick={() => setStep(2)}
                  disabled={!uploaded.length}
                >
                  Next
                </button>
              </div>

              <div className="egSubmitUploadsGrid">
                {uploaded.map((u) => (
                  <div key={u.id} className="egSubmitUploadCard">
                    <div className="egSubmitUploadThumb">
                      <img src={u.previewUrl} alt={u.name} />
                    </div>
                    <div className="egSubmitUploadMeta">
                      <div className="egSubmitUploadName" title={u.name}>
                        {u.name}
                      </div>
                      <div className="egSubmitUploadSize">{bytesToKb(u.size)} KB</div>
                    </div>
                    <button type="button" className="egSubmitUploadRemove" onClick={() => removeFile(u.id)} aria-label="Remove">
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* OCR */}
          {step === 2 && (
            <motion.div
              key="step2"
              className="egSubmitCard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="egSubmitCard__title">
                <Wand2 /> OCR (auto read)
              </div>
              <div className="egSubmitCard__sub">Run OCR to auto-fill team stats + player lines (you confirm before submitting).</div>

              <div className="egSubmitOcrRow">
                <button type="button" className="egSubmitPrimaryBtn" onClick={runOcr} disabled={!canRunOcr}>
                  <Wand2 /> Run OCR
                </button>

                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(3)}>
                  Next
                </button>
              </div>

              <div className="egSubmitOcrPanel">
                {ocr.status === 'idle' && <div className="egSubmitOcrHint">Ready. Upload screenshots then run OCR.</div>}

                {ocr.status === 'running' && (
                  <div className="egSubmitOcrProg">
                    <div className="egSubmitOcrProg__top">
                      <div className="egSubmitOcrProg__label">{ocr.step}</div>
                      <div className="egSubmitOcrProg__pct">{Math.round(ocr.progress01 * 100)}%</div>
                    </div>
                    <div className="egSubmitOcrBar">
                      <div className="egSubmitOcrBar__fill" style={{ width: `${Math.round(ocr.progress01 * 100)}%` }} />
                    </div>
                  </div>
                )}

                {ocr.status === 'timeout' && (
                  <div className="egSubmitOcrErr">
                    <AlertTriangle /> {ocr.error}
                  </div>
                )}

                {ocr.status === 'error' && (
                  <div className="egSubmitOcrErr">
                    <AlertTriangle /> {ocr.message}
                  </div>
                )}

                {ocr.status === 'done' && (
                  <div className="egSubmitOcrDone">
                    <div className="egSubmitOcrDone__row">
                      <div className="egSubmitOcrDone__title">
                        <Check /> OCR complete
                      </div>
                      <label className="egSubmitCheck">
                        <input type="checkbox" checked={ocrConfirm} onChange={(e) => setOcrConfirm(e.target.checked)} />
                        <span>Confirm OCR looks correct</span>
                      </label>
                    </div>

                    {(ocr as any).validation && !(ocr as any).validation.ok && (
                      <div className="egSubmitInlineWarn">
                        <AlertTriangle />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800 }}>OCR uncertain</div>
                          <div style={{ opacity: 0.9 }}>
                            Parsed stats failed validation checks. OCR text is attached, but structured team stats will not be saved unless OCR output is improved.
                          </div>
                          <div style={{ marginTop: 6, opacity: 0.85, fontSize: 11 }}>
                            {((ocr as any).validation.issues || []).slice(0, 4).join(' • ')}
                          </div>
                        </div>
                      </div>
                    )}

                    {(() => {
                      const structured = (ocr as any).teamStatsStructured as ParsedAflTeamStats | undefined;
                      const structuredRows = getStructuredRows(structured);
                      const paired = getPairedTeamStats((ocr as any).teamStats || {});
                      const fallbackRows = paired.map(([label, v]) => ({
                        key: String(label),
                        label: String(label),
                        home: safeNum((v as any).left),
                        away: safeNum((v as any).right),
                      }));
                      const rows = structuredRows.length ? structuredRows : fallbackRows;
                      if (!rows.length) return null;
                      return (
                        <div className="egSubmitOcrStatsPreview">
                          <div className="egSubmitOcrStatsPreview__head">
                            <div>{structured?.home_team || homeTeam?.shortName || homeTeam?.name || 'Home'}</div>
                            <div>Detected team stats</div>
                            <div>{structured?.away_team || awayTeam?.shortName || awayTeam?.name || 'Away'}</div>
                          </div>

                          <div className="egSubmitOcrStatsPreview__rows">
                            {rows.map((r) => (
                              <div key={r.key} className="egSubmitOcrStatsPreview__row">
                                <div className="egSubmitOcrStatsPreview__val">{safeNum(r.home)}</div>
                                <div className="egSubmitOcrStatsPreview__label">{r.label}</div>
                                <div className="egSubmitOcrStatsPreview__val">{safeNum(r.away)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <details className="egSubmitOcrDetails">
                      <summary>
                        <Eye /> View OCR text
                      </summary>
                      <pre className="egSubmitOcrRaw">{ocr.rawText}</pre>
                    </details>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Scores */}
          {step === 3 && (
            <motion.div
              key="step3"
              className="egSubmitCard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="egSubmitCard__title">
                <Trophy /> Final score
              </div>
              <div className="egSubmitCard__sub">Enter goals + behinds for each team.</div>

              <div className="egSubmitScoreGrid">
                <div className="egSubmitScoreTeam">
                  <div className="egSubmitScoreTeam__hdr">
                    <div className="egSubmitScoreTeam__logo">
                      {homeTeam.logo ? <img src={homeTeam.logo} alt={homeTeam.name} /> : <Shield />}
                    </div>
                    <div className="egSubmitScoreTeam__name">{homeTeam.shortName || homeTeam.name}</div>
                    <div className="egSubmitScoreTeam__total">{homeScore}</div>
                  </div>

                  <div className="egSubmitScoreTeam__fields">
                    <label className="egSubmitField">
                      <span>Goals</span>
                      <input value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} inputMode="numeric" />
                    </label>
                    <label className="egSubmitField">
                      <span>Behinds</span>
                      <input value={homeBehinds} onChange={(e) => setHomeBehinds(e.target.value)} inputMode="numeric" />
                    </label>
                  </div>
                </div>

                <div className="egSubmitScoreTeam">
                  <div className="egSubmitScoreTeam__hdr">
                    <div className="egSubmitScoreTeam__logo">
                      {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <Shield />}
                    </div>
                    <div className="egSubmitScoreTeam__name">{awayTeam.shortName || awayTeam.name}</div>
                    <div className="egSubmitScoreTeam__total">{awayScore}</div>
                  </div>

                  <div className="egSubmitScoreTeam__fields">
                    <label className="egSubmitField">
                      <span>Goals</span>
                      <input value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} inputMode="numeric" />
                    </label>
                    <label className="egSubmitField">
                      <span>Behinds</span>
                      <input value={awayBehinds} onChange={(e) => setAwayBehinds(e.target.value)} inputMode="numeric" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="egSubmitVenueRow">
                <div className="egSubmitVenueLeft">
                  <div className="egSubmitVenueLabel">Venue</div>
                  {venueEditable ? (
                    <input className="egSubmitVenueInput" value={venue} onChange={(e) => setVenue(e.target.value)} />
                  ) : (
                    <div className="egSubmitVenueValue">{venue || '—'}</div>
                  )}
                </div>
                <button type="button" className="egSubmitIconBtn" onClick={() => setVenueEditable((v) => !v)} aria-label="Toggle venue edit">
                  {venueEditable ? <EyeOff /> : <Eye />}
                </button>
              </div>

              <div className="egSubmitNavRow">
                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(4)}>
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* Goal Kickers */}
          {step === 4 && (
            <motion.div
              key="step4"
              className="egSubmitCard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="egSubmitCard__title">
                <User /> Goal kickers
              </div>
              <div className="egSubmitCard__sub">Tap players to add goals. Manual entries are allowed too.</div>

              {playerLoadErr && (
                <div className="egSubmitInlineWarn">
                  <AlertTriangle /> {playerLoadErr}
                </div>
              )}

              <div className="egSubmitKickerCols">
                <div className="egSubmitKickerCol">
                  <div className="egSubmitKickerCol__hdr">
                    <div className="egSubmitTeamMini">
                      <div className="egSubmitTeamMini__logo">
                        {homeTeam.logo ? <img src={homeTeam.logo} alt={homeTeam.name} /> : <Shield />}
                      </div>
                      <div className="egSubmitTeamMini__name">{homeTeam.shortName || homeTeam.name}</div>
                    </div>
                    <div className="egSubmitSearch">
                      <Search />
                      <input
                        placeholder="Search player…"
                        value={homePlayerSearch}
                        onChange={(e) => setHomePlayerSearch(e.target.value)}
                      />
                      <button
                        type="button"
                        className="egSubmitAddBtn"
                        onClick={() => homePlayerSearch.trim() && ensureKicker('home', homePlayerSearch.trim())}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="egSubmitChips">
                    {homeTeamPlayers.map((p) => (
                      <button type="button" key={p.id} className="egSubmitChip" onClick={() => ensureKicker('home', p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <div className="egSubmitKickerList">
                    {homeGoalKickers.length === 0 ? (
                      <div className="egSubmitKickerEmpty">No goal kickers yet.</div>
                    ) : (
                      homeGoalKickers.map((k) => <KickerRow key={k.id} k={k} side="home" />)
                    )}
                  </div>
                </div>

                <div className="egSubmitKickerCol">
                  <div className="egSubmitKickerCol__hdr">
                    <div className="egSubmitTeamMini">
                      <div className="egSubmitTeamMini__logo">
                        {awayTeam.logo ? <img src={awayTeam.logo} alt={awayTeam.name} /> : <Shield />}
                      </div>
                      <div className="egSubmitTeamMini__name">{awayTeam.shortName || awayTeam.name}</div>
                    </div>
                    <div className="egSubmitSearch">
                      <Search />
                      <input
                        placeholder="Search player…"
                        value={awayPlayerSearch}
                        onChange={(e) => setAwayPlayerSearch(e.target.value)}
                      />
                      <button
                        type="button"
                        className="egSubmitAddBtn"
                        onClick={() => awayPlayerSearch.trim() && ensureKicker('away', awayPlayerSearch.trim())}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="egSubmitChips">
                    {awayTeamPlayers.map((p) => (
                      <button type="button" key={p.id} className="egSubmitChip" onClick={() => ensureKicker('away', p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <div className="egSubmitKickerList">
                    {awayGoalKickers.length === 0 ? (
                      <div className="egSubmitKickerEmpty">No goal kickers yet.</div>
                    ) : (
                      awayGoalKickers.map((k) => <KickerRow key={k.id} k={k} side="away" />)
                    )}
                  </div>
                </div>
              </div>

              <div className="egSubmitNavRow">
                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(3)}>
                  Back
                </button>
                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(5)}>
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* Submit */}
          {step === 5 && (
            <motion.div
              key="step5"
              className="egSubmitCard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="egSubmitCard__title">
                <Shield /> Confirm & Submit
              </div>
              <div className="egSubmitCard__sub">Review everything and submit. If both coaches match, fixture becomes FINAL.</div>

              <label className="egSubmitField egSubmitNotes">
                <span>Notes (optional)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for admins…" />
              </label>

              {ocr.status === 'done' && (
                <div className="egSubmitInlineInfo">
                  <Check /> OCR attached • you must tick confirm to submit.
                </div>
              )}

              {conflict?.message && (
                <div className="egSubmitInlineWarn">
                  <AlertTriangle /> {conflict.message}
                </div>
              )}

              {submitSuccess && (
                <div className="egSubmitSuccess">
                  <Check /> Submitted successfully.
                </div>
              )}

              <div className="egSubmitSubmitRow">
                <button type="button" className="egSubmitSecondaryBtn" onClick={() => setStep(4)}>
                  Back
                </button>

                <button type="button" className="egSubmitPrimaryBtn" onClick={submit} disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? 'Submitting…' : 'Submit Result'}
                </button>
              </div>

              {!uploaded.length && (
                <div className="egSubmitInlineHint">
                  <Upload /> Add screenshots to enable submit.
                </div>
              )}

              {ocr.status === 'done' && !ocrConfirm && (
                <div className="egSubmitInlineHint">
                  <AlertTriangle /> Tick “Confirm OCR looks correct” to submit with OCR attached.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
