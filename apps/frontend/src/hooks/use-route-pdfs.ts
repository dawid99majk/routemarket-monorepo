import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RoutePdf {
  id: number;
  route_id: number;
  language_code: string;
  file_key: string;
  created_at: string;
}

export function useRoutePdfs(routeId: number | undefined) {
  return useQuery({
    queryKey: ['route-pdfs', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<RoutePdf[]> => {
      const { data, error } = await supabase
        .from('route_pdfs')
        .select('*')
        .eq('route_id', routeId!)
        .order('language_code');
      if (error) throw error;
      return (data ?? []) as RoutePdf[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useRoutePdfLanguages(routeIds: number[]) {
  return useQuery({
    queryKey: ['route-pdf-languages', routeIds],
    enabled: routeIds.length > 0,
    queryFn: async (): Promise<Record<number, string[]>> => {
      const { data, error } = await supabase
        .rpc('get_route_pdf_languages', { route_ids: routeIds } as any);
      if (error) throw error;
      const map: Record<number, string[]> = {};
      ((data as any[]) ?? []).forEach((r: any) => {
        if (!map[r.route_id]) map[r.route_id] = [];
        if (!map[r.route_id].includes(r.language_code)) {
          map[r.route_id].push(r.language_code);
        }
      });
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });
}
