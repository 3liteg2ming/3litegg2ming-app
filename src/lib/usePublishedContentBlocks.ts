import { useQuery } from '@tanstack/react-query';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

export type PublishedContentBlock = {
  key: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown>;
};

export function usePublishedContentBlocks(keys?: string[]) {
  return useQuery({
    queryKey: ['content-blocks', 'published', keys || []],
    staleTime: 60_000,
    gcTime: 1_200_000,
    queryFn: async () => {
      let query = supabase
        .from('eg_content_blocks')
        .select('key,title,body,payload')
        .eq('published', true)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (keys?.length) {
        query = query.in('key', keys);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return ((data || []) as PublishedContentBlock[]).map((block) => ({
        ...block,
        payload:
          block.payload && typeof block.payload === 'object' && !Array.isArray(block.payload)
            ? block.payload
            : {},
      }));
    },
  });
}
