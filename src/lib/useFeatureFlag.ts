import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  payload: Record<string, unknown> | null;
};

export function useFeatureFlag(key: string) {
  return useQuery({
    queryKey: ['feature-flag', key],
    enabled: Boolean(key),
    staleTime: 120_000,
    gcTime: 1_800_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eg_feature_flags')
        .select('key,enabled,payload')
        .eq('key', key)
        .maybeSingle();

      if (error) throw new Error(error.message);

      const row = (data || null) as FeatureFlagRow | null;
      return {
        key,
        enabled: row?.enabled ?? false,
        payload: row?.payload && typeof row.payload === 'object' ? row.payload : {},
      };
    },
  });
}
