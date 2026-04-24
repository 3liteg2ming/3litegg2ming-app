export type FinalsWeek =
  | 'regular'
  | 'week1'
  | 'semi'
  | 'prelim'
  | 'grand';

export const FINALS_CONFIG = {
  enabled: true,
  week: 'week1' as FinalsWeek,
};

export const getFinalsLabel = (week: FinalsWeek, ladderPosition?: number) => {
  void ladderPosition;

  if (week === 'week1') return 'Finals Week 1';
  if (week === 'semi') return 'Semi Final';
  if (week === 'prelim') return 'Preliminary Final';
  if (week === 'grand') return 'Grand Final';
  return null;
};
