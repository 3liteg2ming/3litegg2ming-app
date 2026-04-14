import { useEffect, useState } from 'react';

/**
 * Round-specific submission deadlines (Melbourne time).
 *
 * Rounds 9 & 10 — Monday 20 April 2026, 23:59:59 AEST
 */
export const DEADLINE_R9_R10_ISO = '2026-04-20T23:59:59+10:00';

export const DEADLINE_R9_R10_MS = new Date(DEADLINE_R9_R10_ISO).getTime();

export type CountdownResult = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  label: string;
};

function computeCountdown(now: number, deadlineMs: number): CountdownResult {
  const diff = deadlineMs - now;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, label: 'Deadline passed' };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  parts.push(`${String(minutes).padStart(2, '0')}m`);
  parts.push(`${String(seconds).padStart(2, '0')}s`);

  return { days, hours, minutes, seconds, expired: false, label: parts.join(' ') };
}

/**
 * Live countdown to a round submission deadline.
 * Ticks every second and returns formatted time remaining.
 *
 * @param deadlineMs – epoch ms of the deadline (defaults to the R5/R6 deadline for backwards compat)
 */
export function useDeadlineCountdown(deadlineMs: number = DEADLINE_R9_R10_MS): CountdownResult {
  const [result, setResult] = useState(() => computeCountdown(Date.now(), deadlineMs));

  useEffect(() => {
    // Re-compute immediately if the deadline changed
    setResult(computeCountdown(Date.now(), deadlineMs));

    const id = window.setInterval(() => {
      const next = computeCountdown(Date.now(), deadlineMs);
      setResult(next);
      if (next.expired) window.clearInterval(id);
    }, 1_000);

    return () => window.clearInterval(id);
  }, [deadlineMs]);

  return result;
}
