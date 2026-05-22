import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef } from 'react';

interface CardHighlight {
  campaignId: string;
  routeId: number;
}

/** Returns a Set of route IDs that have an active card_highlight campaign. */
export function useCardHighlights() {
  return useQuery({
    queryKey: ['card-highlights'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_campaigns' as any)
        .select('id, target_route_id')
        .eq('placement', 'card_highlight')
        .not('target_route_id', 'is', null);
      if (error) throw error;
      const highlights: CardHighlight[] = (data ?? [])
        .filter((c: any) => c.target_route_id != null)
        .map((c: any) => ({ campaignId: c.id, routeId: c.target_route_id }));
      return highlights;
    },
  });
}

/** Track impression for a promoted card. Call once per card visibility. */
export function useCardHighlightImpression(campaignId: string | undefined, userId?: string) {
  const tracked = useRef(false);
  useEffect(() => {
    if (!campaignId || tracked.current) return;
    tracked.current = true;
    supabase
      .from('campaign_events')
      .insert({ campaign_id: campaignId, event_type: 'impression', user_id: userId ?? null, metadata: {} } as any)
      .then(({ error }) => { if (error) console.warn('[card-highlight]', error.message); });
  }, [campaignId, userId]);
}
