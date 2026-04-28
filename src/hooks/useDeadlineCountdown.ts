import { useEffect, useState } from 'react';

/**
 * Season-wide submission deadline (Melbourne time).
 *
 * Set far in the future — finals are ongoing and all coaches submit normally.
 */
export const SUBMISSION_DEADLINE_ISO = '2027-12-31T23:59:59+10:00';
export const SUBMISSION_DEADLINE_LABEL = '';
export const SUBMISSION_CLOSED_LABEL = 'Submissions are currently closed.';

export const SUBMISSION_DEADLINE_MS = new Date(SUBMISSION_DEADLINE_ISO).getTime();

export function isSubmissionDeadlineClosed(nowMs: number = Date.now()) {
  return nowMs >= SUBMISSION_DEADLINE_MS;
}

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
 * @param deadlineMs – epoch ms of the submission deadline
 */
export function useDeadlineCountdown(deadlineMs: number = SUBMISSION_DEADLINE_MS): CountdownResult {
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
