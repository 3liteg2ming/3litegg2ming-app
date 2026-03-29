import { useEffect, useState } from 'react';

/**
 * Hard deadline: Sunday 2026-04-05 at 23:59:59 Melbourne time (AEST, UTC+10).
 * After this timestamp the countdown shows "Deadline passed".
 */
const DEADLINE_ISO = '2026-04-05T23:59:59+10:00';
const DEADLINE_MS = new Date(DEADLINE_ISO).getTime();

export type CountdownResult = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  label: string;
};

function computeCountdown(now: number): CountdownResult {
  const diff = DEADLINE_MS - now;
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
 * Live countdown to the round submission deadline.
 * Ticks every second and returns formatted time remaining.
 */
export function useDeadlineCountdown(): CountdownResult {
  const [result, setResult] = useState(() => computeCountdown(Date.now()));

  useEffect(() => {
    if (result.expired) return;

    const id = window.setInterval(() => {
      const next = computeCountdown(Date.now());
      setResult(next);
      if (next.expired) window.clearInterval(id);
    }, 1_000);

    return () => window.clearInterval(id);
  }, [result.expired]);

  return result;
}
