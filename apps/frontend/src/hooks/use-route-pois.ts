import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RoutePoi {
  id: number;
  route_id: number;
  name: string;
  type: string; id: number;
  description: string | null;
  lat: number;
  lng: number;
  created_at: string;
}

export function useRoutePois(routeId: number | undefined) {
  return useQuery({
    queryKey: ['route-pois', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<RoutePoi[]> => {
      const { data, error } = await supabase
        .from('route_pois')
        .select('*')
        .eq('route_id', routeId!)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
